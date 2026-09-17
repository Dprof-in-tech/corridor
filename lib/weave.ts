'use client';

// Browser → our /api/weave proxy → Weave API (secret key stays server-side).

export type ApiResult<T = any> = { ok: boolean; status: number; data: T; error?: string };

export async function weave<T = any>(path: string, init?: { method?: 'GET' | 'POST'; body?: unknown }): Promise<ApiResult<T>> {
  const res = await fetch(`/api/weave/${path.replace(/^\//, '')}`, {
    method: init?.method ?? (init?.body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json' },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const j = await res.json().catch(() => ({}));
  return { ok: res.ok && j?.success !== false, status: res.status, data: j?.data, error: j?.error };
}

export const STELLAR_USDC = 'crypto:STELLAR:USDC';
export const NGN = 'fiat:NGN';

export const fmtNgn = (n: number | null | undefined) => n == null ? '—' : `₦${Math.round(n).toLocaleString()}`;
export const fmtUsdc = (n: number | null | undefined) => n == null ? '—' : `${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC`;
export const shortG = (g: string) => `${g.slice(0, 6)}…${g.slice(-6)}`;

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

export const POLLAR_NETWORK: 'mainnet' | 'testnet' = process.env.NEXT_PUBLIC_POLLAR_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
export const IS_TESTNET = POLLAR_NETWORK === 'testnet';
export const USDC_ISSUER: Record<'mainnet' | 'testnet', string> = {
  mainnet: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  testnet: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
};
