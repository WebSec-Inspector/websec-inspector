import React from "react";
import { beforeEach, afterEach, describe, expect, test } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import MockAdapter from "axios-mock-adapter";
import { api } from "../../src/services/api";
import LoginPage from "../../src/pages/LoginPage";
import RegisterPage from "../../src/pages/RegisterPage";
import DashboardPage from "../../src/pages/DashboardPage";
import ProtectedRoute from "../../src/components/ProtectedRoute";
import { renderPage } from "../helpers";

let http: MockAdapter;
beforeEach(() => { http = new MockAdapter(api, { onNoMatch: "throwException" }); http.onGet("/domains").reply(200, []); });
afterEach(() => http.restore());

describe("Autenticação — componentes reais, transporte HTTP simulado", () => {
  test("AUTH-UI-01: bloqueia acesso direto sem token", async () => {
    renderPage(<ProtectedRoute><DashboardPage /></ProtectedRoute>, "/test");
    expect(await screen.findByRole("heading", { name: "Login de teste" })).toBeInTheDocument();
  });

  test("AUTH-UI-02: valida campos vazios no login", () => {
    renderPage(<LoginPage />, "/test");
    fireEvent.click(screen.getByRole("button", { name: /Entrar/ }));
    expect(screen.getByText("Informe um e-mail válido.")).toBeInTheDocument();
    expect(screen.getByText("Informe sua senha.")).toBeInTheDocument();
  });

  test("AUTH-UI-03: login válido guarda token e navega", async () => {
    http.onPost("/auth/login", { email: "qa@example.invalid", password: "test-password" }).reply(200, { token: "qa-token" });
    renderPage(<LoginPage />, "/test");
    fireEvent.change(screen.getByLabelText(/E-mail/), { target: { value: "qa@example.invalid" } });
    fireEvent.change(screen.getByLabelText(/^Senha/), { target: { value: "test-password" } });
    fireEvent.click(screen.getByRole("button", { name: /Entrar/ }));
    expect(await screen.findByRole("heading", { name: "Painel de teste" })).toBeInTheDocument();
    expect(localStorage.getItem("websec_token")).toBe("qa-token");
  });

  test("AUTH-UI-04: credencial inválida mostra mensagem e não autentica", async () => {
    http.onPost("/auth/login").reply(401, { error: "Credenciais inválidas" });
    renderPage(<LoginPage />, "/test");
    fireEvent.change(screen.getByLabelText(/E-mail/), { target: { value: "qa@example.invalid" } });
    fireEvent.change(screen.getByLabelText(/^Senha/), { target: { value: "incorrect" } });
    fireEvent.click(screen.getByRole("button", { name: /Entrar/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Credenciais inválidas.");
    expect(localStorage.getItem("websec_token")).toBeNull();
  });

  test("AUTH-UI-05: cadastro rejeita nome vazio, e-mail inválido e senha curta", () => {
    renderPage(<RegisterPage />, "/test");
    fireEvent.click(screen.getByRole("button", { name: /Cadastrar/ }));
    expect(screen.getByText("Informe seu nome.")).toBeInTheDocument();
    expect(screen.getByText("Informe um e-mail válido.")).toBeInTheDocument();
    expect(screen.getByText("Use pelo menos 8 caracteres.")).toBeInTheDocument();
  });

  test("AUTH-UI-06: cadastro válido autentica e navega", async () => {
    http.onPost("/auth/register", { name: "QA", email: "qa@example.invalid", password: "test-password" }).reply(200, { token: "registered-token" });
    renderPage(<RegisterPage />, "/test");
    fireEvent.change(screen.getByLabelText(/Nome/), { target: { value: "QA" } });
    fireEvent.change(screen.getByLabelText(/E-mail/), { target: { value: "qa@example.invalid" } });
    fireEvent.change(screen.getByLabelText(/^Senha/), { target: { value: "test-password" } });
    fireEvent.click(screen.getByRole("button", { name: /Cadastrar/ }));
    expect(await screen.findByRole("heading", { name: "Painel de teste" })).toBeInTheDocument();
    expect(localStorage.getItem("websec_token")).toBe("registered-token");
  });

  test("AUTH-UI-07: logout remove credenciais e bloqueia painel", async () => {
    localStorage.setItem("websec_token", "qa-token");
    renderPage(<ProtectedRoute><DashboardPage /></ProtectedRoute>, "/test");
    fireEvent.click(screen.getByRole("button", { name: "Sair" }));
    expect(await screen.findByRole("heading", { name: "Login de teste" })).toBeInTheDocument();
    expect(localStorage.getItem("websec_token")).toBeNull();
  });
});
