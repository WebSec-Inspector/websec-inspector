// Identity epochs are never written by refresh. A stale response cannot replace
// a newer logout/login epoch, even before another tab's storage event arrives.
export const TOKEN_STORAGE_KEY = 'websec_token';
const EPOCH_KEY = 'websec_auth_epoch';
const TOKEN_RECORD_KEY = 'websec_auth_access';
const REVOCATION_KEY = 'websec_auth_revocation';
const ACK_KEY = 'websec_auth_revocation_ack';
export const SESSION_EVENT = 'websec:session';

export function currentEpoch(): string { return localStorage.getItem(EPOCH_KEY) ?? 'legacy'; }
export function pendingRevocation(): string | null {
  const marker = localStorage.getItem(REVOCATION_KEY);
  return marker && marker !== localStorage.getItem(ACK_KEY) ? marker : null;
}
export function sessionSnapshot() {
  const epoch = currentEpoch();
  let token: string | null = null;
  if (epoch === 'legacy') token = localStorage.getItem(TOKEN_STORAGE_KEY);
  else {
    try {
      const record = JSON.parse(localStorage.getItem(TOKEN_RECORD_KEY) ?? 'null');
      if (record?.epoch === epoch && typeof record.token === 'string') token = record.token;
    } catch { /* malformed storage cannot authenticate */ }
  }
  const logoutPending = pendingRevocation() !== null;
  return {epoch, token: logoutPending ? null : token, logoutPending};
}
export function notifySession() { window.dispatchEvent(new Event(SESSION_EVENT)); }
export function markRevocation() {
  localStorage.setItem(REVOCATION_KEY, crypto.randomUUID());
}
export function acknowledgeRevocation(marker: string) {
  // An acknowledgement identifies exactly one request. It never removes a new
  // logout marker written concurrently by another tab.
  localStorage.setItem(ACK_KEY, marker);
  notifySession();
}
export function beginSession(): string {
  const epoch = crypto.randomUUID();
  localStorage.setItem(EPOCH_KEY, epoch);
  localStorage.removeItem(TOKEN_RECORD_KEY);
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  notifySession();
  window.dispatchEvent(new Event('websec:unauthorized'));
  return epoch;
}
export function sessionChangedError() { return new Error('Sessão alterada. Entre novamente.'); }
export function storeSessionToken(epoch: string, token: string) {
  const valid = () => currentEpoch() === epoch && !pendingRevocation();
  if (!valid()) throw sessionChangedError();
  localStorage.setItem(TOKEN_RECORD_KEY, JSON.stringify({epoch, token}));
  localStorage.setItem(TOKEN_STORAGE_KEY, token); // compatibility mirror; record+epoch are authoritative
  if (!valid()) {
    if (localStorage.getItem(TOKEN_RECORD_KEY) === JSON.stringify({epoch, token})) localStorage.removeItem(TOKEN_RECORD_KEY);
    if (localStorage.getItem(TOKEN_STORAGE_KEY) === token) localStorage.removeItem(TOKEN_STORAGE_KEY);
    notifySession();
    throw sessionChangedError();
  }
  notifySession();
  window.dispatchEvent(new CustomEvent('websec:token', {detail: token}));
}

export async function withCookieLock<T>(operation: () => Promise<T>): Promise<T> {
  // Web Locks coordinate cookie mutations across browser tabs. The fallback
  // serializes callers in one window; durable epochs still fence other tabs.
  if (navigator.locks) return await navigator.locks.request('websec-auth-cookie', operation);
  const shared = window as Window & {websecAuthCookieQueue?: Promise<unknown>};
  const result = (shared.websecAuthCookieQueue ?? Promise.resolve()).then(operation, operation);
  shared.websecAuthCookieQueue = result.then(() => undefined, () => undefined);
  return result;
}
