import { NextRequest } from 'next/server';
import { kvGet, kvSet } from '../../../../lib/store';
import type { NairaRequest } from '../route';

const KEY = (id: string) => `corridor:req:${id}`;

// Whitelisted state transitions from the payer page (orderId) and the
// requester's app (status / offrampTxId).
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const r = await kvGet<NairaRequest>(KEY(id));
  if (!r) return Response.json({ success: false, error: 'not found' }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  if (typeof b.orderId === 'string' && /^[\w-]{10,64}$/.test(b.orderId) && !r.orderId) { r.orderId = b.orderId; r.status = 'paying'; }
  if (['funded', 'cashed_out', 'expired'].includes(b.status)) r.status = b.status;
  if (typeof b.offrampTxId === 'string' && b.offrampTxId.length <= 80) r.offrampTxId = b.offrampTxId;
  await kvSet(KEY(id), r, 7 * 24 * 3600);
  return Response.json({ success: true, data: r });
}
