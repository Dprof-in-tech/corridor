import { NextRequest } from 'next/server';
import { Redis } from '@upstash/redis';

// Tiny handle → Stellar address directory so people can pay "@ada" instead of a
// 56-character G-address. Upstash when configured, else process memory (dev).
// Handles are claimed first-come; a claim must carry the SAME address to update.

const mem = new Map<string, string>();
const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
  : null;

const norm = (h: string) => h.trim().toLowerCase().replace(/^@/, '');
const isHandle = (h: string) => /^[a-z0-9_]{3,24}$/.test(h);
const isG = (a: string) => /^G[A-Z2-7]{55}$/.test(a);

async function get(h: string) { return redis ? (await redis.get<string>(`corridor:handle:${h}`)) ?? null : mem.get(h) ?? null; }
async function set(h: string, a: string) { if (redis) await redis.set(`corridor:handle:${h}`, a); else mem.set(h, a); }

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
