'use client';

import type { PollarClient } from '@pollar/core';
import type { Network } from './network';

// Prove to Corridor's server that this browser holds the wallet Pollar says it
// does: fetch a challenge, have the wallet sign it (SEP-53 — Pollar signs
// server-side for embedded wallets, in-extension for Freighter/xBull), send
// the signature back, receive an httpOnly session cookie.

export async function hasWalletSession(address: string, network: Network): Promise<boolean> {
  const r = await fetch('/api/auth/session').then(r => r.json()).catch(() => null);
  return !!r?.success && r.data?.address === address && r.data?.network === network;
}

export async function ensureWalletSession(client: PollarClient, address: string, network: Network): Promise<void> {
  if (await hasWalletSession(address, network)) return;
  const c = await fetch('/api/auth/challenge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address, network }) }).then(r => r.json());
  if (!c?.success) throw new Error(c?.error || 'Could not start wallet verification');
  const signed = await (client as any).stellar.sep53.signMessage(c.data.message);
  if (signed.status !== 'signed') throw new Error(signed.details || 'This wallet cannot sign messages (SEP-53), so it cannot be used here. Sign in with Google or email instead.');
  const v = await fetch('/api/auth/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address, nonce: c.data.nonce, signature: signed.signature }) }).then(r => r.json());
  if (!v?.success) throw new Error(v?.error || 'Wallet verification failed');
}

export async function endWalletSession() { await fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {}); }
