import { NextRequest } from 'next/server';
import { getSession, unauthorized } from '../../../lib/server/session';
import { allow, tooMany } from '../../../lib/server/ratelimit';
import { handleOf } from '../../../lib/server/directory';
import { hashToken, isOwner, loadRequest, newId, newToken, ownerView, saveRequest, TTL_S, type NairaRequest } from '../../../lib/server/requests';
import { kvSet } from '../../../lib/store';

// POST — create a request (requires a wallet session; the requester IS the
// session wallet, and the handle is whatever that wallet has claimed).
export async function POST(req: NextRequest) {
  const s = await getSession();
  if (!s) return unauthorized();
  if (!(await allow(`req-create:${s.address}`, 10, 3600))) return tooMany();
  const b = await req.json().catch(() => ({}));
  const bobAmount = Number(b.bobAmount), usdcNeeded = Number(b.usdcNeeded), ngnAmount = Number(b.ngnAmount);
  if (![bobAmount, usdcNeeded, ngnAmount].every(n => Number.isFinite(n) && n > 0 && n < 1e9)) return Response.json({ success: false, error: 'invalid amounts' }, { status: 400 });
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(b.fields ?? {})) if (typeof v === 'string' && k.length <= 40 && v.length <= 200) fields[k] = v;
  const token = newToken();
  const r: NairaRequest = {
    id: newId(), network: s.network,
    requester: { address: s.address, handle: (await handleOf(s.address)) ?? null },
    bob: { amount: bobAmount, provider: String(b.provider ?? '').slice(0, 80), rail: String(b.rail ?? '').slice(0, 40), fields },
    usdcNeeded, ngnAmount, orderId: null, bankDetails: null, status: 'open', offrampTxId: null,
    ownerTokenHash: hashToken(token), createdAt: new Date().toISOString(),
  };
  await kvSet(`corridor:req:${r.id}`, r, TTL_S);
  return Response.json({ success: true, data: { ...ownerView(r), ownerToken: token } });
}

// GET ?id= — the OWNER's view (needs the owner token).
export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id') ?? '';
  const r = await loadRequest(id);
  if (!r) return Response.json({ success: false, error: 'not found' }, { status: 404 });
  if (!isOwner(r, req.headers.get('x-owner-token'))) return unauthorized('Not your request.');
  return Response.json({ success: true, data: ownerView(r) });
}
