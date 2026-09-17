import { NextRequest } from 'next/server';
import { loadRequest, publicView, saveRequest } from '../../../../../lib/server/requests';
import { weaveServer } from '../../../../../lib/server/weave';
import { allow, clientIp, tooMany } from '../../../../../lib/server/ratelimit';

// The payer starts the transfer. The SERVER creates the Weave order with the
// destination fixed to the requester's stored wallet — the client never
// supplies an order id or a destination, so the link cannot be redirected.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await allow(`req-start:${clientIp(req)}`, 5, 3600))) return tooMany();
  const { id } = await ctx.params;
  const r = await loadRequest(id);
  if (!r) return Response.json({ success: false, error: 'not found' }, { status: 404 });
  if (r.status !== 'open' || r.orderId) return Response.json({ success: false, error: 'This request has already been started.' }, { status: 409 });
  const b = await req.json().catch(() => ({}));
  const bankCode = String(b.bankCode ?? ''), accountNumber = String(b.accountNumber ?? ''), accountName = String(b.accountName ?? '').slice(0, 120);
  if (!/^[A-Z0-9]{3,16}$/i.test(bankCode) || !/^\d{10}$/.test(accountNumber) || !accountName) return Response.json({ success: false, error: 'invalid payer bank details' }, { status: 400 });
  const o = await weaveServer(r.network, 'orders', { body: {
    source: { inline: { kind: 'bank_account', assetKey: 'fiat:NGN', bankInstitution: bankCode, bankAccountIdentifier: accountNumber, bankAccountName: accountName } },
    dest:   { inline: { kind: 'crypto_wallet', assetKey: 'crypto:STELLAR:USDC', walletAddress: r.requester.address } },
    amount: r.ngnAmount, amountIn: 'source', reference: `req-${r.id}`,
  } });
  if (!o.ok) return Response.json({ success: false, error: o.error || 'Could not start the transfer' }, { status: 502 });
  r.orderId = o.data.order.id;
  r.bankDetails = o.data.nextAction?.bankDetails ?? null;
  r.status = o.data.order.status === 'completed' ? 'funded' : 'paying';
  await saveRequest(r);
  return Response.json({ success: true, data: { ...publicView(r), orderStatus: o.data.order.status } });
}
