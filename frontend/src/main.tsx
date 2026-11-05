import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./index.css";
import { AuthProvider } from "./context/AuthContext";
import { DomainProvider } from "./context/DomainContext";
import ProtectedRoute from "./components/ProtectedRoute";
import AppShell from "./components/AppShell";
import AdminArea from "./components/AdminArea";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/DashboardPage";
import SubmitScanPage from "./pages/SubmitScanPage";
import ScanReportPage from "./pages/ScanReportPage";
import VerificationTokenPage from "./pages/VerificationTokenPage";
import MyDomainsPage from "./pages/MyDomainsPage";
import ScanComparisonPage from "./pages/ScanComparisonPage";
import AccountPage from "./pages/AccountPage";
import {
  AdminHistoryPage,
  AdminOverviewPage,
  AdminProfilesPage,
  AdminScansPage,
  AdminUsersPage,
} from "./pages/AdminPages";
import { useAuth } from "./context/AuthContext";
import "./dashboard.css";

function AccountRoute() {
  const { currentUser } = useAuth();
  return (
    <AppShell mode={currentUser?.role === "ADMINISTRADOR" ? "admin" : "user"}>
      <AccountPage />
    </AppShell>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <DomainProvider>
          <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/registrar" element={<RegisterPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppShell>
                  <DashboardPage />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/scans/novo"
            element={
              <ProtectedRoute>
                <AppShell>
                  <SubmitScanPage />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route path="/dominios" element={<ProtectedRoute><AppShell><MyDomainsPage /></AppShell></ProtectedRoute>} />
          <Route path="/comparar" element={<ProtectedRoute><AppShell><ScanComparisonPage /></AppShell></ProtectedRoute>} />
          <Route path="/verificacao/token" element={<ProtectedRoute><AppShell><VerificationTokenPage /></AppShell></ProtectedRoute>} />
          <Route
            path="/scans/:id"
            element={
              <ProtectedRoute>
                <AppShell>
                  <ScanReportPage />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route path="/conta" element={<ProtectedRoute><AccountRoute /></ProtectedRoute>} />
          <Route path="/admin" element={<AdminArea />}>
            <Route index element={<AdminOverviewPage />} />
            <Route path="usuarios" element={<AdminUsersPage />} />
            <Route path="perfis" element={<AdminProfilesPage />} />
            <Route path="scans" element={<AdminScansPage />} />
            <Route path="historico" element={<AdminHistoryPage />} />
            <Route path="conta" element={<AccountPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </DomainProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
