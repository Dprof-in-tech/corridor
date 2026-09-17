import 'server-only';
import type { Network } from './session';

// Server → Weave API with the SECRET key of the requested environment. The
// only place the keys are read. Network follows credentials: sandbox
// (sk_test) or live (sk_live).
const SECRETS: Record<Network, string> = { testnet: process.env.WEAVE_SECRET_KEY || '', mainnet: process.env.WEAVE_SECRET_KEY_LIVE || '' };

export function apiBase(): string {
  const v = process.env.WEAVE_API_BASE;
  if (!v) {
    if (process.env.NODE_ENV === 'production') throw new Error('WEAVE_API_BASE is not configured');
    return 'http://localhost:4000/api/v1';
  }
  return v.replace(/\/$/, '');
}
export function secretFor(network: Network): string | null { return SECRETS[network] || null; }

export type WeaveResult<T = any> = { ok: boolean; status: number; data: T; error?: string };

export async function weaveServer<T = any>(network: Network, path: string, init?: { method?: 'GET' | 'POST'; body?: unknown; search?: string }): Promise<WeaveResult<T>> {
  const key = secretFor(network);
  if (!key) return { ok: false, status: 503, data: null as T, error: network === 'mainnet' ? 'Mainnet is not configured on this deployment (WEAVE_SECRET_KEY_LIVE).' : 'WEAVE_SECRET_KEY is not configured' };
  const res = await fetch(`${apiBase()}/${path.replace(/^\//, '')}${init?.search ?? ''}`, {
    method: init?.method ?? (init?.body ? 'POST' : 'GET'),
    headers: { 'x-secret-key': key, 'Content-Type': 'application/json', 'user-agent': 'weave-corridor' },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });
  const j = await res.json().catch(() => ({}));
  const ok = res.ok && j?.success !== false;
  // Never relay an upstream 5xx body to the browser (it can be a provider's
  // raw error page); log it here and say something a person can act on.
  let error: string | undefined = j?.error;
  if (!ok && res.status >= 500) { console.error(`[weave] ${path} → ${res.status}: ${String(error ?? '').slice(0, 300)}`); error = 'Weave is unavailable right now — try again in a moment.'; }
  return { ok, status: res.status, data: j?.data, error };
}
