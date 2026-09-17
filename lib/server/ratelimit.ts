import 'server-only';
import { Redis } from '@upstash/redis';

// Fixed-window rate limiter. Upstash when configured (shared across Vercel
// instances); otherwise process memory, which is per instance — still useful
// against a single hot loop, not a guarantee.
const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
  : null;
const mem: Map<string, { n: number; reset: number }> = ((globalThis as any).__corridorRl ??= new Map());

/** Returns true when the call is within `limit` per `windowSec` for `key`. */
export async function allow(key: string, limit: number, windowSec: number): Promise<boolean> {
  const bucket = `corridor:rl:${key}:${Math.floor(Date.now() / 1000 / windowSec)}`;
  if (redis) {
    const n = await redis.incr(bucket);
    if (n === 1) await redis.expire(bucket, windowSec);
    return n <= limit;
  }
  const now = Date.now();
  const cur = mem.get(bucket);
  if (!cur || cur.reset < now) { mem.set(bucket, { n: 1, reset: now + windowSec * 1000 }); if (mem.size > 5000) mem.clear(); return true; }
  cur.n += 1;
  return cur.n <= limit;
}

export const tooMany = () => Response.json({ success: false, error: 'Too many requests — slow down.' }, { status: 429 });
export const clientIp = (req: Request) => (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
