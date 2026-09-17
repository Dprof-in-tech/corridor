import { Redis } from '@upstash/redis';

// Server-side KV for the corridor's own small state (handles, naira requests).
// Upstash when configured, process memory otherwise — per instance, so on a
// serverless host without Upstash handles and links do NOT survive between
// invocations. Set UPSTASH_* for any real deployment.
// One map per PROCESS (not per route bundle — Next compiles each route separately).
const mem: Map<string, string> = ((globalThis as any).__corridorKv ??= new Map<string, string>());
const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
  : null;

export async function kvGet<T>(key: string): Promise<T | null> {
  if (redis) return (await redis.get<T>(key)) ?? null;
  const v = mem.get(key); return v ? JSON.parse(v) as T : null;
}
export async function kvSet(key: string, value: unknown, ttlSeconds?: number) {
  if (value === null || value === undefined) { if (redis) await redis.del(key); else mem.delete(key); return; }
  if (redis) { await redis.set(key, value, ttlSeconds ? { ex: ttlSeconds } : undefined); return; }
  mem.set(key, JSON.stringify(value));
}
