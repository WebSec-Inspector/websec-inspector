import React from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import MockAdapter from "axios-mock-adapter";
import { api } from "../../src/services/api";
import ScanListPage from "../../src/pages/ScanListPage";
import * as scanList from "../../src/services/scanList";
import { renderPage } from "../helpers";

const mock = new MockAdapter(api);
const row = (id: number, severity: string | null = null) => ({
  id, domainId: 7, hostname: "list.example.invalid", name: `Execução ${id}`, status: "COMPLETED",
  createdAt: "2026-10-31T12:00:00Z", finishedAt: null, findingsCount: severity ? 1 : 0,
  maxSeverity: severity, domainActive: false,
});
const page = (content: unknown[], number = 0, totalElements = content.length) => ({
  content, page: number, size: 20, totalElements, totalPages: Math.ceil(totalElements / 20),
});
beforeEach(() => {
  mock.reset();
  mock.onGet("/domains").reply(200, []);
});

it("pages on the server, shows metadata and resets page on status changes", async () => {
  const queries: unknown[] = [];
  mock.onGet("/scans").reply(config => {
    queries.push(config.params);
    return [200, config.params.status ? page([row(3, "INFORMATIONAL")]) :
      page([row(config.params.page === 1 ? 2 : 1, config.params.page === 1 ? null : "CRITICAL")], config.params.page, 21)];
  });
  renderPage(<ScanListPage />, "/test");
  expect(await screen.findByRole("link", {name: "Execução 1"})).toHaveAttribute("href", "/scans/1");
  expect(screen.getByText("Crítico")).toBeInTheDocument();
  expect(screen.getByText("Domínio arquivado")).toBeInTheDocument();
  expect(screen.getByRole("button", {name: "Anterior"})).toBeDisabled();
  fireEvent.click(screen.getByRole("button", {name: "Próxima"}));
  expect(await screen.findByRole("link", {name: "Execução 2"})).toBeInTheDocument();
  expect(screen.getByText("Sem achados")).toBeInTheDocument();
  expect(screen.getByRole("button", {name: "Próxima"})).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Status"), {target: {value: "COMPLETED"}});
  expect(await screen.findByRole("link", {name: "Execução 3"})).toBeInTheDocument();
  expect(screen.getByText("Informativo")).toBeInTheDocument();
  expect(queries).toEqual([{page: 0, size: 20}, {page: 1, size: 20}, {page: 0, size: 20, status: "COMPLETED"}]);
});

it("ignores an older response and aborts it when a new filter is chosen", async () => {
  let resolveOld!: (value: [number, unknown]) => void;
  let oldSignal: AbortSignal | undefined;
  mock.onGet("/scans").replyOnce(config => {
    oldSignal = config.signal as AbortSignal;
    return new Promise(resolve => { resolveOld = resolve; });
  });
  mock.onGet("/scans").reply(200, page([row(20)]));
  renderPage(<ScanListPage />, "/test");
  await waitFor(() => expect(resolveOld).toBeDefined());
  expect(screen.getByText("Carregando varreduras…")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Status"), {target: {value: "FAILED"}});
  expect(await screen.findByRole("link", {name: "Execução 20"})).toBeInTheDocument();
  expect(oldSignal?.aborted).toBe(true);
  await act(async () => { resolveOld([200, page([row(99)])]); });
  expect(screen.queryByRole("link", {name: "Execução 99"})).not.toBeInTheDocument();
  expect(screen.getByRole("link", {name: "Execução 20"})).toBeInTheDocument();
});

it("clears old rows while loading and on errors, then retries into an empty result", async () => {
  mock.onGet("/scans").replyOnce(200, page([row(1)], 0, 21));
  let fail!: (value: [number, unknown]) => void;
  mock.onGet("/scans").replyOnce(() => new Promise(resolve => { fail = resolve; }));
  mock.onGet("/scans").reply(200, page([]));
  renderPage(<ScanListPage />, "/test");
  await screen.findByRole("link", {name: "Execução 1"});
  fireEvent.click(screen.getByRole("button", {name: "Próxima"}));
  expect(screen.queryByRole("link", {name: "Execução 1"})).not.toBeInTheDocument();
  await waitFor(() => expect(fail).toBeDefined());
  await act(async () => { fail([500, {error: "Falha temporária"}]); });
  expect(await screen.findByRole("alert")).toHaveTextContent("Falha temporária");
  fireEvent.click(screen.getByRole("button", {name: "Tentar novamente"}));
  expect(await screen.findByText("Nenhuma varredura encontrada para estes filtros.")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("rejects malformed summary data with a recoverable error", async () => {
  mock.onGet("/scans").reply(200, page([{...row(1), maxSeverity: "UNKNOWN"}]));
  renderPage(<ScanListPage />, "/test");
  expect(await screen.findByRole("alert")).toHaveTextContent("formato esperado");
});

it("discards late responses even when a transport ignores cancellation", async () => {
  let resolveOld!: (value: scanList.ScanListResult) => void;
  vi.spyOn(scanList, "getScans")
    .mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
    .mockResolvedValueOnce(page([row(20)]) as scanList.ScanListResult);
  renderPage(<ScanListPage />, "/test");
  await waitFor(() => expect(resolveOld).toBeDefined());
  fireEvent.change(screen.getByLabelText("Status"), {target: {value: "COMPLETED"}});
  expect(await screen.findByRole("link", {name: "Execução 20"})).toBeInTheDocument();
  await act(async () => { resolveOld(page([row(99)]) as scanList.ScanListResult); });
  expect(screen.queryByRole("link", {name: "Execução 99"})).not.toBeInTheDocument();
  expect(screen.getByRole("link", {name: "Execução 20"})).toBeInTheDocument();
});

it("discards late errors without replacing the current filtered result", async () => {
  let rejectOld!: (reason: unknown) => void;
  vi.spyOn(scanList, "getScans")
    .mockImplementationOnce(() => new Promise((_, reject) => { rejectOld = reject; }))
    .mockResolvedValueOnce(page([row(20)]) as scanList.ScanListResult);
  renderPage(<ScanListPage />, "/test");
  await waitFor(() => expect(rejectOld).toBeDefined());
  fireEvent.change(screen.getByLabelText("Status"), {target: {value: "COMPLETED"}});
  expect(await screen.findByRole("link", {name: "Execução 20"})).toBeInTheDocument();
  await act(async () => { rejectOld({response: {status: 500, data: {error: "Erro antigo"}}}); });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByRole("link", {name: "Execução 20"})).toBeInTheDocument();
});
