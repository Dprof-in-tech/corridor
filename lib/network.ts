'use client';

import { useSyncExternalStore } from 'react';

// Which Stellar network the app is on. Network follows CREDENTIALS, exactly as
// in the Weave dashboard: the test-mode switch swaps the Pollar publishable key
// and the Weave secret key (via the proxy) for the other environment's pair,
// and everything else — USDC issuer, explorer, simulator vs real bridge —
// derives from that. The choice is remembered per browser.

export type Network = 'mainnet' | 'testnet';
const KEY = 'corridor.network';
const DEFAULT: Network = process.env.NEXT_PUBLIC_POLLAR_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';

let current: Network = DEFAULT;
let hydrated = false;
const listeners = new Set<() => void>();

function hydrate() {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  try { const v = localStorage.getItem(KEY); if (v === 'mainnet' || v === 'testnet') current = v; } catch {}
}

export function getNetwork(): Network { hydrate(); return current; }
export function isTestnet() { return getNetwork() === 'testnet'; }
export function setNetwork(n: Network) {
  if (n === current) return;
  current = n;
  try { localStorage.setItem(KEY, n); } catch {}
  listeners.forEach(l => l());
}
export function useNetwork(): Network {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    getNetwork,
    () => DEFAULT,
  );
}

/** Pollar publishable key for a network (each Pollar app is one network). */
export function pollarKeyFor(n: Network): string {
  return (n === 'mainnet' ? process.env.NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY_MAINNET : process.env.NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY) || '';
}

/** Is the mainnet side of the switch wired to live credentials in this build? */
export const MAINNET_LIVE = process.env.NEXT_PUBLIC_MAINNET_LIVE === 'true';

export const USDC_ISSUER: Record<Network, string> = {
  mainnet: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  testnet: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
};
export const usdcIssuer = () => USDC_ISSUER[getNetwork()];
export const explorerTx = (hash: string) => `https://stellar.expert/explorer/${getNetwork() === 'testnet' ? 'testnet' : 'public'}/tx/${hash}`;
