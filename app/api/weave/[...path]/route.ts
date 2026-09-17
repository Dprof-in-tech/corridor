import { NextRequest } from 'next/server';

// Server-side proxy to the Weave API using the merchant SECRET key — the same
// server-to-server path any Weave integrator's backend uses. Only a small
// allowlist of paths is exposed to the browser; the key never leaves the server.

const API_BASE = (process.env.WEAVE_API_BASE || 'http://localhost:4000/api/v1').replace(/\/$/, '');
const SECRET = process.env.WEAVE_SECRET_KEY || '';

const ALLOW: Array<[string, RegExp]> = [
  ['GET',  /^quotes$/],
  ['GET',  /^institutions$/],
  ['POST', /^institutions\/verify$/],
  ['GET',  /^assets$/],
  ['POST', /^orders$/],
  ['GET',  /^orders\/[\w-]+$/],
  ['POST', /^orders\/[\w-]+\/steps\/\d+\/(approve-tx|bridge-tx|submitted)$/],
];

async function proxy(req: NextRequest, parts: string[]) {
  const path = parts.join('/');
  if (!SECRET) return Response.json({ success: false, error: 'WEAVE_SECRET_KEY is not configured' }, { status: 500 });
  if (!ALLOW.some(([m, re]) => m === req.method && re.test(path))) {
    return Response.json({ success: false, error: 'Not allowed' }, { status: 403 });
  }
  const url = new URL(req.url);
  const res = await fetch(`${API_BASE}/${path}${url.search}`, {
    method: req.method,
    headers: { 'x-secret-key': SECRET, 'Content-Type': 'application/json', 'user-agent': req.headers.get('user-agent') ?? 'weave-corridor' },
    body: req.method === 'GET' ? undefined : await req.text(),
    cache: 'no-store',
  });
  return new Response(await res.text(), { status: res.status, headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/json' } });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> })  { return proxy(req, (await ctx.params).path); }
export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) { return proxy(req, (await ctx.params).path); }
