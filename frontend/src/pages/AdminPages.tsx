import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError, toApiError } from "../lib/apiError";
import { AdminUserRecord, getAdminUsers, ScanResponse, UserRole } from "../services/api";
import { useAdminScans } from "../components/AdminArea";
import ScanStatusBadge from "../components/ScanStatusBadge";
import infoIcon from "../assets/figma/info.svg";

const pageSize = 6;
const roleOptions: UserRole[] = ["ADMINISTRADOR", "GERENTE", "CLIENTE"];

function roleLabel(role: UserRole) {
  if (role === "ADMINISTRADOR") return "ADMIN";
  return role;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function Breadcrumb({ page }: { page: string }) {
  return (
    <div className="page-breadcrumb">
      <Link to="/admin">Administração</Link>
      <span aria-hidden="true">›</span>
      <span>{page}</span>
    </div>
  );
}

function PageHeading({
  page,
  title,
  description,
}: {
  page: string;
  title: string;
  description: string;
}) {
  return (
    <>
      <Breadcrumb page={page} />
      <header className="page-heading">
        <h1>{title}</h1>
        <p>{description}</p>
      </header>
    </>
  );
}

function LoadMessage({
  loading,
  error,
  retry,
  empty,
}: {
  loading: boolean;
  error: ApiError | null;
  retry?: () => void;
  empty?: string;
}) {
  if (loading) return <div className="page-message" role="status">Carregando dados…</div>;
  if (error) {
    return (
      <div className="page-message page-message--error" role="alert">
        <h2>Não foi possível carregar os dados</h2>
        <p>{error.message}</p>
        {retry && <button type="button" className="button button--secondary" onClick={retry}>Tentar novamente</button>}
      </div>
    );
  }
  if (empty) return <div className="table-empty">{empty}</div>;
  return null;
}

function ScanTable({ scans }: { scans: ScanResponse[] }) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(scans.length / pageSize));
  const visible = scans.slice((page - 1) * pageSize, page * pageSize);
  return (
    <section className="data-card">
      <div className="data-card__heading">
        <div>
          <h2>Scans recentes</h2>
          <p>{Math.min(scans.length, pageSize)} registros mais recentes · Ordenados por criação</p>
        </div>
      </div>
      {scans.length === 0 ? (
        <div className="table-empty">Nenhuma varredura encontrada neste escopo.</div>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">ID</th>
                <th scope="col">Domínio</th>
                <th scope="col">Criação ↓</th>
                <th scope="col">Status</th>
                <th scope="col">Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((scan) => (
                <tr key={scan.id}>
                  <td className="table-muted">#{scan.id}</td>
                  <td>{scan.hostname || "—"}</td>
                  <td className="table-muted">{formatDate(scan.createdAt)}</td>
                  <td><ScanStatusBadge status={scan.status} /></td>
                  <td><Link className="table-action" to={"/scans/" + scan.id}>Ver detalhes</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {scans.length > 0 && (
        <div className="table-footer">
          <span>Exibindo {Math.min(scans.length, pageSize)} de {scans.length} scans do escopo autorizado</span>
          <div className="pagination">
            <button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</button>
            <span>{page}</span>
            <button type="button" disabled={page >= pages} onClick={() => setPage((value) => Math.min(pages, value + 1))}>Próxima</button>
          </div>
        </div>
      )}
    </section>
  );
}

export function AdminOverviewPage() {
  const { scans, loading, error, refresh } = useAdminScans();
  const queued = scans.filter((scan) => scan.status === "QUEUED").length;
  const running = scans.filter((scan) => scan.status === "RUNNING").length;
  const failed = scans.filter((scan) => scan.status === "FAILED").length;
  const metrics = [
    { label: "Total de scans", value: scans.length, to: "/admin/scans" },
    { label: "Em fila", value: queued, to: "/admin/scans?status=QUEUED" },
    { label: "Em execução", value: running, to: "/admin/scans?status=RUNNING" },
    { label: "Com falha", value: failed, to: "/admin/scans?status=FAILED" },
  ];
  return (
    <section className="page-view">
      <PageHeading page="Visão geral" title="Visão geral" description="Acompanhe os scans no escopo autorizado para sua conta." />
      {loading && scans.length === 0 ? (
        <LoadMessage loading={loading} error={null} />
      ) : error ? (
        <LoadMessage loading={false} error={error} retry={refresh} />
      ) : (
        <>
          <div className="metric-grid">
            {metrics.map((metric) => (
              <Link className="metric-card" to={metric.to} key={metric.label}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                <span className="metric-card__link">Ver scans</span>
              </Link>
            ))}
          </div>
          <ScanTable scans={scans.slice(0, pageSize)} />
          <p className="admin-note"><img src={infoIcon} alt="" aria-hidden="true" /> Dados limitados ao escopo de acesso autorizado pela API.</p>
        </>
      )}
    </section>
  );
}

function ScanFilters({
  query,
  onQuery,
  status,
  onStatus,
}: {
  query: string;
  onQuery: (value: string) => void;
  status: string;
  onStatus: (value: string) => void;
}) {
  return (
    <div className="filter-card">
      <label className="filter-field">
        <span>Buscar por ID ou domínio</span>
        <input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Pesquisar..." />
      </label>
      <label className="filter-field filter-field--select">
        <span>Status</span>
        <select value={status} onChange={(event) => onStatus(event.target.value)}>
          <option value="">Todos</option>
          <option value="PENDING_VERIFICATION">Aguardando verificação</option>
          <option value="QUEUED">Na fila</option>
          <option value="RUNNING">Em execução</option>
          <option value="COMPLETED">Concluída</option>
          <option value="FAILED">Falhou</option>
          <option value="CANCELLED">Cancelada</option>
        </select>
      </label>
    </div>
  );
}

export function AdminScansPage() {
  const { scans, loading, error, refresh } = useAdminScans();
  const [searchParams] = useSearchParams();
  const initialStatus = searchParams.get("status") || "";
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const filtered = useMemo(
    () => scans.filter((scan) =>
      (!status || scan.status === status) &&
      (!query || String(scan.id).includes(query.trim()) || scan.hostname.toLowerCase().includes(query.trim().toLowerCase())),
    ),
    [scans, status, query],
  );
  return (
    <section className="page-view">
      <PageHeading page="Scans" title="Scans" description="Consulte as varreduras no escopo autorizado para sua conta." />
      <ScanFilters query={query} onQuery={setQuery} status={status} onStatus={setStatus} />
      {loading && scans.length === 0 ? <LoadMessage loading={loading} error={null} /> :
        error ? <LoadMessage loading={false} error={error} retry={refresh} /> : <ScanTable scans={filtered} />}
    </section>
  );
}

export function AdminHistoryPage() {
  const { scans, loading, error, refresh } = useAdminScans();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [period, setPeriod] = useState("");
  const filtered = useMemo(() => {
    const cutoff = period ? Date.now() - Number(period) * 24 * 60 * 60 * 1000 : null;
    return scans.filter((scan) =>
      (!status || scan.status === status) &&
      (!query || String(scan.id).includes(query.trim()) || scan.hostname.toLowerCase().includes(query.trim().toLowerCase())) &&
      (cutoff === null || Date.parse(scan.createdAt) >= cutoff),
    );
  }, [scans, query, status, period]);
  return (
    <section className="page-view">
      <PageHeading page="Histórico" title="Histórico" description="Consulte as varreduras da mais recente à mais antiga." />
      <div className="filter-card filter-card--history">
        <label className="filter-field">
          <span>Buscar por ID ou domínio</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar..." />
        </label>
        <label className="filter-field filter-field--select">
          <span>Período</span>
          <select value={period} onChange={(event) => setPeriod(event.target.value)}>
            <option value="">Todo o período</option>
            <option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option>
            <option value="90">Últimos 90 dias</option>
          </select>
        </label>
        <label className="filter-field filter-field--select">
          <span>Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Todos</option>
            <option value="PENDING_VERIFICATION">Aguardando verificação</option>
            <option value="QUEUED">Na fila</option>
            <option value="RUNNING">Em execução</option>
            <option value="COMPLETED">Concluída</option>
            <option value="FAILED">Falhou</option>
            <option value="CANCELLED">Cancelada</option>
          </select>
        </label>
      </div>
      {loading && scans.length === 0 ? <LoadMessage loading={loading} error={null} /> :
        error ? <LoadMessage loading={false} error={error} retry={refresh} /> : <ScanTable scans={filtered} />}
    </section>
  );
}

export function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [version, setVersion] = useState(0);
  const [searchDraft, setSearchDraft] = useState("");
  const [roleDraft, setRoleDraft] = useState("");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [page, setPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState<AdminUserRecord | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    getAdminUsers()
      .then((records) => { if (active) setUsers(records); })
      .catch((err) => { if (active) setError(toApiError(err)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [version]);

  const filtered = users.filter((user) =>
    (!role || user.role === role) &&
    (!search || user.name.toLowerCase().includes(search.toLowerCase()) || user.email.toLowerCase().includes(search.toLowerCase())),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    setSearch(searchDraft.trim());
    setRole(roleDraft);
    setPage(1);
  }

  return (
    <section className="page-view">
      <PageHeading page="Usuários" title="Usuários" description="Consulte os usuários e seus perfis de acesso." />
      {loading && users.length === 0 ? <LoadMessage loading={loading} error={null} /> :
        error ? <LoadMessage loading={false} error={error} retry={() => setVersion((value) => value + 1)} /> : (
          <section className="data-card">
            <form className="filter-card users-filter" onSubmit={applyFilters}>
              <label className="filter-field">
                <span>Buscar usuário</span>
                <input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Pesquisar..." />
              </label>
              <label className="filter-field filter-field--select">
                <span>Perfil</span>
                <select value={roleDraft} onChange={(event) => setRoleDraft(event.target.value)}>
                  <option value="">Todos</option>
                  {roleOptions.map((value) => <option value={value} key={value}>{roleLabel(value)}</option>)}
                </select>
              </label>
              <button type="submit" className="button button--outline">Aplicar filtro</button>
            </form>
            {filtered.length === 0 ? (
              <div className="table-empty">Nenhum usuário corresponde aos filtros aplicados.</div>
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead><tr><th scope="col">Nome</th><th scope="col">E-mail</th><th scope="col">Perfil</th><th scope="col">Ações</th></tr></thead>
                  <tbody>
                    {visible.map((user) => (
                      <tr key={user.id}>
                        <td>{user.name}</td>
                        <td className="table-muted">{user.email}</td>
                        <td className="table-muted">{roleLabel(user.role)}</td>
                        <td>
                          <button type="button" className="table-action" onClick={() => setSelectedUser(user)}>
                            Detalhes
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="table-footer">
              <span>{filtered.length === 0 ? "0 registros" : ((page - 1) * pageSize + 1) + "–" + Math.min(page * pageSize, filtered.length) + " de " + filtered.length + " registros"}</span>
              <div className="pagination">
                <button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</button>
                <span>{page}</span>
                <button type="button" disabled={page >= pages} onClick={() => setPage((value) => Math.min(pages, value + 1))}>Próxima</button>
              </div>
            </div>
          </section>
        )}
      {selectedUser && <UserDetailsDialog user={selectedUser} onClose={() => setSelectedUser(null)} />}
    </section>
  );
}

function UserDetailsDialog({ user, onClose }: { user: AdminUserRecord; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="user-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="user-detail-title">
        <div className="user-detail-dialog__body">
          <div className="user-detail-dialog__heading">
            <h2 id="user-detail-title">Detalhes do usuário</h2>
            <button type="button" className="button button--outline" onClick={onClose}>Fechar</button>
          </div>
          <dl className="user-detail-list">
            <div><dt>Nome</dt><dd>{user.name}</dd></div>
            <div><dt>E-mail</dt><dd>{user.email}</dd></div>
            <div><dt>Perfil</dt><dd>{roleLabel(user.role)}</dd></div>
          </dl>
        </div>
        <div className="user-detail-dialog__actions">
          <p>Somente leitura. Edição e atribuição de perfil indisponíveis.</p>
          <button type="button" className="button button--disabled" disabled>Editar</button>
        </div>
      </section>
    </div>
  );
}

export function AdminProfilesPage() {
  const [selected, setSelected] = useState<UserRole>("ADMINISTRADOR");
  const roleDescriptions: Record<UserRole, string> = {
    ADMINISTRADOR: "Perfil administrativo definido pela aplicação.",
    GERENTE: "Perfil de gestão definido pela aplicação.",
    CLIENTE: "Perfil de cliente definido pela aplicação.",
  };
  return (
    <section className="page-view">
      <PageHeading page="Perfis" title="Perfis de acesso" description="Consulte os perfis disponíveis no sistema." />
      <div className="profile-layout">
        <section className="profile-list">
          <h2>Perfis</h2>
          {roleOptions.map((role) => (
            <button
              type="button"
              key={role}
              className={"profile-list__item" + (selected === role ? " is-selected" : "")}
              onClick={() => setSelected(role)}
            >
              {roleLabel(role)}
            </button>
          ))}
        </section>
        <section className="permissions-card">
          <header>
            <h2>Permissões de {roleLabel(selected)}</h2>
            <p>Somente leitura</p>
          </header>
          <div className="permissions-card__description">
            <img src={infoIcon} alt="" aria-hidden="true" />
            <div>
              <strong>{roleDescriptions[selected]}</strong>
              <p>A matriz detalhada de permissões não está disponível pela API. Esta tela não estima ações ou regras de edição.</p>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
