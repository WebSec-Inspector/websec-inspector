// Apenas ambiente local: cria contas e scans QA; nunca confirma propriedade ou dispara ZAP.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.QA_API_URL || 'http://localhost:8080/api';
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname), 'QA_API_URL deve apontar para localhost');
const run = randomUUID();
const password = `QA-${randomUUID()}!`;
const email = `qa52-${run}@example.invalid`;
const secondEmail = `qa52-other-${run}@example.invalid`;
const results = [];
const trace = [];
let token;
let secondToken;
let scan;
let domainId;

function redact(value) {
  return JSON.parse(JSON.stringify(value, (key, val) => /token|password|authorization/i.test(key) ? '[REDACTED]' : val));
}

async function request(method, path, body, auth) {
  const response = await fetch(`${base}${path}`, {
    method,
    signal: AbortSignal.timeout(25000),
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  const result = { status: response.status, data };
  trace.push({ at: new Date().toISOString(), method, path, actor: !auth ? 'anonymous' : auth === token ? 'A' : auth === secondToken ? 'B' : 'invalid', ...redact(result) });
  return result;
}

function scenario(id, name, expected, fn, options = {}) {
  if (options.skip) results.push({ id, name, expected, status: 'SKIP', reason: options.skip });
  test(`${id}: ${name}`, { concurrency: false, ...options }, async (t) => {
    const start = trace.length;
    try {
      const outcome = await fn();
      if (outcome?.skip) {
        t.skip(outcome.skip);
        results.push({ id, name, expected, status: 'SKIP', reason: outcome.skip });
        return;
      }
      results.push({ id, name, expected, status: 'PASS', trace: trace.slice(start) });
    } catch (error) {
      results.push({ id, name, expected, status: 'FAIL', observed: error.message, trace: trace.slice(start) });
      throw error;
    }
  });
}

before(async () => {
  const first = await request('POST', '/auth/register', { name: 'QA issue 52 A', email, password });
  assert.equal(first.status, 200, 'Pré-condição: cadastro A disponível');
  assert.equal(typeof first.data.token, 'string');
  token = first.data.token;
  const second = await request('POST', '/auth/register', { name: 'QA issue 52 B', email: secondEmail, password });
  assert.equal(second.status, 200, 'Pré-condição: cadastro B disponível');
  secondToken = second.data.token;
  const submitted = await request('POST', '/scans', { url: 'http://host.docker.internal' }, token);
  assert.equal(submitted.status, 200, 'Pré-condição: criar scan em host local controlado');
  scan = submitted.data;
  domainId = scan.domainId;
  if (!Number.isInteger(domainId) && process.env.QA_TEST_DATABASE === '1') {
    const { default: pg } = await import('pg');
    const db = new pg.Client({ host: 'localhost', port: 5432, database: 'websec', user: 'websec', password: process.env.QA_DB_PASSWORD || 'websec', connectionTimeoutMillis: 5000 });
    try {
      await db.connect();
      await db.query('BEGIN READ ONLY');
      const ownDomain = await db.query('SELECT s.domain_id FROM scans s JOIN domains d ON d.id=s.domain_id JOIN users u ON u.id=d.user_id WHERE s.id=$1 AND u.email=$2', [scan.id, email]);
      domainId = Number(ownDomain.rows[0]?.domain_id);
      assert.ok(Number.isInteger(domainId));
    } finally { await db.end(); }
  }
});

scenario('API-01', 'login válido', '200 e token não vazio', async () => {
  const r = await request('POST', '/auth/login', { email, password });
  assert.equal(r.status, 200);
  assert.ok(r.data.token?.length > 20);
});
scenario('API-02', 'cadastro duplicado', '400 sem criar segunda conta', async () => {
  const r = await request('POST', '/auth/register', { name: 'QA duplicado', email, password });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /cadastrado/i);
});
scenario('API-03', 'cadastro com senha curta', '400', async () => {
  const r = await request('POST', '/auth/register', { name: 'QA', email: `short-${email}`, password: '123' });
  assert.equal(r.status, 400);
});
scenario('API-04', 'credencial inválida', '401; nunca 500', async () => {
  const r = await request('POST', '/auth/login', { email, password: 'incorrect-password' });
  assert.equal(r.status, 401);
});
scenario('API-05', 'consulta anônima', '401', async () => {
  assert.equal((await request('GET', `/scans/${scan.id}`)).status, 401);
});
scenario('API-06', 'token inválido', '401', async () => {
  assert.equal((await request('GET', `/scans/${scan.id}`, undefined, 'not-a-jwt')).status, 401);
});
scenario('API-07', 'scan recém-criado aguarda propriedade', 'PENDING_VERIFICATION, token presente e nenhum achado', async () => {
  assert.equal(scan.status, 'PENDING_VERIFICATION');
  assert.match(scan.verificationToken, /^websec-verify-/);
  assert.deepEqual(scan.findings, []);
});
scenario('API-08', 'consulta do próprio scan', '200 e identificador correto', async () => {
  const r = await request('GET', `/scans/${scan.id}`, undefined, token);
  assert.equal(r.status, 200);
  assert.equal(r.data.id, scan.id);
  assert.equal(r.data.status, 'PENDING_VERIFICATION');
});
scenario('API-09', 'contrato domainId para histórico', 'domainId inteiro positivo', async () => {
  const r = await request('GET', `/scans/${scan.id}`, undefined, token);
  assert.ok(Number.isInteger(r.data.domainId) && r.data.domainId > 0, 'domainId ausente/inválido na resposta');
});
scenario('API-10', 'scan inexistente', '404', async () => {
  assert.equal((await request('GET', '/scans/9223372036854775806', undefined, token)).status, 404);
});
scenario('API-11', 'isolamento entre contas A e B', '403 ou 404; B não pode ler scan de A', async () => {
  const r = await request('GET', `/scans/${scan.id}`, undefined, secondToken);
  assert.ok([403, 404].includes(r.status), `B acessou scan de A: HTTP ${r.status}`);
});
scenario('API-12', 'submissão vazia', '400', async () => {
  assert.equal((await request('POST', '/scans', { url: '' }, token)).status, 400);
});
scenario('API-13', 'histórico sem autenticação', '401', async () => {
  assert.equal((await request('GET', '/scans/domain/9223372036854775806/history')).status, 401);
});
scenario('API-14', 'domínio inexistente no histórico', '404; distinguir domínio inexistente de histórico vazio', async () => {
  assert.equal((await request('GET', '/scans/domain/9223372036854775806/history', undefined, token)).status, 404);
});
scenario('API-15', 'repetição de submissão mantém identidade do domínio', 'mesmo token de verificação para scans pendentes do mesmo domínio', async () => {
  const repeated = await request('POST', '/scans', { url: 'http://host.docker.internal' }, token);
  assert.equal(repeated.status, 200);
  assert.notEqual(repeated.data.id, scan.id);
  assert.ok(repeated.data.verificationToken === scan.verificationToken, 'Nova submissão invalidou o token já apresentado ao usuário');
});
scenario('API-16', 'confirmação anônima bloqueada', '401', async () => {
  assert.equal((await request('POST', `/scans/${scan.id}/confirm-verification`)).status, 401);
});
scenario('API-17', 'propriedade ausente impede enfileiramento', '409 VERIFICATION_PENDING e scan permanece pendente', async () => {
  const confirmation = await request('POST', `/scans/${scan.id}/confirm-verification`, undefined, token);
  assert.equal(confirmation.status, 409);
  assert.equal(confirmation.data.code, 'VERIFICATION_PENDING');
  const current = await request('GET', `/scans/${scan.id}`, undefined, token);
  assert.equal(current.data.status, 'PENDING_VERIFICATION');
});
scenario('API-18', 'histórico real da própria conta', '200, scan presente e ordem decrescente de criação', async () => {
  if (!Number.isInteger(domainId)) return { skip: 'API não fornece domainId; ative QA_TEST_DATABASE=1 para obter o ID do próprio fixture.' };
  const history = await request('GET', `/scans/domain/${domainId}/history`, undefined, token);
  assert.equal(history.status, 200);
  assert.ok(history.data.some(s => s.id === scan.id));
  const times = history.data.map(s => Date.parse(s.createdAt));
  assert.deepEqual(times, [...times].sort((a, b) => b - a));
});
scenario('API-19', 'histórico de A não é acessível por B', '403 ou 404', async () => {
  if (!Number.isInteger(domainId)) return { skip: 'API não fornece domainId; ative QA_TEST_DATABASE=1 para obter o ID do próprio fixture.' };
  const history = await request('GET', `/scans/domain/${domainId}/history`, undefined, secondToken);
  assert.ok([403, 404].includes(history.status), `B acessou histórico de A: HTTP ${history.status}`);
});
scenario('API-20', 'sessão expirada', '401 com JWT corretamente assinado porém expirado', async () => {
  // Chave exclusiva do Compose de desenvolvimento; nunca usa credenciais de produção.
  const head = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const claims = Buffer.from(JSON.stringify({ sub: email, iat: 1, exp: 2 })).toString('base64url');
  const signature = createHmac('sha256', 'troque-este-segredo-em-producao-troque-este-segredo').update(`${head}.${claims}`).digest('base64url');
  assert.equal((await request('GET', `/scans/${scan.id}`, undefined, `${head}.${claims}.${signature}`)).status, 401);
});

after(async () => {
  const dir = resolve(process.env.QA_ARTIFACT_DIR || 'qa/artifacts/api-current');
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, 'results.json'), JSON.stringify({
    run, at: new Date().toISOString(), base,
    environment: { node: process.version, platform: process.platform, serviceRevision: process.env.QA_SERVICE_REVISION || 'unknown (not verified)' },
    fixtures: { accountA: email, accountB: secondEmail, scanId: scan?.id, target: 'host.docker.internal' },
    results, trace,
    limits: ['Não confirma propriedade, não inicia ZAP nem envia e-mail.', 'Contas/scans QA permanecem no banco local; não apaga dados.', 'Histórico usa domainId público; em versões antigas sem esse campo, há fallback opcional somente leitura do próprio fixture.'],
  }, null, 2));
});
