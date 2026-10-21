// Opt-in: executa ZAP apenas contra este fixture local, nunca contra um alvo configurável.
import http from 'node:http';
import https from 'node:https';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import selfsigned from 'selfsigned';
import { simpleParser } from 'mailparser';
import pg from 'pg';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

assert.equal(process.env.QA_ALLOW_ACTIVE_LOCAL_SCAN, '1', 'Use QA_ALLOW_ACTIVE_LOCAL_SCAN=1 para testar exclusivamente o fixture local');
const api = 'http://localhost:8080/api';
const evidence = { at: new Date().toISOString(), target: 'host.docker.internal', stages: [], limits: [] };
let publishedToken = '';
let requests = 0;
const page = (_req, res) => {
  requests++;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  // Sem formulários, scripts, links externos ou estado persistente no alvo de teste.
  res.end(`<!doctype html><html><head><title>QA fixture WebSec 52</title><meta name="websec-verification" content="${publishedToken}"></head><body><h1>Alvo local descartável de QA</h1></body></html>`);
};
const plain = http.createServer(page);
const pem = selfsigned.generate([{ name: 'commonName', value: 'host.docker.internal' }], {
  keySize: 2048, algorithm: 'sha256', days: 1,
  extensions: [{ name: 'subjectAltName', altNames: [{ type: 2, value: 'host.docker.internal' }] }],
});
const tls = https.createServer({ cert: pem.cert, key: pem.private }, page);
const listen = server => new Promise((yes, no) => { server.once('error', no); server.listen(server === plain ? 80 : 443, '0.0.0.0', yes); });
const close = server => new Promise(yes => { if (server.listening) { server.close(yes); server.closeAllConnections(); } else yes(); });

