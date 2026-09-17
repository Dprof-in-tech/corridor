import { NextRequest } from 'next/server';
import { kvGet, kvSet } from '../../../lib/store';

// Tiny handle → Stellar address directory so people can pay "@ada" instead of a
// 56-character G-address. Upstash when configured, else process memory (dev).
// Handles are claimed first-come; a claim must carry the SAME address to update.


const norm = (h: string) => h.trim().toLowerCase().replace(/^@/, '');
const isHandle = (h: string) => /^[a-z0-9_]{3,24}$/.test(h);
const isG = (a: string) => /^G[A-Z2-7]{55}$/.test(a);

const get = (h: string) => kvGet<string>(`corridor:handle:${h}`);
const set = (h: string, a: string) => kvSet(`corridor:handle:${h}`, a);

export async function GET(req: NextRequest) {
  const h = norm(new URL(req.url).searchParams.get('handle') ?? '');
  if (!isHandle(h)) return Response.json({ success: false, error: 'invalid handle' }, { status: 400 });
  const address = await get(h);
  return address ? Response.json({ success: true, data: { handle: h, address } }) : Response.json({ success: false, error: 'not found' }, { status: 404 });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const h = norm(String(body.handle ?? '')); const address = String(body.address ?? '');
  if (!isHandle(h)) return Response.json({ success: false, error: 'Handles are 3–24 letters, numbers or underscores.' }, { status: 400 });
  if (!isG(address)) return Response.json({ success: false, error: 'invalid Stellar address' }, { status: 400 });
  const existing = await get(h);
  if (existing && existing !== address) return Response.json({ success: false, error: 'That handle is taken.' }, { status: 409 });
  await set(h, address);
  return Response.json({ success: true, data: { handle: h, address } });
}
