'use client';

import { PollarProvider } from '@pollar/react';
import { useNetwork, pollarKeyFor, MAINNET_LIVE } from '../lib/network';

// Pollar owns identity + the Stellar wallet + the LatAm ramps; Weave owns the
// Nigerian leg. One provider at the root gives every page usePollar().
//
// Each Pollar app is bound to one network, so the test-mode switch swaps the
// publishable key and REMOUNTS the provider (the SDK locks its client at first
// render; sessions are per app, so switching means signing in again). With
// NEXT_PUBLIC_MAINNET_LIVE unset the mainnet side shows a "coming soon" page
// and the testnet client stays mounted, so flipping back keeps the session.

// Where Pollar sends the OAuth popup once Google/GitHub is done. Must be
// registered on the Pollar app (its redirect-URI allowlist) — the SDK's own
// default is the bare origin; we use a dedicated page so the popup can close itself.
const oauthRedirectUri = process.env.NEXT_PUBLIC_POLLAR_REDIRECT_URI
  || (typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined);

export function Providers({ children }: { children: React.ReactNode }) {
  const network = useNetwork();
  const active = MAINNET_LIVE ? network : 'testnet';
  const apiKey = pollarKeyFor(active);
  if (!apiKey) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-ink-muted text-sm">
        Set <code className="mx-1 px-1.5 py-0.5 rounded bg-cream-deep">NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY</code> to run the corridor app.
      </div>
    );
  }
  return (
    <PollarProvider key={active} client={{ apiKey, stellarNetwork: active, ...(oauthRedirectUri ? { oauthRedirectUri } : {}) }}>
      {children}
    </PollarProvider>
  );
}
