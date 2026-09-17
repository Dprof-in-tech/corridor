import { NextRequest } from 'next/server';
import { randomBytes } from 'crypto';
import { kvGet, kvSet } from '../../../lib/store';

// A "naira request": a Bolivian user asks a Nigerian payer for ₦, to be
// delivered as BOB. The requester's Pollar wallet is the Stellar leg; the
// payer completes it from a public page (/r/[id]). Bank fields for the BOB
// payout are stored so the requester's app can fire the offramp once USDC lands.

export interface NairaRequest {
  id: string;
  requester: { address: string; handle: string | null };
  bob: { amount: number; provider: string; rail: string; fields: Record<string, string> };
  usdcNeeded: number;      // cryptoAmount Pollar quoted for the BOB payout, + buffer
  ngnAmount: number;       // what the payer must transfer
  orderId: string | null;  // Weave NGN → Stellar order once the payer starts
  status: 'open' | 'paying' | 'funded' | 'cashed_out' | 'expired';
  offrampTxId: string | null;
  createdAt: string;
}

const KEY = (id: string) => `corridor:req:${id}`;
const TTL = 7 * 24 * 3600;

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const address = String(b.address ?? '');
  if (!/^G[A-Z2-7]{55}$/.test(address)) return Response.json({ success: false, error: 'invalid Stellar address' }, { status: 400 });
  const bobAmount = Number(b.bobAmount), usdcNeeded = Number(b.usdcNeeded), ngnAmount = Number(b.ngnAmount);
  if (![bobAmount, usdcNeeded, ngnAmount].every(n => Number.isFinite(n) && n > 0)) return Response.json({ success: false, error: 'invalid amounts' }, { status: 400 });
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(b.fields ?? {})) if (typeof v === 'string' && k.length <= 40 && v.length <= 200) fields[k] = v;
  const r: NairaRequest = {
    id: randomBytes(6).toString('base64url'),
    requester: { address, handle: typeof b.handle === 'string' ? b.handle.slice(0, 24) : null },
    bob: { amount: bobAmount, provider: String(b.provider ?? ''), rail: String(b.rail ?? ''), fields },
    usdcNeeded, ngnAmount, orderId: null, status: 'open', offrampTxId: null, createdAt: new Date().toISOString(),
  };
  await kvSet(KEY(r.id), r, TTL);
  return Response.json({ success: true, data: r });
}

export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id') ?? '';
  const r = await kvGet<NairaRequest>(KEY(id));
  return r ? Response.json({ success: true, data: r }) : Response.json({ success: false, error: 'not found' }, { status: 404 });
}
