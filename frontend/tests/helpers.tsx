import React from "react";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "../src/context/AuthContext";
import { DomainProvider } from "../src/context/DomainContext";
import ProtectedRoute from "../src/components/ProtectedRoute";
import ScanReportPage from "../src/pages/ScanReportPage";

export const scan = {
  id: 42,
  domainId: 7,
  name: null,
  findingsCount: 0,
  hostname: "qa.example.invalid",
  status: "QUEUED" as const,
  verificationToken: null,
  createdAt: "2026-10-21T12:00:00Z",
  finishedAt: null,
  findings: [],
};

export function renderPage(page: React.ReactElement, path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider><DomainProvider>
        <Routes>
          <Route path="/" element={<h1>Painel de teste</h1>} />
          <Route path="/login" element={<h1>Login de teste</h1>} />
          <Route path="/test" element={page} />
          <Route path="/scans/:id" element={<ProtectedRoute><ScanReportPage /></ProtectedRoute>} />
        </Routes>
      </DomainProvider></AuthProvider>
    </MemoryRouter>,
  );
}
