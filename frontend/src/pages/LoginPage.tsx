import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import AuthLayout from "../components/AuthLayout";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  function validateEmail(value: string) {
    const valid = EMAIL_PATTERN.test(value.trim());
    setEmailError(valid ? null : "Informe um e-mail válido.");
    return valid;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const emailValid = validateEmail(email);
    const passwordValid = password.length > 0;
    setPasswordError(passwordValid ? null : "Informe sua senha.");
    if (!emailValid || !passwordValid) return;

    setLoading(true);
    try {
      await login(email.trim(), password);
      navigate("/");
    } catch {
      setError("Credenciais inválidas.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout>
      <div className="form-heading">
        <h1>Entrar</h1>
        <p>Entre para acompanhar suas varreduras de segurança.</p>
      </div>

      {error && <div className="form-alert" role="alert"><span className="alert-symbol">!</span><span>{error}</span></div>}

      <form onSubmit={handleSubmit} className="auth-form" noValidate>
        <div className="field">
          <label htmlFor="login-email">E-mail <span>*</span></label>
          <div className={`input-wrap ${emailError ? "input-invalid" : ""}`}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>
            <input id="login-email" type="email" autoComplete="email" placeholder="nome@empresa.com" value={email} onChange={e=>{setEmail(e.target.value); if(emailError) validateEmail(e.target.value);}} onBlur={()=>{if(email.trim()) validateEmail(email);}} aria-invalid={Boolean(emailError)} aria-describedby={emailError ? "login-email-error" : undefined} required />
          </div>
          {emailError && <p className="field-error" id="login-email-error">{emailError}</p>}
        </div>

        <div className="field">
          <label htmlFor="login-password">Senha <span>*</span></label>
          <div className={`input-wrap ${passwordError ? "input-invalid" : ""}`}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
            <input id="login-password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Digite sua senha" value={password} onChange={e=>{setPassword(e.target.value); if(passwordError) setPasswordError(e.target.value ? null : "Informe sua senha.");}} aria-invalid={Boolean(passwordError)} aria-describedby={passwordError ? "login-password-error" : undefined} required />
            <button className="visibility-button" type="button" onClick={()=>setShowPassword(v=>!v)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>
              {showPassword ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3 21 21M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c5.4 0 9 7 9 7a15 15 0 0 1-3.2 3.8M6.2 6.2C4.1 7.6 3 12 3 12s3.6 7 9 7c1 0 1.9-.2 2.7-.5"/></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z"/><circle cx="12" cy="12" r="2.5"/></svg>}
            </button>
          </div>
          {passwordError && <p className="field-error" id="login-password-error">{passwordError}</p>}
        </div>

        <button className="primary-button" type="submit" disabled={loading}>
          {loading ? <><span className="spinner"/>Entrando…</> : <>Entrar <span className="button-arrow" aria-hidden="true">→</span></>}
        </button>
      </form>

      <p className="auth-switch">Não tem conta? <Link to="/registrar">Cadastre-se</Link></p>
    </AuthLayout>
  );
}
