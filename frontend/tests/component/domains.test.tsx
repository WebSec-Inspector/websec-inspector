import React from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import MockAdapter from "axios-mock-adapter";
import { api } from "../../src/services/api";
import MyDomainsPage from "../../src/pages/MyDomainsPage";
import { renderPage } from "../helpers";

let http: MockAdapter;
const domain = {
  id: 17,
  hostname: "qa.example.invalid",
  verified: false,
  verifiedAt: null,
  isActive: true,
};

beforeEach(() => {
  localStorage.setItem("websec_token", "domains-test-token");
  http = new MockAdapter(api, { onNoMatch: "throwException" });
  http.onGet("/domains").reply(200, [domain]);
});

afterEach(() => {
  http.restore();
  vi.restoreAllMocks();
});

describe("Meus domínios", () => {
  test("cadastra domínio sem criar scan e apresenta instruções do token", async () => {
    http.onPost("/domains").reply(201, {
      ...domain,
      hostname: "new.example.invalid",
      verificationToken: "websec-verify-new-domain",
    });
    renderPage(<MyDomainsPage />, "/test");

    fireEvent.change(await screen.findByLabelText("Domínio ou URL"), {
      target: { value: "https://new.example.invalid/path" },
    });
    fireEvent.submit(screen.getByLabelText("Domínio ou URL").closest("form")!);

    expect(await screen.findByText("websec-verify-new-domain")).toBeInTheDocument();
    expect(JSON.parse(http.history.post.find((request) => request.url === "/domains")!.data)).toEqual({
      hostname: "https://new.example.invalid/path",
      targetUserId: null,
    });
    expect(http.history.post.some((request) => request.url?.startsWith("/scans"))).toBe(false);
  });

  test("verificação pendente informa que nenhum scan foi enfileirado", async () => {
    http.onPost("/domains/17/verify").reply(409, {
      code: "VERIFICATION_PENDING",
      error: "Prova DNS ainda não publicada",
    });
    renderPage(<MyDomainsPage />, "/test");

    fireEvent.click(await screen.findByRole("button", { name: "Verificar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Prova DNS ainda não publicada");
    expect(screen.getByRole("alert")).toHaveTextContent("não criou nem enfileirou uma varredura");
    expect(http.history.post.some((request) => request.url?.startsWith("/scans"))).toBe(false);
  });

  test("arquiva após confirmação e trata conflito 409 sem ocultar o domínio", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    http.onDelete("/domains/17").reply(409, {
      error: "Uma varredura está em andamento",
    });
    renderPage(<MyDomainsPage />, "/test");

    fireEvent.click(await screen.findByRole("button", { name: "Arquivar" }));

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining(domain.hostname));
    expect(await screen.findByRole("alert")).toHaveTextContent("Uma varredura está em andamento");
    expect(screen.getByRole("heading", { name: domain.hostname })).toBeInTheDocument();
  });
});
