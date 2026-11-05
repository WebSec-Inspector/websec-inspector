import React, { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import houseIcon from "../assets/figma/house.svg";
import scanIcon from "../assets/figma/scan-line.svg";
import logoutIcon from "../assets/figma/logout.svg";
import chevronDownIcon from "../assets/figma/chevron-down.svg";

type AppShellProps = {
  children: React.ReactNode;
  mode?: "user" | "admin";
};

const userNavigation = [
  { label: "Início", to: "/", icon: houseIcon, end: true },
  { label: "Nova varredura", to: "/scans/novo", icon: scanIcon },
];

const adminNavigation = [
  { label: "Visão geral", to: "/admin", icon: houseIcon, end: true },
  { label: "Usuários", to: "/admin/usuarios", icon: scanIcon },
  { label: "Perfis de acesso", to: "/admin/perfis", icon: scanIcon },
  { label: "Scans", to: "/admin/scans", icon: scanIcon },
  { label: "Histórico", to: "/admin/historico", icon: scanIcon },
];

function Brand() {
  return (
    <Link to="/" className="app-brand" aria-label="WebSec Inspector, início">
      <span className="app-brand__mark" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M12 2.5 20 5.7v5.6c0 5.1-3.4 8.5-8 10.2-4.6-1.7-8-5.1-8-10.2V5.7L12 2.5Z" />
          <path d="m8.3 11.8 2.4 2.4 5-5.2" />
        </svg>
      </span>
      <span>WebSec <b>Inspector</b></span>
    </Link>
  );
}

export default function AppShell({ children, mode = "user" }: AppShellProps) {
  const { currentUser, logout } = useAuth();
  const location = useLocation();
  const [accountOpen, setAccountOpen] = useState(false);
  const navigation = mode === "admin" ? adminNavigation : userNavigation;

  useEffect(() => setAccountOpen(false), [location.pathname]);

  return (
    <div className={"app-shell app-shell--" + mode}>
      <header className="app-header">
        <Brand />
        <div className="app-account">
          <button
            type="button"
            className="app-account__trigger"
            aria-haspopup="menu"
            aria-expanded={accountOpen}
            onClick={() => setAccountOpen((open) => !open)}
          >
            <span>{currentUser?.name || "Minha conta"}</span>
            <img src={chevronDownIcon} alt="" aria-hidden="true" />
          </button>
          {accountOpen && (
            <div className="app-account__menu" role="menu">
              <div className="app-account__identity">
                <strong>{currentUser?.name || "Conta WebSec"}</strong>
                <span>{currentUser?.email || "Perfil autenticado"}</span>
              </div>
              <Link to="/conta" role="menuitem">
                Minha conta
              </Link>
              <button type="button" role="menuitem" onClick={logout}>
                <img src={logoutIcon} alt="" aria-hidden="true" />
                Sair
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="app-shell__body">
        <aside className="app-sidebar" aria-label={mode === "admin" ? "Navegação administrativa" : "Navegação principal"}>
          {mode === "admin" && (
            <div className="app-sidebar__context">
              <span>Administração</span>
              <small>A validar</small>
            </div>
          )}
          <nav className="app-nav">
            {navigation.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => "app-nav__link" + (isActive ? " is-active" : "")}
              >
                <img src={item.icon} alt="" aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
          {mode === "admin" && (
            <div className="app-sidebar__footer">
              <Link to="/" className="app-nav__return">
                Voltar ao dashboard
              </Link>
            </div>
          )}
        </aside>
        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}
