'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePollar } from '@pollar/react';
import { shortG } from '../lib/weave';

// Authenticated frame: header with the Pollar wallet chip, cream canvas.
export function Shell({ children, title, back }: { children: React.ReactNode; title?: string; back?: string }) {
  const { isAuthenticated, wallet, logout, walletBalance, refreshWalletBalance, getClient } = usePollar();
  const router = useRouter();

  // Don't bounce to the landing page until the SDK has had a chance to restore
  // a persisted session — on a hard load isAuthenticated is false for a tick.
  const [ready, setReady] = useState(false);
  useEffect(() => { let live = true; getClient().ready().then(() => live && setReady(true)).catch(() => live && setReady(true)); return () => { live = false; }; }, [getClient]);
  useEffect(() => { if (ready && !isAuthenticated) router.replace('/'); }, [ready, isAuthenticated, router]);
  useEffect(() => { if (isAuthenticated && walletBalance.step === 'idle') void refreshWalletBalance(); }, [isAuthenticated, walletBalance.step, refreshWalletBalance]);

  const usdc = walletBalance.step === 'loaded' ? walletBalance.data.balances.find(b => b.code === 'USDC')?.balance : null;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 border-b border-hair-soft bg-cream/85 backdrop-blur-md">
        <div className="mx-auto max-w-2xl px-5 py-3 flex items-center gap-3">
          <Link href="/app" className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-forest text-cream flex items-center justify-center font-display font-bold text-sm">W</span>
            <span className="font-display font-semibold text-ink text-[17px]">Corridor</span>
            <span className="hidden sm:inline text-[11px] uppercase tracking-wider text-ink-faint ml-1">Weave × Pollar</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            {wallet && (
              <div className="flex items-center gap-2 rounded-full border border-hair bg-cream-soft px-3 py-1.5 text-[12.5px]">
                <button title={wallet.address} onClick={() => navigator.clipboard.writeText(wallet.address).catch(() => {})} className="font-mono text-ink-soft hover:text-ink" aria-label="Copy wallet address">{shortG(wallet.address)}</button>
                <span className="text-ink-faint">·</span>
                <span className="font-semibold text-forest-deep">{usdc != null ? `${Number(usdc).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC` : '…'}</span>
              </div>
            )}
            <button onClick={() => logout()} className="text-[12.5px] text-ink-muted hover:text-ink px-2 py-1.5">Sign out</button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl px-5 py-7 flex-1">
        {(title || back) && (
          <div className="mb-5 flex items-center gap-3">
            {back && <Link href={back} className="text-ink-muted hover:text-ink text-sm">← Back</Link>}
            {title && <h1 className="font-display text-[26px] font-semibold text-ink">{title}</h1>}
          </div>
        )}
        {children}
      </main>
      <footer className="py-6 text-center text-[11.5px] text-ink-faint">Non-custodial · Stellar · Weave anchors Nigeria · Pollar ramps Bolivia</footer>
    </div>
  );
}

export const card = 'rounded-3xl border border-hair bg-white/85 backdrop-blur p-5 shadow-[0_20px_60px_-32px_rgba(0,0,0,0.25)]';
export const input = 'field w-full px-4 py-3 text-[15px] text-ink';
export const label = 'block text-[11.5px] font-semibold uppercase tracking-wide text-ink-soft mb-2';
export const primary = (on: boolean) => `w-full rounded-2xl py-3.5 text-[15px] font-semibold text-cream transition ${on ? 'bg-forest hover:bg-forest-deep' : 'bg-forest/40 cursor-not-allowed'}`;
