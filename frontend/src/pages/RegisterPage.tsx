import React, { useRef, useState } from "react";
import { isAxiosError } from "axios";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import AuthLayout from "../components/AuthLayout";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type FieldName = "name" | "email" | "password" | "confirmation";
type FieldErrors = Partial<Record<FieldName, string>>;

function registrationError(error: unknown): string {
  if (isAxiosError(error)) {
    const status = error.response?.status;
    const body = error.response?.data;
    if ((status === 400 || status === 409) && body && typeof body === "object" &&
        (body.code === "EMAIL_ALREADY_REGISTERED" || /^E-mail já cadastrado\.?$/.test(body.error))) {
      return "E-mail já cadastrado. Use Entrar para acessar sua conta.";
    }
    if (!error.response) return "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.";
    if (status !== undefined && status >= 500) return "Cadastro temporariamente indisponível. Tente novamente em instantes.";
    if (status === 400 || status === 409 || status === 422) return "Revise os dados do cadastro e tente novamente.";
  }
  return "Não foi possível concluir o cadastro. Tente novamente.";
}

function confirmationError(value: string, password: string): string | undefined {
  if (!value) return "Confirme sua senha.";
  if (value !== password) return "As senhas não coincidem.";
}

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);
  const [showPassword, setShowPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function validateFields(): FieldErrors {
    const next: FieldErrors = {};
    if (!name.trim()) next.name = "Informe seu nome.";
    if (!EMAIL_PATTERN.test(email.trim())) next.email = "Informe um e-mail válido.";
    if (password.length < 8) next.password = "Use pelo menos 8 caracteres.";
    const mismatch = confirmationError(confirmation, password);
    if (mismatch) next.confirmation = mismatch;
    setFieldErrors(next);
    return next;
  }

  function validateField(field: FieldName, value: string) {
    let message: string | undefined;
    if (field === "name" && !value.trim()) message = "Informe seu nome.";
    if (field === "email" && !EMAIL_PATTERN.test(value.trim())) message = "Informe um e-mail válido.";
    if (field === "password" && value.length < 8) message = "Use pelo menos 8 caracteres.";
    if (field === "confirmation") message = confirmationError(value, password);
    setFieldErrors(current => ({ ...current, [field]: message }));
  }

  function changePassword(value: string) {
    setPassword(value);
    if (submitted) validateField("password", value);
    if (confirmation || submitted) {
      setFieldErrors(current => ({ ...current, confirmation: confirmationError(confirmation, value) }));
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting.current) return;
    setServerError(null);
    setSubmitted(true);
    const errors = validateFields();
    if (Object.keys(errors).length > 0) return;

    submitting.current = true;
    setLoading(true);
    try {
      await register(name.trim(), email.trim(), password);
      navigate("/");
    } catch (error) {
      setServerError(registrationError(error));
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  return (
    <AuthLayout>
      <div className="form-heading">
        <h1>Criar conta</h1>
      </div>

      {serverError && <div className="form-alert" role="alert"><span className="alert-symbol">!</span><span>{serverError}</span></div>}

      <form onSubmit={handleSubmit} className="auth-form register-form" noValidate>
        <div className="field">
          <label htmlFor="register-name">Nome <span>*</span></label>
          <div className={`input-wrap ${fieldErrors.name ? "input-invalid" : ""}`}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>
            <input id="register-name" type="text" autoComplete="name" placeholder="Seu nome" value={name} onChange={e=>{setName(e.target.value); if(submitted) validateField("name",e.target.value);}} onBlur={()=>{if(name || submitted) validateField("name",name);}} aria-invalid={Boolean(fieldErrors.name)} aria-describedby={fieldErrors.name ? "register-name-error" : undefined} required />
          </div>
          {fieldErrors.name && <p className="field-error" id="register-name-error">{fieldErrors.name}</p>}
        </div>

        <div className="field">
          <label htmlFor="register-email">E-mail <span>*</span></label>
          <div className={`input-wrap ${fieldErrors.email ? "input-invalid" : ""}`}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>
            <input id="register-email" type="email" autoComplete="email" placeholder="seuemail@empresa.com" value={email} onChange={e=>{setEmail(e.target.value); if(submitted) validateField("email",e.target.value);}} onBlur={()=>{if(email || submitted) validateField("email",email);}} aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? "register-email-error" : undefined} required />
          </div>
          {fieldErrors.email && <p className="field-error" id="register-email-error">{fieldErrors.email}</p>}
        </div>

        <div className="field">
          <label htmlFor="register-password">Senha · mínimo 8 caracteres <span>*</span></label>
          <div className={`input-wrap ${fieldErrors.password ? "input-invalid" : ""}`}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
            <input id="register-password" type={showPassword ? "text" : "password"} autoComplete="new-password" placeholder="Crie sua senha" value={password} onChange={e=>changePassword(e.target.value)} onBlur={()=>{if(password || submitted) validateField("password",password);}} aria-invalid={Boolean(fieldErrors.password)} aria-describedby={fieldErrors.password ? "register-password-error" : undefined} required minLength={8}/>
            <button className="visibility-button" type="button" onClick={()=>setShowPassword(v=>!v)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>
              {showPassword ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3 21 21M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c5.4 0 9 7 9 7a15 15 0 0 1-3.2 3.8M6.2 6.2C4.1 7.6 3 12 3 12s3.6 7 9 7c1 0 1.9-.2 2.7-.5"/></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z"/><circle cx="12" cy="12" r="2.5"/></svg>}
            </button>
          </div>
          {fieldErrors.password && <p className="field-error" id="register-password-error">{fieldErrors.password}</p>}
        </div>

        <div className="field">
          <label htmlFor="register-confirmation">Confirmar senha <span>*</span></label>
          <div className={`input-wrap ${fieldErrors.confirmation ? "input-invalid" : ""}`}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
            <input id="register-confirmation" type={showPassword ? "text" : "password"} autoComplete="new-password" placeholder="Repita sua senha" value={confirmation} onChange={e=>{setConfirmation(e.target.value); validateField("confirmation",e.target.value);}} onBlur={()=>{if(confirmation || submitted) validateField("confirmation",confirmation);}} aria-invalid={Boolean(fieldErrors.confirmation)} aria-describedby={fieldErrors.confirmation ? "register-confirmation-error" : undefined} required />
          </div>
          {fieldErrors.confirmation && <p className="field-error" id="register-confirmation-error">{fieldErrors.confirmation}</p>}
        </div>

        <button className="primary-button" type="submit" disabled={loading}>
          {loading ? <><span className="spinner"/>Cadastrando…</> : <>Cadastrar <span className="button-arrow" aria-hidden="true">→</span></>}
        </button>
      </form>

      <p className="auth-switch">Já tem conta? <Link to="/login">Entrar</Link></p>
    </AuthLayout>
  );
}
