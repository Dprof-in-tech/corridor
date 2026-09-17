'use client';

import { PollarProvider } from '@pollar/react';

// Pollar owns identity + the Stellar wallet + the LatAm ramps; Weave owns the
// Nigerian leg. One provider at the root gives every page usePollar().
const apiKey = process.env.NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY || '';
const stellarNetwork = (process.env.NEXT_PUBLIC_POLLAR_NETWORK === 'mainnet' ? 'mainnet' : 'testnet') as 'mainnet' | 'testnet';

export function Providers({ children }: { children: React.ReactNode }) {
  if (!apiKey) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-ink-muted text-sm">
        Set <code className="mx-1 px-1.5 py-0.5 rounded bg-cream-deep">NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY</code> to run the corridor app.
      </div>
    );
  }
  return <PollarProvider client={{ apiKey, stellarNetwork }}>{children}</PollarProvider>;
}
