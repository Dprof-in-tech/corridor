'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePollar } from '@pollar/react';
import { Shell, card } from '../../components/Shell';
import { shortG } from '../../lib/weave';

export default function Home() {
  const { wallet, walletBalance, refreshWalletBalance, openRampModal, openReceiveModal, openTxHistoryModal } = usePollar();
  const usdc = walletBalance.step === 'loaded' ? Number(walletBalance.data.balances.find(b => b.code === 'USDC')?.balance ?? 0) : null;
  const xlm  = walletBalance.step === 'loaded' ? Number(walletBalance.data.balances.find(b => b.code === 'XLM' || b.type === 'native')?.balance ?? 0) : null;

  // Claim a handle so friends can pay "@you".
  const [handle, setHandle] = useState(''); const [claimed, setClaimed] = useState<string | null>(null); const [hErr, setHErr] = useState<string | null>(null);
  useEffect(() => { try { setClaimed(localStorage.getItem('corridor.handle')); } catch {} }, []);
  async function claim() {
    setHErr(null);
    const r = await fetch('/api/directory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle, address: wallet?.address }) }).then(r => r.json());
    if (r.success) { setClaimed(r.data.handle); try { localStorage.setItem('corridor.handle', r.data.handle); } catch {} } else setHErr(r.error);
  }

  const Action = ({ href, onClick, title, sub, tag }: { href?: string; onClick?: () => void; title: string; sub: string; tag: string }) => {
    const inner = (
      <div className={`${card} h-full flex flex-col gap-2 transition hover:-translate-y-0.5 hover:border-forest/60 cursor-pointer`}>
        <span className="text-[11px] uppercase tracking-wider text-forest font-semibold">{tag}</span>
        <span className="font-display text-[19px] font-semibold text-ink">{title}</span>
        <span className="text-[13px] text-ink-muted">{sub}</span>
      </div>
    );
    return href ? <Link href={href}>{inner}</Link> : <button onClick={onClick} className="text-left">{inner}</button>;
  };

  return (
    <Shell>
      <section className={`${card} reveal`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11.5px] uppercase tracking-wide text-ink-muted">Your Stellar wallet</div>
            <div className="mt-1 font-display text-[34px] font-semibold text-ink">{usdc == null ? '…' : usdc.toLocaleString(undefined, { maximumFractionDigits: 2 })} <span className="text-[16px] text-ink-muted font-body font-medium">USDC</span></div>
            <div className="mt-1 text-[12.5px] text-ink-muted font-mono">{wallet ? shortG(wallet.address) : ''}{xlm != null && <span className="ml-2 font-body">· {xlm.toFixed(2)} XLM for fees</span>}</div>
          </div>
          <div className="flex flex-col gap-2 text-right">
            <button onClick={() => refreshWalletBalance()} className="text-[12.5px] text-ink-muted hover:text-ink">Refresh</button>
            <button onClick={() => openTxHistoryModal()} className="text-[12.5px] text-ink-muted hover:text-ink">History</button>
            <button onClick={() => openReceiveModal()} className="text-[12.5px] text-ink-muted hover:text-ink">Receive</button>
          </div>
        </div>
        {xlm != null && xlm < 2 && <p className="mt-3 text-[12.5px] text-tan-deep bg-tan-mist rounded-xl px-3 py-2">Sending to Nigeria needs about 2 XLM in your wallet for Stellar network fees.</p>}
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px]">
          {claimed ? (
            <span className="rounded-full bg-forest-mist text-forest-deep px-3 py-1">Friends can pay you at <b>@{claimed}</b></span>
          ) : (
            <>
              <span className="text-ink-muted">Claim a handle:</span>
              <input value={handle} onChange={e => setHandle(e.target.value.toLowerCase())} placeholder="ada" className="field !rounded-full px-3 py-1 w-32" />
              <button onClick={claim} disabled={handle.length < 3} className="rounded-full bg-ink text-cream px-3 py-1 disabled:opacity-40">Claim</button>
              {hErr && <span className="text-terracotta">{hErr}</span>}
            </>
          )}
        </div>
      </section>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Action href="/app/send-nigeria"    tag="Nigeria · out" title="Send to a Nigerian bank" sub="USDC → naira in ~3 minutes. Any bank, OPay, PalmPay, Moniepoint." />
        <Action href="/app/receive-nigeria" tag="Nigeria · in"  title="Add naira" sub="Pay by bank transfer from Nigeria; USDC lands in this wallet." />
        <Action href="/app/bob-to-nigeria"  tag="Bolivia → Nigeria · chained" title="Pay a Nigerian bank in BOB" sub="Scan one BOB QR; naira lands in their bank. USDC never stops in between." />
        <Action href="/app/request-naira"   tag="Nigeria → Bolivia · chained" title="Receive naira as BOB" sub="Share a link; a Nigerian pays by bank transfer, bolivianos land in your bank." />
        <Action onClick={() => openRampModal()} tag="Bolivia · Pollar" title="Cash out or top up in BOB" sub="Bank QR in, ACH out — Pollar's Bolivian ramp." />
        <Action href="/app/send-friend"     tag="Anywhere" title="Pay a friend" sub="Send USDC to an @handle or Stellar address. Instant, near-free." />
      </div>

      <p className="mt-8 text-[12.5px] text-ink-faint leading-relaxed">
        How it works: Weave is a Stellar SEP-24 anchor for the naira. USDC burns on Stellar and mints on Base straight into the Nigerian payout (Circle CCTP via LI.FI, then Paycrest). The reverse leg lands USDC back in your Pollar wallet. No one custodies funds in between.
      </p>
    </Shell>
  );
}
