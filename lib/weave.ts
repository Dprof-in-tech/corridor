'use client';

// Browser → our /api/weave proxy → Weave API (secret key stays server-side).
// The proxy requires Corridor's wallet session cookie and picks the key pair
// (live / sandbox) from it.

export type ApiResult<T = any> = { ok: boolean; status: number; data: T; error?: string };

export async function weave<T = any>(path: string, init?: { method?: 'GET' | 'POST'; body?: unknown }): Promise<ApiResult<T>> {
  const res = await fetch(`/api/weave/${path.replace(/^\//, '')}`, {
    method: init?.method ?? (init?.body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json' },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const j = await res.json().catch(() => ({}));
  const error = j?.error ?? (res.status === 401 ? 'Your session expired — reload the page.' : res.status === 429 ? 'Too many requests — slow down.' : res.status >= 500 ? 'Weave is unavailable right now.' : undefined);
  return { ok: res.ok && j?.success !== false, status: res.status, data: j?.data, error };
}

/**
 * Bank account-name lookup with retry. The upstream verifier is slow and
 * occasionally 5xx/408s; a "not found" is only reported when the upstream
 * actually answered. Returns the name, null for not-found, or throws when
 * the service could not be reached after retries.
 */
export async function verifyAccount(institution: string, accountIdentifier: string, currency = 'NGN', attempts = 3): Promise<string | null> {
  let last: ApiResult | null = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await weave('institutions/verify', { body: { institution, accountIdentifier, currency } });
      if (r.ok && r.data) return String(r.data);
      if (r.status === 404 || r.status === 400 || (r.status === 502 && /not found|invalid/i.test(r.error ?? ''))) return null;
      last = r;
      if (r.status === 401 || r.status === 429) break;
    } catch (e) { last = { ok: false, status: 0, data: null, error: 'network' }; }
    await new Promise(res => setTimeout(res, 1200 * (i + 1)));
  }
  throw new Error(last?.status === 429 ? 'Too many lookups — wait a minute.' : last?.status === 401 ? 'Your session expired — reload the page.' : 'We couldn’t check that account right now — try again in a moment.');
}

export const STELLAR_USDC = 'crypto:STELLAR:USDC';
export const NGN = 'fiat:NGN';

export const fmtNgn = (n: number | null | undefined) => n == null ? '—' : `₦${Math.round(n).toLocaleString()}`;
/** Exact amount to transfer, as the provider stated it — thousands separators only, never rounded. */
export const fmtExactNgn = (v: string | number) => { const s = String(v).trim(); const [int, dec] = s.split('.'); return `₦${Number(int).toLocaleString('en')}${dec ? '.' + dec : ''}`; };
export const fmtUsdc = (n: number | null | undefined) => n == null ? '—' : `${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC`;
export { shortG, isGAddress } from './stellar';

export type Bank = { name: string; code: string };

const BANK_ALIASES: Record<string, string> = {
  'guaranty trust': 'gtb gtbank gt bank', 'united bank for africa': 'uba', 'first bank': 'fbn firstbank',
  'first city monument': 'fcmb', 'stanbic': 'ibtc', 'wema': 'alat', 'access': 'access diamond',
  'moniepoint': 'monie', 'opay': 'opay', 'palmpay': 'palm', 'kuda': 'kuda',
};
export function bankMatches(name: string, q: string) {
  const lower = name.toLowerCase(); let s = lower;
  for (const [needle, aliases] of Object.entries(BANK_ALIASES)) if (lower.includes(needle)) s += ' ' + aliases;
  return s.includes(q.toLowerCase());
}

/** Poll a Weave order until terminal. Calls onTick with each snapshot. */
export async function pollOrder(orderId: string, onTick: (o: any) => void, opts: { intervalMs?: number; timeoutMs?: number } = {}) {
  const started = Date.now();
  for (;;) {
    const r = await weave(`orders/${orderId}`);
    if (r.ok) {
      onTick(r.data);
      if (['completed', 'failed', 'expired', 'refunded'].includes(r.data.status)) return r.data;
    }
    if (Date.now() - started > (opts.timeoutMs ?? 30 * 60_000)) throw new Error('Timed out waiting for the transfer.');
    // Pollar testnet keys are capped at 1,000 requests/day — poll gently.
    await new Promise(res => setTimeout(res, opts.intervalMs ?? 8000));
  }
}

export { USDC_ISSUER, getNetwork, isTestnet, useNetwork } from './network';
