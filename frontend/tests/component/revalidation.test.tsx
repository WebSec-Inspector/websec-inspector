import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, screen } from "@testing-library/react";
import MockAdapter from "axios-mock-adapter";
import { api } from "../../src/services/api";
import DashboardPage from "../../src/pages/DashboardPage";
import { renderPage, scan } from "../helpers";

let http: MockAdapter;
const domain = { id: 7, hostname: "qa.example.invalid", verified: true, verifiedAt: "2026-10-21T12:00:00Z" };
beforeEach(() => {
  localStorage.setItem("websec_token", "qa-token");
  http = new MockAdapter(api, { onNoMatch: "throwException" });
  http.onGet("/domains").reply(200, []);
});
afterEach(() => { http.restore(); vi.useRealTimers(); });

test("REG-01: PENDING_VERIFICATION continua polling até COMPLETED", async () => {
  http.onGet("/scans/42").replyOnce(200, { ...scan, status: "PENDING_VERIFICATION", verificationToken: "websec-verify-qa" });
  http.onGet("/scans/42").reply(200, { ...scan, status: "COMPLETED" });
  vi.useFakeTimers();
  renderPage(<div />, "/scans/42");
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(screen.getByText("Aguardando verificação")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Concluir verificação do domínio" })).toHaveAttribute("href", "/scans/novo?scan=42");
  await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
  expect(screen.getByText("Nenhuma vulnerabilidade encontrada")).toBeInTheDocument();
});

test("REG-02: FAILED informa falha e oferece nova execução", async () => {
  http.onGet("/scans/42").reply(200, { ...scan, status: "FAILED" });
  renderPage(<div />, "/scans/42");
  expect(await screen.findByText("Falhou")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Executar nova varredura" })).toBeInTheDocument();
  expect(screen.queryByText("Aguardando conclusão da varredura...")).not.toBeInTheDocument();
});

test("REG-03: Dashboard usa domainId da API e apresenta o histórico retornado", async () => {
  localStorage.setItem("websec_active_domain_id", "999");
  http.onGet("/domains").reply(200, [domain]);
  http.onGet("/scans/domain/7/history").reply(200, [{ ...scan, status: "COMPLETED" }]);
  renderPage(<DashboardPage />, "/test");
  expect(await screen.findByRole("link", { name: /Varredura #42/ })).toHaveAttribute("href", "/scans/42");
  expect(screen.getByText("Histórico de qa.example.invalid")).toBeInTheDocument();
  expect(http.history.get.map(r => r.url)).toContain("/scans/domain/7/history");
  expect(http.history.get.map(r => r.url)).not.toContain("/scans/domain/999/history");
});

test.each([
  ["REG-04", "backend indisponível", "network"],
  ["REG-05", "timeout", "timeout"],
  ["REG-06", "HTTP 500", 500],
  ["REG-07", "scan inexistente HTTP 404", 404],
])("%s: %s encerra loading e informa erro", async (_id, _label, response) => {
  const route = http.onGet("/scans/42");
  if (response === "network") route.networkError();
  else if (response === "timeout") route.timeout();
  else route.reply(response as number, { error: "Falha controlada de QA" });
  vi.useFakeTimers();
  renderPage(<div />, "/scans/42");
  await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
  expect(screen.getByRole("alert")).toBeInTheDocument();
  expect(screen.queryByText("Carregando resultado da varredura...")).not.toBeInTheDocument();
});

test("REG-08: corpo sem domainId produz erro controlado", async () => {
  http.onGet("/scans/42").reply(200, { id: 42, status: "COMPLETED", findings: [] });
  vi.useFakeTimers();
  renderPage(<div />, "/scans/42");
  await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
  expect(screen.getByRole("alert")).toBeInTheDocument();
});

test("REG-09: findings nulo é normalizado sem crash", async () => {
  http.onGet("/scans/42").reply(200, { ...scan, status: "COMPLETED", findings: null });
  renderPage(<div />, "/scans/42");
  expect(await screen.findByText("Nenhuma vulnerabilidade encontrada")).toBeInTheDocument();
});

test("DASH-01: histórico vazio tem mensagem própria", async () => {
  http.onGet("/domains").reply(200, [domain]);
  http.onGet("/scans/domain/7/history").reply(200, []);
  renderPage(<DashboardPage />, "/test");
  expect(await screen.findByText("Nenhuma varredura neste domínio")).toBeInTheDocument();
});

test("DASH-02: domínio pendente mostra orientação de verificação", async () => {
  http.onGet("/domains").reply(200, [{ ...domain, verified: false, verifiedAt: null }]);
  http.onGet("/scans/domain/7/history").reply(200, []);
  renderPage(<DashboardPage />, "/test");
  expect(await screen.findByText("Conclua a verificação de propriedade para executar a primeira varredura.")).toBeInTheDocument();
});

test("DASH-03: falha do histórico tem alerta e recuperação", async () => {
  http.onGet("/domains").reply(200, [domain]);
  http.onGet("/scans/domain/7/history").reply(500, { error: "Histórico indisponível" });
  renderPage(<DashboardPage />, "/test");
  expect(await screen.findByRole("alert")).toHaveTextContent("Histórico indisponível");
  expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
});
