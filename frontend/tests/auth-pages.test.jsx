import React from "react";
import { act, create } from "react-test-renderer";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import LoginPage from "../src/pages/LoginPage";
import RegisterPage from "../src/pages/RegisterPage";

const auth = vi.hoisted(() => ({ login: vi.fn(), register: vi.fn() }));
vi.mock("../src/context/AuthContext", () => ({ useAuth: () => auth }));
beforeEach(() => { auth.login.mockReset(); auth.register.mockReset(); });

it("restores the login layout, password toggle and invalid-email feedback", async () => {
  let view;
  await act(async () => { view = create(<MemoryRouter><LoginPage /></MemoryRouter>); });
  expect(view.root.findAllByProps({ className: "security-art" }).length).toBeGreaterThan(0);
  const password = () => view.root.findByProps({ id: "login-password" });
  expect(password().props.type).toBe("password");
  await act(async () => { view.root.findByProps({ "aria-label": "Mostrar senha" }).props.onClick(); });
  expect(password().props.type).toBe("text");
  await act(async () => { view.root.findByProps({ id: "login-email" }).props.onChange({ target: { value: "invalid" } }); });
  await act(async () => { await view.root.findByType("form").props.onSubmit({ preventDefault() {} }); });
  expect(auth.login).not.toHaveBeenCalled();
  expect(view.root.findByProps({ id: "login-email-error" }).children.join("")).toContain("válido");
  await act(async () => { view.unmount(); });
});

it("validates registration and disables submission while the request is pending", async () => {
  let view;
  await act(async () => { view = create(<MemoryRouter><RegisterPage /></MemoryRouter>); });
  await act(async () => { await view.root.findByType("form").props.onSubmit({ preventDefault() {} }); });
  expect(auth.register).not.toHaveBeenCalled();
  for (const [id, value] of [["register-name", " Ana "], ["register-email", " ana@example.com "], ["register-password", "12345678"]]) {
    await act(async () => { view.root.findByProps({ id }).props.onChange({ target: { value } }); });
  }
  let resolve;
  auth.register.mockImplementation(() => new Promise(done => { resolve = done; }));
  let request;
  await act(async () => { request = view.root.findByType("form").props.onSubmit({ preventDefault() {} }); });
  expect(auth.register).toHaveBeenCalledWith("Ana", "ana@example.com", "12345678");
  expect(view.root.findByProps({ type: "submit" }).props.disabled).toBe(true);
  await act(async () => { resolve(); await request; });
  expect(view.root.findByProps({ type: "submit" }).props.disabled).toBe(false);
  await act(async () => { view.unmount(); });
});
