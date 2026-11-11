import React from "react";
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test } from "vitest";
import MockAdapter from "axios-mock-adapter";
import { api } from "../../src/services/api";
import RegisterPage from "../../src/pages/RegisterPage";
import { renderPage } from "../helpers";

let http: MockAdapter;
beforeEach(() => {
  http = new MockAdapter(api, { onNoMatch: "throwException" });
  http.onGet("/domains").reply(200, []);
});
afterEach(() => http.restore());

function fillRegistration(confirmation = "test-password") {
  renderPage(<RegisterPage />, "/test");
  fireEvent.change(screen.getByLabelText(/Nome/), { target: { value: " QA " } });
  fireEvent.change(screen.getByLabelText(/E-mail/), { target: { value: "qa@example.invalid" } });
  fireEvent.change(screen.getByLabelText(/^Senha/), { target: { value: "test-password" } });
  fireEvent.change(screen.getByLabelText(/Confirmar senha/), { target: { value: confirmation } });
  return screen.getByRole("button", { name: /Cadastrar/ }).closest("form")!;
}

test("different passwords stop registration before HTTP and expose an accessible error", () => {
  const form = fillRegistration("different-password");
  fireEvent.submit(form);
  const confirmation = screen.getByLabelText(/Confirmar senha/);
  expect(confirmation).toHaveAttribute("aria-invalid", "true");
  expect(confirmation).toHaveAccessibleDescription(/senhas não coincidem/i);
  expect(http.history.post).toHaveLength(0);
  expect(localStorage.getItem("websec_token")).toBeNull();
});

test("matching passwords preserve automatic login and send only the existing API contract", async () => {
  http.onPost("/auth/register", { name: "QA", email: "qa@example.invalid", password: "test-password" })
    .reply(200, { token: "registered-token" });
  fireEvent.submit(fillRegistration());
  expect(await screen.findByRole("heading", { name: "Painel de teste" })).toBeInTheDocument();
  expect(localStorage.getItem("websec_token")).toBe("registered-token");
  expect(http.history.post).toHaveLength(1);
});

test("editing the original password invalidates a previously matching confirmation", () => {
  const form = fillRegistration();
  fireEvent.blur(screen.getByLabelText(/Confirmar senha/));
  fireEvent.change(screen.getByLabelText(/^Senha/), { target: { value: "edited-password" } });
  expect(screen.getByLabelText(/Confirmar senha/)).toHaveAttribute("aria-invalid", "true");
  fireEvent.submit(form);
  expect(http.history.post).toHaveLength(0);
  fireEvent.change(screen.getByLabelText(/Confirmar senha/), { target: { value: "edited-password" } });
  expect(screen.getByLabelText(/Confirmar senha/)).toHaveAttribute("aria-invalid", "false");
});

test("two submissions in the same render and while pending create only one HTTP request", async () => {
  let respond!: (value: [number, object]) => void;
  http.onPost("/auth/register").reply(() => new Promise(resolve => { respond = resolve; }));
  const form = fillRegistration();
  await act(async () => {
    fireEvent.submit(form);
    fireEvent.submit(form);
  });
  expect(screen.getByRole("button", { name: /Cadastrando/ })).toBeDisabled();
  fireEvent.submit(form);
  expect(http.history.post).toHaveLength(1);
  await act(async () => { respond([200, { token: "one-token" }]); });
  expect(await screen.findByRole("heading", { name: "Painel de teste" })).toBeInTheDocument();
});

test.each([
  [400, { error: "E-mail já cadastrado" }],
  [409, { code: "EMAIL_ALREADY_REGISTERED", error: "private SQL details" }],
])("duplicate registration (%s) gives safe guidance and allows another attempt", async (status, body) => {
  http.onPost("/auth/register").reply(status, body);
  fireEvent.submit(fillRegistration());
  expect(await screen.findByRole("alert")).toHaveTextContent(/e-mail já cadastrado.*entrar/i);
  expect(screen.getByRole("alert")).not.toHaveTextContent("private SQL details");
  expect(screen.getByRole("button", { name: /Cadastrar/ })).toBeEnabled();
  expect(localStorage.getItem("websec_token")).toBeNull();
  http.onPost("/auth/register").reply(200, { token: "retried-token" });
  fireEvent.click(screen.getByRole("button", { name: /Cadastrar/ }));
  expect(await screen.findByRole("heading", { name: "Painel de teste" })).toBeInTheDocument();
});

test("offline registration reports connection failure without authenticating", async () => {
  http.onPost("/auth/register").networkError();
  fireEvent.submit(fillRegistration());
  expect(await screen.findByRole("alert")).toHaveTextContent(/conectar.*conexão/i);
  expect(localStorage.getItem("websec_token")).toBeNull();
});

test.each([400, 409, 503])("unexpected HTTP %s never echoes backend details", async status => {
  http.onPost("/auth/register").reply(status, { error: "private SQL details" });
  fireEvent.submit(fillRegistration());
  const alert = await screen.findByRole("alert");
  expect(alert).not.toHaveTextContent("private SQL details");
  expect(alert).toHaveTextContent(status >= 500 ? /indisponível/i : /revise/i);
  expect(localStorage.getItem("websec_token")).toBeNull();
});
