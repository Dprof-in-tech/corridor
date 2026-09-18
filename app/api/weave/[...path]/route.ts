import { NextRequest } from 'next/server';
import { getSession, unauthorized, type WalletSession } from '../../../../lib/server/session';
import { weaveServer } from '../../../../lib/server/weave';
import { allow, tooMany } from '../../../../lib/server/ratelimit';
import { isGAddress } from '../../../../lib/stellar';

// Server-side proxy to the Weave API using the merchant SECRET key — the same
// server-to-server path any Weave integrator's backend uses. Three gates:
//   1. the caller holds a Corridor wallet session (a signed SEP-53 challenge);
//   2. only an allow-list of paths, and only the shapes the app needs — an
//      order that spends from a wallet must spend from the session's wallet;
//   3. per-wallet rate limits, tightest on the endpoints that cost something
//      (bank-name lookups, the sandbox faucet).
// The network comes from the session, not from a client header.

type Rule = { method: 'GET' | 'POST'; re: RegExp; limit: [number, number]; sandboxOnly?: boolean };
const RULES: Rule[] = [
  { method: 'GET',  re: /^quotes$/,                                                  limit: [120, 60] },
  { method: 'GET',  re: /^institutions$/,                                            limit: [30, 60] },
  { method: 'POST', re: /^institutions\/verify$/,                                    limit: [20, 60] },
  { method: 'POST', re: /^orders$/,                                                  limit: [20, 3600] },
  { method: 'GET',  re: /^orders\/[\w-]+$/,                                          limit: [240, 60] },
  { method: 'POST', re: /^orders\/[\w-]+\/steps\/\d+\/(approve-tx|bridge-tx|submitted)$/, limit: [60, 60] },
  { method: 'POST', re: /^sandbox\/stellar-faucet$/,                                 limit: [5, 86400], sandboxOnly: true },
  { method: 'GET',  re: /^sandbox\/stellar-simulator$/,                              limit: [30, 60],   sandboxOnly: true },
];

const bad = (error: string, status = 400) => Response.json({ success: false, error }, { status });

/** Shape checks on the one body that moves money. */
function checkOrderBody(body: any, s: WalletSession): string | null {
  const src = body?.source?.inline, dst = body?.dest?.inline;
  if (!src || !dst) return 'source and dest are required';
  if (src.kind === 'crypto_wallet' && src.walletAddress !== s.address) return 'You can only send from your own wallet.';
  if (body.refundAddress && body.refundAddress !== s.address) return 'refundAddress must be your own wallet.';
  for (const inst of [src, dst]) if (inst.kind === 'crypto_wallet' && !isGAddress(String(inst.walletAddress ?? ''))) return 'invalid Stellar address';
  const amt = Number(body.amount);
  if (!Number.isFinite(amt) || amt <= 0 || amt > 10_000_000) return 'invalid amount';
  return null;
}

async function proxy(req: NextRequest, parts: string[]) {
  const path = parts.join('/');
  const rule = RULES.find(r => r.method === req.method && r.re.test(path));
  if (!rule) return bad('Not allowed', 403);

  const s = await getSession();
  if (!s) return unauthorized();
  if (rule.sandboxOnly && s.network !== 'testnet') return bad('Sandbox-only endpoint', 403);
  if (!(await allow(`${s.address}:${rule.re.source}`, rule.limit[0], rule.limit[1]))) return tooMany();

  let body: any = undefined;
  if (req.method === 'POST') {
    // Some steps post with no body (bridge-tx); an empty body is fine, malformed JSON is not.
    const raw = await req.text();
    if (raw.trim() === '') body = {};
    else { try { body = JSON.parse(raw); } catch { return bad('invalid JSON'); } }
    if (/^orders$/.test(path)) { const err = checkOrderBody(body, s); if (err) return bad(err); }
    if (/^sandbox\/stellar-faucet$/.test(path)) {
      if (!isGAddress(String(body.to ?? ''))) return bad('invalid Stellar address');
      if (!(Number(body.amount) > 0 && Number(body.amount) <= 50)) return bad('invalid amount');
    }
  }
  const r = await weaveServer(s.network, path, { method: req.method as 'GET' | 'POST', body, search: new URL(req.url).search });
  return Response.json({ success: r.ok, data: r.data, error: r.error }, { status: r.status });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> })  { return proxy(req, (await ctx.params).path); }
export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) { return proxy(req, (await ctx.params).path); }
