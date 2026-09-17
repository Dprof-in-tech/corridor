import { NextRequest } from 'next/server';
import { loadRequest } from '../../../../../lib/server/requests';
import { weaveServer } from '../../../../../lib/server/weave';
import { allow, clientIp, tooMany } from '../../../../../lib/server/ratelimit';

// The payer has no account, so the bank-name lookup they need is exposed
// here — only for an OPEN request, and tightly rate-limited per IP.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await allow(`req-verify:${clientIp(req)}`, 8, 60))) return tooMany();
  const { id } = await ctx.params;
  const r = await loadRequest(id);
  if (!r || r.status !== 'open') return Response.json({ success: false, error: 'This request is no longer open.' }, { status: 409 });
  const b = await req.json().catch(() => ({}));
  const institution = String(b.institution ?? ''), accountIdentifier = String(b.accountIdentifier ?? '');
  if (!/^[A-Z0-9]{3,16}$/i.test(institution) || !/^\d{10}$/.test(accountIdentifier)) return Response.json({ success: false, error: 'invalid bank or account number' }, { status: 400 });
  let v = await weaveServer(r.network, 'institutions/verify', { body: { institution, accountIdentifier, currency: 'NGN' } });
  for (let i = 0; i < 2 && !v.ok && (v.status >= 500 || v.status === 408); i++) {   // upstream hiccup → retry with backoff
    await new Promise(res => setTimeout(res, 1200 * (i + 1)));
    v = await weaveServer(r.network, 'institutions/verify', { body: { institution, accountIdentifier, currency: 'NGN' } });
  }
  return Response.json({ success: v.ok, data: v.data, error: v.error }, { status: v.ok ? 200 : v.status >= 500 || v.status === 408 ? 502 : 404 });
}
