import React from "react";
import { Link } from "react-router-dom";

/** Layout compartilhado pelas telas de autenticação do Figma. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-page">
      <header className="auth-header">
        <Link to="/login" className="brand" aria-label="WebSec Inspector — início">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M12 2.5 20 5.7v5.6c0 5.1-3.4 8.5-8 10.2-4.6-1.7-8-5.1-8-10.2V5.7L12 2.5Z" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="m8.3 11.8 2.4 2.4 5-5.2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </span>
          <span>WebSec <b>Inspector</b></span>
        </Link>
      </header>

      <div className="auth-main">
        <section className="auth-story" aria-label="Sobre o WebSec Inspector">
          <div className="security-art" aria-hidden="true" />
          <div className="story-copy">
            <h2>Segurança hoje para um amanhã mais confiável.</h2>
            <p>Monitore riscos, acompanhe varreduras e proteja o que move o seu negócio.</p>
          </div>
        </section>
        <section className="auth-panel">{children}</section>
      </div>
    </main>
  );
}
