import React from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import MockAdapter from "axios-mock-adapter";
import { api, getScan } from "../../src/services/api";
import SubmitScanPage from "../../src/pages/SubmitScanPage";
import DashboardPage from "../../src/pages/DashboardPage";
import ProtectedRoute from "../../src/components/ProtectedRoute";
import { renderPage, scan } from "../helpers";

let http: MockAdapter;
beforeEach(() => { http = new MockAdapter(api, { onNoMatch: "throwException" }); http.onGet("/domains").reply(200, []); });
afterEach(() => { http.restore(); vi.useRealTimers(); });

async function openVerification() {
  http.onPost("/scans", { url: "https://qa.example.invalid/" }).reply(200, {
    ...scan, status: "PENDING_VERIFICATION", verificationToken: "websec-verify-qa",
  });
  renderPage(<SubmitScanPage />, "/test");
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "www.qa.example.invalid" } });
  fireEvent.submit(screen.getByRole("textbox").closest("form")!);
  await screen.findByText("websec-verify-qa");
}

describe("Scans — interface real e respostas HTTP controladas", () => {
  test.each([
    ["https://WWW.WWW.QA.EXAMPLE.INVALID/path", "https://www.www.qa.example.invalid/path"],
    ["https://WWW.QA.EXAMPLE.INVALID./path", "https://qa.example.invalid/path"],
  ])("normalizacao preserva subdominio e chave estavel: %s", async (input, expected) => {
    http.onPost("/scans").reply(200, {...scan,status:"PENDING_VERIFICATION",verificationToken:"stable-token"});
    renderPage(<SubmitScanPage />, "/test");
    fireEvent.change(screen.getByRole("textbox"), {target:{value:input}});
    fireEvent.submit(screen.getByRole("textbox").closest("form")!);
    await screen.findByText("stable-token");
    expect(JSON.parse(http.history.post[0].data).url).toBe(expected);
  });

  test("SCAN-UI-01: normaliza URL e apresenta token de propriedade", async () => {
    await openVerification();
    expect(screen.getByText("qa.example.invalid", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText(/<meta name="websec-verification"/)).toHaveTextContent("websec-verify-qa");
  });

  test("SCAN-UI-02: VERIFICATION_PENDING repete confirmação e chega ao resultado", async () => {
    localStorage.setItem("websec_token", "qa-token");
    await openVerification();
    vi.useFakeTimers();
    http.onPost("/scans/42/confirm-verification").replyOnce(409, { code: "VERIFICATION_PENDING", error: "DNS ainda pendente" });
    http.onPost("/scans/42/confirm-verification").reply(200, { ...scan, status: "QUEUED" });
    http.onGet("/scans/42").reply(200, { ...scan, status: "COMPLETED" });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Já verifiquei, iniciar varredura" })); });
    expect(screen.getByText("DNS ainda pendente")).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(screen.getByText("Nenhuma vulnerabilidade encontrada")).toBeInTheDocument();
  });

  test("SCAN-UI-03: cancelar verificação interrompe novas tentativas", async () => {
    await openVerification();
    vi.useFakeTimers();
    http.onPost("/scans/42/confirm-verification").reply(409, { code: "VERIFICATION_PENDING", error: "DNS pendente" });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Já verifiquei, iniciar varredura" })); });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar verificação automática" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(screen.queryByText("DNS pendente")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Já verifiquei, iniciar varredura" })).toBeEnabled();
    expect(http.history.post.filter(r => r.url?.includes("confirm-verification"))).toHaveLength(1);
  });

  test("SCAN-UI-04: backend indisponível na submissão produz mensagem recuperável", async () => {
    http.onPost("/scans").networkError();
    renderPage(<SubmitScanPage />, "/test");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "qa.example.invalid" } });
    fireEvent.submit(screen.getByRole("textbox").closest("form")!);
    expect(await screen.findByText(/Não foi possível conectar/)).toBeInTheDocument();
  });

  test.each(["QUEUED", "RUNNING"])("SCAN-UI-05: polling de %s chega a COMPLETED", async status => {
    localStorage.setItem("websec_token", "qa-token");
    http.onGet("/scans/42").replyOnce(200, { ...scan, status });
    http.onGet("/scans/42").reply(200, { ...scan, status: "COMPLETED", finishedAt: "2026-10-21T12:01:00Z" });
    vi.useFakeTimers();
    renderPage(<div />, "/scans/42");
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText(status === "QUEUED" ? "Na fila" : "Em execução")).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(screen.getByText("Nenhuma vulnerabilidade encontrada")).toBeInTheDocument();
  });

  test("SCAN-UI-06: renderiza achados e CVSS", async () => {
    localStorage.setItem("websec_token", "qa-token");
    http.onGet("/scans/42").reply(200, { ...scan, status: "COMPLETED", findings: [{
      id: 1, owaspCategory: "A05", description: "Cabeçalho ausente", cvssScore: 5.5, severity: "MEDIUM", recommendation: "Configurar cabeçalho",
    }] });
    renderPage(<div />, "/scans/42");
    expect(await screen.findByText("Cabeçalho ausente")).toBeInTheDocument();
    expect(screen.getByText(/CVSS 5.5/)).toHaveTextContent("Configurar cabeçalho");
  });

  test("SCAN-UI-07: API envia Bearer token e 401 encerra sessão protegida", async () => {
    localStorage.setItem("websec_token", "qa-token");
    http.onGet("/scans/42").reply(config => config.headers?.Authorization === "Bearer qa-token" ? [401, { error: "Sessão expirada" }] : [500, {}]);
    renderPage(<ProtectedRoute><DashboardPage /></ProtectedRoute>, "/test");
    await act(async () => {
      await expect(getScan(42)).rejects.toMatchObject({ response: { status: 401 } });
    });
    expect(localStorage.getItem("websec_token")).toBeNull();
    expect(screen.getByRole("heading", { name: "Login de teste" })).toBeInTheDocument();
  });
});
