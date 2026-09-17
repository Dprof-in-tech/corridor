import { NextRequest } from 'next/server';
import { isOwner, loadRequest, publicView, saveRequest } from '../../../../lib/server/requests';
import { weaveServer } from '../../../../lib/server/weave';
import { unauthorized } from '../../../../lib/server/session';
import { allow, clientIp, tooMany } from '../../../../lib/server/ratelimit';

// GET — the PUBLIC view for the payer page: amounts, status, the transfer
// details once the order exists, and the live order status (fetched here, so
// the payer never needs a Weave call of their own).
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await allow(`req-get:${clientIp(req)}`, 120, 60))) return tooMany();
  const { id } = await ctx.params;
  const r = await loadRequest(id);
  if (!r) return Response.json({ success: false, error: 'not found' }, { status: 404 });
  let orderStatus: string | null = null;
  if (r.orderId) {
    const o = await weaveServer(r.network, `orders/${r.orderId}`);
    if (o.ok) {
      orderStatus = o.data.status;
      if (orderStatus === 'completed' && r.status === 'paying') { r.status = 'funded'; await saveRequest(r); }
    }
  }
  return Response.json({ success: true, data: { ...publicView(r), orderStatus } });
}

// PATCH — OWNER only, forward-only status after the BOB payout.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const r = await loadRequest(id);
  if (!r) return Response.json({ success: false, error: 'not found' }, { status: 404 });
  if (!isOwner(r, req.headers.get('x-owner-token'))) return unauthorized('Not your request.');
  const b = await req.json().catch(() => ({}));
  const order = ['open', 'paying', 'funded', 'cashed_out'];
  if (typeof b.status === 'string' && ['funded', 'cashed_out'].includes(b.status) && order.indexOf(b.status) > order.indexOf(r.status)) r.status = b.status;
  if (typeof b.offrampTxId === 'string' && b.offrampTxId.length <= 80 && !r.offrampTxId) r.offrampTxId = b.offrampTxId;
  await saveRequest(r);
  return Response.json({ success: true, data: publicView(r) });
}
