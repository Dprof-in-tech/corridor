import { NextRequest } from 'next/server';
import { kvGet, kvSet } from '../../../lib/store';
import { handleOf } from '../../../lib/server/directory';
import { getSession, unauthorized } from '../../../lib/server/session';
import { allow, clientIp, tooMany } from '../../../lib/server/ratelimit';

// Handle ↔ Stellar address directory so people can pay "@ada" instead of a
// 56-character G-address. Lookups are public (that is the point of a handle);
// a claim binds a handle to the CALLER's verified wallet only, so nobody can
// squat a name onto an address they don't control. First come, first served;
// the same wallet may re-claim its own handle.

const norm = (h: string) => h.trim().toLowerCase().replace(/^@/, '');
const isHandle = (h: string) => /^[a-z0-9_]{3,24}$/.test(h);
const RESERVED = new Set(['weave', 'pollar', 'corridor', 'admin', 'support', 'help', 'stellar', 'paywithweave']);

const byHandle = (h: string) => kvGet<string>(`corridor:handle:${h}`);

export async function GET(req: NextRequest) {
  if (!(await allow(`dir:${clientIp(req)}`, 60, 60))) return tooMany();
  const h = norm(new URL(req.url).searchParams.get('handle') ?? '');
  if (!isHandle(h)) return Response.json({ success: false, error: 'invalid handle' }, { status: 400 });
  const address = await byHandle(h);
  return address ? Response.json({ success: true, data: { handle: h, address } }) : Response.json({ success: false, error: 'not found' }, { status: 404 });
}

export async function POST(req: NextRequest) {
  const s = await getSession();
  if (!s) return unauthorized();
  if (!(await allow(`dir-claim:${s.address}`, 5, 3600))) return tooMany();
  const body = await req.json().catch(() => ({}));
  const h = norm(String(body.handle ?? ''));
  if (!isHandle(h)) return Response.json({ success: false, error: 'Handles are 3–24 letters, numbers or underscores.' }, { status: 400 });
  if (RESERVED.has(h)) return Response.json({ success: false, error: 'That handle is reserved.' }, { status: 409 });
  const existing = await byHandle(h);
  if (existing && existing !== s.address) return Response.json({ success: false, error: 'That handle is taken.' }, { status: 409 });
  const previous = await handleOf(s.address);
  if (previous && previous !== h) await kvSet(`corridor:handle:${previous}`, null);
  await kvSet(`corridor:handle:${h}`, s.address);
  await kvSet(`corridor:addr:${s.address}`, h);
  return Response.json({ success: true, data: { handle: h, address: s.address } });
}
