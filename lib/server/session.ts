import 'server-only';
import { createHmac, randomBytes, timingSafeEqual, createHash } from 'crypto';
import { cookies } from 'next/headers';
import { Keypair } from '@stellar/stellar-sdk';
import { isGAddress } from '../stellar';

// Corridor's own notion of "who is calling": a wallet that has proven it
// holds its key. Pollar's session is DPoP-bound and lives in the browser, so
// the server cannot reuse it; instead the wallet signs a one-time challenge
// (SEP-53) and we issue an httpOnly cookie bound to that address. Every
// server route that spends the Weave key or touches user state requires it.

export type Network = 'mainnet' | 'testnet';
export interface WalletSession { address: string; network: Network; exp: number }

const COOKIE = 'corridor.session';
const SESSION_TTL_S = 7 * 24 * 3600;
const NONCE_TTL_S = 5 * 60;

function secret(): Buffer {
  const s = process.env.CORRIDOR_SESSION_SECRET || process.env.WEAVE_SECRET_KEY_LIVE || process.env.WEAVE_SECRET_KEY || '';
  if (!s) throw new Error('CORRIDOR_SESSION_SECRET is not configured');
  return createHash('sha256').update(`corridor-session:${s}`).digest();
}
const b64u = (b: Buffer) => b.toString('base64url');
function sign(payload: string) { return b64u(createHmac('sha256', secret()).update(payload).digest()); }
function pack(obj: unknown) { const p = b64u(Buffer.from(JSON.stringify(obj))); return `${p}.${sign(p)}`; }
function unpack<T>(token: string | undefined | null): T | null {
  if (!token) return null;
  const [p, s] = token.split('.');
  if (!p || !s) return null;
  const expect = sign(p);
  if (expect.length !== s.length || !timingSafeEqual(Buffer.from(expect), Buffer.from(s))) return null;
  try { return JSON.parse(Buffer.from(p, 'base64url').toString()) as T; } catch { return null; }
}

// ── challenge ────────────────────────────────────────────────────────────
export function issueChallenge(address: string, network: Network): { nonce: string; message: string } {
  const nonce = pack({ a: address, n: network, r: b64u(randomBytes(16)), exp: Math.floor(Date.now() / 1000) + NONCE_TTL_S });
  return { nonce, message: challengeMessage(address, nonce) };
}
export function challengeMessage(address: string, nonce: string) {
  return `Corridor wants to confirm this wallet is yours.\n\nWallet: ${address}\nNonce: ${nonce}\n\nThis signature does not move any funds.`;
}

/** SEP-53: signature over sha256("Stellar Signed Message:\n" + message). */
export function verifySep53(address: string, message: string, signatureB64: string): boolean {
  try {
    const payload = createHash('sha256').update(Buffer.concat([Buffer.from('Stellar Signed Message:\n'), Buffer.from(message)])).digest();
    return Keypair.fromPublicKey(address).verify(payload, Buffer.from(signatureB64, 'base64'));
  } catch { return false; }
}

/** Verify a signed challenge and mint the session cookie. */
export async function loginWithSignedChallenge(address: string, nonce: string, signature: string): Promise<WalletSession | null> {
  if (!isGAddress(address)) return null;
  const c = unpack<{ a: string; n: Network; exp: number }>(nonce);
  if (!c || c.a !== address || c.exp < Date.now() / 1000) return null;
  if (!verifySep53(address, challengeMessage(address, nonce), signature)) return null;
  const session: WalletSession = { address, network: c.n, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_S };
  (await cookies()).set(COOKIE, pack(session), { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: SESSION_TTL_S });
  return session;
}

export async function getSession(): Promise<WalletSession | null> {
  const s = unpack<WalletSession>((await cookies()).get(COOKIE)?.value);
  return s && s.exp > Date.now() / 1000 && isGAddress(s.address) ? s : null;
}
export async function clearSession() { (await cookies()).delete(COOKIE); }

export function unauthorized(msg = 'Sign in with your wallet first.') {
  return Response.json({ success: false, error: msg }, { status: 401 });
}
