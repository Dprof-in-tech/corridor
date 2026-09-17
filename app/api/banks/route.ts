import { NextRequest } from 'next/server';
import { weaveServer } from '../../../lib/server/weave';
import { allow, clientIp, tooMany } from '../../../lib/server/ratelimit';

// Public Nigerian bank list for the payer page (no account). Cached briefly.
let cache: { at: number; data: unknown } | null = null;
export async function GET(req: NextRequest) {
  if (!(await allow(`banks:${clientIp(req)}`, 30, 60))) return tooMany();
  if (cache && Date.now() - cache.at < 10 * 60_000) return Response.json({ success: true, data: cache.data });
  const r = await weaveServer('testnet', 'institutions', { search: '?currency=NGN' });
  if (!r.ok) return Response.json({ success: false, error: r.error }, { status: 502 });
  cache = { at: Date.now(), data: r.data };
  return Response.json({ success: true, data: r.data });
}
