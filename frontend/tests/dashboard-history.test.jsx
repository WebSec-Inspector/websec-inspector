import React from "react";
import { act, create } from "react-test-renderer";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import DashboardPage from "../src/pages/DashboardPage";

const state = vi.hoisted(() => ({ domainId: 1, getHistory: vi.fn() }));
vi.mock("../src/context/AuthContext", () => ({ useAuth: () => ({ logout() {} }) }));
vi.mock("../src/context/DomainContext", () => ({
  useDomains: () => ({
    domains: [{ id: 1, hostname: "a.example", verified: true }, { id: 2, hostname: "b.example", verified: true }],
    activeDomainId: state.domainId,
    activeDomain: { hostname: state.domainId === 1 ? "a.example" : "b.example", verified: true },
    loading: false, error: null, refresh() {}, selectDomain() {},
  }),
}));
vi.mock("../src/services/api", () => ({ getDomainHistory: (...args) => state.getHistory(...args) }));

beforeEach(() => { state.domainId = 1; state.getHistory.mockReset(); });

it("hides domain A history while domain B is loading", async () => {
  state.getHistory.mockResolvedValueOnce([{ id: 101, status: "COMPLETED", createdAt: "", findings: [] }]);
  let resolveB;
  state.getHistory.mockImplementationOnce(() => new Promise(resolve => { resolveB = resolve; }));
  let view;
  const page = () => <MemoryRouter><DashboardPage /></MemoryRouter>;
  await act(async () => { view = create(page()); });
  expect(JSON.stringify(view.toJSON())).toContain("101");
  state.domainId = 2;
  await act(async () => { view.update(page()); });
  expect(JSON.stringify(view.toJSON())).not.toContain("/scans/101");
  await act(async () => { resolveB([{ id: 202, status: "COMPLETED", createdAt: "", findings: [] }]); });
  expect(JSON.stringify(view.toJSON())).toContain("/scans/202");
  await act(async () => { view.unmount(); });
});