async function request(method, path, body, token) {
  const r = await fetch(`${api}${path}`, {
    method, signal: AbortSignal.timeout(30000),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await r.json();
  return { status: r.status, data };
}

try {
  await listen(plain);
  await listen(tls);
  evidence.stages.push({ stage: 'fixture', status: 'PASS', ports: [80, 443] });
  const credentials = process.env.QA_CREDENTIALS_FILE
    ? JSON.parse(await readFile(process.env.QA_CREDENTIALS_FILE, 'utf8'))
    : { name: 'QA flow 52', email: `qa52-flow-${randomUUID()}@example.invalid`, password: `QA-${randomUUID()}!` };
  const auth = await request('POST', process.env.QA_CREDENTIALS_FILE ? '/auth/login' : '/auth/register', credentials);
  assert.equal(auth.status, 200);
  const token = auth.data.token;
  evidence.stages.push({ stage: 'auth', status: 'PASS', account: credentials.email });
  const created = await request('POST', '/scans', { url: 'https://host.docker.internal' }, token);
  assert.equal(created.status, 200);
  assert.equal(created.data.status, 'PENDING_VERIFICATION');
  evidence.scanId = created.data.id;
  evidence.stages.push({ stage: 'submit', status: 'PASS', scanId: created.data.id, scanStatus: created.data.status });
  const pending = await request('POST', `/scans/${evidence.scanId}/confirm-verification`, undefined, token);
  assert.equal(pending.status, 409);
  assert.equal(pending.data.code, 'VERIFICATION_PENDING');
  evidence.stages.push({ stage: 'unverified', status: 'PASS', httpStatus: pending.status, code: pending.data.code });
  publishedToken = created.data.verificationToken;
  const confirmed = await request('POST', `/scans/${evidence.scanId}/confirm-verification`, undefined, token);
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.data.status, 'QUEUED');
  evidence.stages.push({ stage: 'verification', status: 'PASS', scanStatus: confirmed.data.status });
  const duplicate = await request('POST', `/scans/${evidence.scanId}/confirm-verification`, undefined, token);
  assert.equal(duplicate.status, 409);
  evidence.stages.push({ stage: 'duplicate-confirmation', status: 'PASS', httpStatus: duplicate.status });

  const deadline = Date.now() + Number(process.env.QA_SCAN_TIMEOUT_MS || 240000);
  let current;
  let previous;
  while (Date.now() < deadline) {
    current = await request('GET', `/scans/${evidence.scanId}`, undefined, token);
    assert.equal(current.status, 200);
    if (current.data.status !== previous) {
      evidence.stages.push({ stage: 'processing', status: 'OBSERVED', scanStatus: current.data.status, at: new Date().toISOString() });
      previous = current.data.status;
      console.log(`Scan ${evidence.scanId}: ${previous}`);
    }
    if (['COMPLETED', 'FAILED'].includes(current.data.status)) break;
    await new Promise(yes => setTimeout(yes, 3000));
  }
  assert.equal(current?.data.status, 'COMPLETED', `Processamento não concluiu: ${current?.data.status}`);
  evidence.stages.push({ stage: 'result', status: 'PASS', findings: current.data.findings.length });
  let domainId = current.data.domainId;
  if (!Number.isInteger(domainId) && process.env.QA_TEST_DATABASE === '1') {
    // Consulta somente leitura, restrita ao scan e à conta QA desta execução.
    const db = new pg.Client({ host: 'localhost', port: 5432, database: 'websec', user: 'websec', password: process.env.QA_DB_PASSWORD || 'websec', connectionTimeoutMillis: 5000 });
    try {
      await db.connect();
      await db.query('BEGIN READ ONLY');
      const row = await db.query('SELECT s.domain_id FROM scans s JOIN domains d ON d.id=s.domain_id JOIN users u ON u.id=d.user_id WHERE s.id=$1 AND u.email=$2', [evidence.scanId, credentials.email]);
      domainId = Number(row.rows[0]?.domain_id);
      evidence.stages.push({ stage: 'domainId-contract', status: 'FAIL', reason: 'domainId ausente na API; obtido por consulta somente leitura ao banco do próprio fixture QA.', domainId });
    } finally { await db.end(); }
  }
  if (Number.isInteger(domainId)) {
    const history = await request('GET', `/scans/domain/${domainId}/history`, undefined, token);
    assert.equal(history.status, 200);
    assert.ok(history.data.some(s => s.id === evidence.scanId));
    evidence.stages.push({ stage: 'history', status: 'PASS', count: history.data.length });
  } else {
    evidence.stages.push({ stage: 'history', status: 'BLOCKED', reason: 'Resposta não inclui domainId; Dashboard sem consulta de histórico.' });
  }

  // Worker marca COMPLETED antes de gerar PDF/enviar e-mail: aguarde o relatório separadamente.
  let reportMessage;
  let parsedReport;
  const reportDeadline = Date.now() + 20000;
  while (Date.now() < reportDeadline) {
    const mail = await fetch('http://localhost:8025/api/v2/messages?limit=100', { signal: AbortSignal.timeout(5000) }).then(r => r.json());
    for (const candidate of mail.items || []) {
      const raw = await fetch(`http://localhost:8025/api/v1/messages/${encodeURIComponent(candidate.ID)}/download`, { signal: AbortSignal.timeout(5000) }).then(r => r.text());
      const parsed = await simpleParser(raw);
      if (parsed.subject?.includes(`scan #${evidence.scanId}`)) { reportMessage = candidate; parsedReport = parsed; break; }
    }
    if (reportMessage) break;
    await new Promise(yes => setTimeout(yes, 1000));
  }
  assert.ok(reportMessage, 'Relatório não chegou ao MailHog em 20 segundos');
  const pdf = parsedReport.attachments.find(a => a.contentType === 'application/pdf');
  assert.ok(pdf, 'E-mail não contém anexo PDF');
  assert.equal(pdf.content.subarray(0, 5).toString(), '%PDF-');
  evidence.stages.push({ stage: 'report-mailhog', status: 'PASS', messageId: reportMessage.ID, subject: parsedReport.subject, pdfBytes: pdf.content.length, pdfSha256: createHash('sha256').update(pdf.content).digest('hex'), recipients: parsedReport.to?.text });
  evidence.outcome = evidence.stages.some(s => ['BLOCKED', 'FAIL'].includes(s.status)) ? 'PARTIAL' : 'PASS';
  if (evidence.outcome !== 'PASS') process.exitCode = 1;
} catch (error) {
  evidence.outcome = 'FAIL';
  evidence.error = error.message;
  process.exitCode = 1;
  console.error(error.message);
} finally {
  await Promise.all([close(plain), close(tls)]);
  evidence.fixtureRequests = requests;
  const dir = resolve(process.env.QA_ARTIFACT_DIR || 'qa/artifacts/local-flow-current');
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, 'results.json'), JSON.stringify(evidence, null, 2));
  console.log(`Evidências: ${dir}`);
}
