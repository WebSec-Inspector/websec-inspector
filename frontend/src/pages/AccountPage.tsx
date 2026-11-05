import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import emailIcon from "../assets/figma/email.svg";
import lockIcon from "../assets/figma/lock.svg";

function roleLabel(role: string) {
  if (role === "ADMINISTRADOR") return "ADMIN";
  if (role === "GERENTE") return "GERENTE";
  return "CLIENTE";
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase("pt-BR"))
    .join("");
}

function ReadonlyField({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: string;
}) {
  return (
    <label className="account-field">
      <span>{label}</span>
      <div className="account-field__value">
        {icon && <img src={icon} alt="" aria-hidden="true" />}
        <input aria-label={label} value={value} readOnly />
        <img src={lockIcon} alt="" aria-hidden="true" />
      </div>
      <small><img src={lockIcon} alt="" aria-hidden="true" /> Somente leitura</small>
    </label>
  );
}

export default function AccountPage() {
  const { currentUser, currentUserLoading, currentUserError, refreshCurrentUser, logout } = useAuth();
  if (currentUserLoading) return <div className="page-message" role="status">Carregando sua conta…</div>;

  if (currentUserError || !currentUser) {
    return (
      <section className="page-message page-message--error" role="alert">
        <h1>Não foi possível carregar sua conta</h1>
        <p>Confira sua conexão e tente novamente.</p>
        <button type="button" className="button button--secondary" onClick={refreshCurrentUser}>
          Tentar novamente
        </button>
      </section>
    );
  }

  const returnTo = currentUser.role === "ADMINISTRADOR" ? "/admin" : "/";
  return (
    <section className="page-view account-view">
      <div className="page-breadcrumb">
        <Link to={returnTo}>{currentUser.role === "ADMINISTRADOR" ? "Administração" : "Início"}</Link>
        <span aria-hidden="true">›</span>
        <span>Minha conta</span>
      </div>
      <header className="page-heading">
        <h1>Minha conta</h1>
        <p>Consulte seus dados e seu perfil de acesso.</p>
      </header>

      <section className="account-card" aria-labelledby="account-heading">
        <div className="account-card__identity">
          <span className="account-avatar" aria-hidden="true">{initials(currentUser.name)}</span>
          <div>
            <h2 id="account-heading">{currentUser.name}</h2>
            <p>Somente leitura</p>
          </div>
          <span className="role-badge">{roleLabel(currentUser.role)}</span>
        </div>

        <div className="account-fields">
          <ReadonlyField label="Nome" value={currentUser.name} />
          <ReadonlyField label="E-mail" value={currentUser.email} icon={emailIcon} />
          <ReadonlyField label="Perfil de acesso" value={roleLabel(currentUser.role)} />
        </div>

        <div className="account-actions">
          <Link to={returnTo} className="button button--outline">Voltar</Link>
          <span className="account-actions__spacer" />
          <button type="button" className="button button--quiet" onClick={logout}>Sair</button>
          <button type="button" className="button button--disabled" disabled>Editar</button>
        </div>
      </section>
    </section>
  );
}
