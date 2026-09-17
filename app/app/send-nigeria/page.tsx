'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePollar } from '@pollar/react';
import { Shell, card, input, label, primary } from '../../../components/Shell';
import { weave, bankMatches, fmtNgn, fmtUsdc, STELLAR_USDC, NGN, type Bank } from '../../../lib/weave';
import { type Stage } from '../../../lib/stellar-bridge';
import { createNigeriaSend, executeNigeriaSend } from '../../../lib/nigeria-send';

// Send to a Nigerian bank: USDC leaves the Pollar wallet on Stellar, burns via
// CCTP, mints on Base straight into a Paycrest offramp, naira lands in the bank.
// Weave plans + binds the hops; Pollar signs the two Stellar transactions.

type Mode = 'form' | 'signing' | 'settling' | 'done' | 'error';

export default function SendNigeria() {
  const { wallet, signAndSubmitTx, walletBalance, refreshWalletBalance } = usePollar();
  const usdcBal = walletBalance.step === 'loaded' ? Number(walletBalance.data.balances.find(b => b.code === 'USDC')?.balance ?? 0) : null;

  const [mode, setMode] = useState<Mode>('form');
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [estimate, setEstimate] = useState<number | null>(null);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [bankQuery, setBankQuery] = useState(''); const [bankCode, setBankCode] = useState('');
  const [acct, setAcct] = useState(''); const [acctName, setAcctName] = useState(''); const [resolving, setResolving] = useState(false); const [acctErr, setAcctErr] = useState<string | null>(null);
  const [order, setOrder] = useState<any>(null);
  const [stage, setStage] = useState<Stage | 'quote' | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [standing, setStanding] = useState(false);
  const acctRef = useRef<HTMLInputElement>(null);

  useEffect(() => { weave('institutions?currency=NGN').then(r => r.ok && setBanks(r.data ?? [])); }, []);

  useEffect(() => {
    const a = Number(amount); if (!a) { setEstimate(null); return; }
    let live = true; const t = setTimeout(() => {
      weave(`quotes?from=${STELLAR_USDC}&to=${NGN}&amount=${a}&amountIn=source`).then(r => { if (live) setEstimate(r.ok ? r.data.estimatedDest : null); });
    }, 400);
    return () => { live = false; clearTimeout(t); };
  }, [amount]);

  useEffect(() => {
    setAcctName(''); setAcctErr(null);
    if (!bankCode || acct.length < 10) return;
    let live = true; setResolving(true);
    weave('institutions/verify', { body: { institution: bankCode, accountIdentifier: acct, currency: 'NGN' } })
      .then(r => { if (!live) return; if (r.ok && r.data) setAcctName(String(r.data)); else setAcctErr('Account not found — check the number and bank.'); })
      .finally(() => live && setResolving(false));
    return () => { live = false; };
  }, [bankCode, acct]);

  const filtered = useMemo(() => bankQuery && !bankCode ? banks.filter(b => bankMatches(b.name, bankQuery)).slice(0, 6) : [], [banks, bankQuery, bankCode]);
  const a = Number(amount);
  const tooLow = a > 0 && a < 2;
  const tooHigh = usdcBal != null && a > usdcBal;
  const can = a >= 2 && !tooHigh && !!acctName && mode === 'form';

  async function send() {
    if (!wallet) return;
    setError(null); setMode('signing'); setStage('quote');
    try {
      const created = await createNigeriaSend(wallet.address, a, { bankCode, bankName: bankQuery, accountNumber: acct, accountName: acctName });
      setOrder(created.order);
      // Pollar signs (custodial: server-side; external wallet: in-extension) and submits.
      const { order: final, hash: h } = await executeNigeriaSend(
        created, signAndSubmitTx as any,
        (s, d) => { setStage(s as any); if (s === 'done') { setHash(d ?? null); setMode('settling'); } },
        setOrder, { standing },
      );
      setHash(h);
      setMode(final.status === 'completed' ? 'done' : 'error');
      if (final.status !== 'completed') setError(final.status === 'refunded' ? 'The transfer was refunded to your wallet.' : 'The transfer could not be completed.');
      void refreshWalletBalance();
    } catch (e: any) { setError(e?.message ?? 'Something went wrong'); setMode(order ? 'error' : 'form'); }
  }

  const stageLabel: Record<string, string> = { quote: 'Locking the rate and opening the payout…', approve: 'Sign 1 of 2 — allow USDC to move', bridge: 'Sign 2 of 2 — bridge to the payout', submitting: 'Submitting…', done: 'Bridging via Circle CCTP…' };

  return (
    <Shell title="Send to a Nigerian bank" back="/app">
      {mode === 'form' && (
        <div className={`${card} reveal space-y-5`}>
          <div>
            <span className={label}>Amount to send</span>
            <div className="flex items-center gap-3 rounded-2xl border border-hair bg-white px-4">
              <span className="text-ink-muted font-semibold">$</span>
              <input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="25" autoFocus className="flex-1 py-3.5 text-[24px] font-semibold outline-none bg-transparent" />
              <span className="text-[13px] font-semibold text-ink-muted">USDC</span>
            </div>
            <div className="mt-2 text-[13px] text-ink-muted min-h-5">
              {tooLow ? <span className="text-terracotta">Minimum is 2 USDC (bridge floor).</span> : tooHigh ? <span className="text-terracotta">You have {fmtUsdc(usdcBal)}.</span> : estimate != null ? <>They receive about <b className="text-ink">{fmtNgn(estimate)}</b></> : usdcBal != null ? `Balance ${fmtUsdc(usdcBal)}` : ''}
            </div>
          </div>
          {a >= 2 && (
            <div className="reveal relative">
              <span className={label}>Recipient bank</span>
              <input value={bankQuery} onChange={e => { setBankQuery(e.target.value); setBankCode(''); }} placeholder="GTBank, OPay, PalmPay, Kuda…" className={input} />
              {filtered.length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 rounded-2xl border border-hair bg-white shadow-xl overflow-hidden">
                  {filtered.map(b => <button key={b.code} onClick={() => { setBankCode(b.code); setBankQuery(b.name); setTimeout(() => acctRef.current?.focus(), 50); }} className="block w-full text-left px-4 py-2.5 text-[14px] hover:bg-cream-soft">{b.name}</button>)}
                </div>
              )}
            </div>
          )}
          {bankCode && (
            <div className="reveal">
              <span className={label}>Account number</span>
              <input ref={acctRef} inputMode="numeric" value={acct} onChange={e => setAcct(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="0123456789" className={`${input} tracking-widest`} />
              <div className={`mt-2 text-[13px] min-h-5 ${acctErr ? 'text-terracotta' : 'text-forest-deep font-semibold'}`}>{resolving ? <span className="text-ink-muted font-normal">Checking…</span> : acctName || acctErr}</div>
            </div>
          )}
          {acctName && (
            <label className="flex items-start gap-3 text-[13px] text-ink-soft cursor-pointer">
              <input type="checkbox" checked={standing} onChange={e => setStanding(e.target.checked)} className="mt-0.5 accent-[#3D6B50]" />
              <span><b>Approve future sends</b> — one bounded allowance (up to 1,000 USDC, ~30 days) to Circle's CCTP contract, so your next transfers need a single signature.</span>
            </label>
          )}
          {error && <p className="text-[13px] text-terracotta bg-terracotta-soft rounded-xl px-3 py-2">{error}</p>}
          <button disabled={!can} onClick={send} className={primary(can)}>{a ? `Send ${fmtUsdc(a)}` : 'Send'}</button>
          <p className="text-[11.5px] text-ink-faint text-center">0.85% Weave + 0.25% bridge · ~3 min · non-custodial: USDC burns on Stellar, mints into the payout</p>
        </div>
      )}

      {(mode === 'signing' || mode === 'settling') && (
        <div className={`${card} reveal space-y-4`}>
          <div className="font-display text-[20px] font-semibold">{mode === 'signing' ? 'Approve in your wallet' : 'On its way'}</div>
          <Timeline items={[
            ['Payout opened in Nigeria', !!order],
            ['USDC allowance signed', ['bridge', 'submitting', 'done'].includes(stage as string) || mode === 'settling'],
            ['Bridge signed & submitted', ['done'].includes(stage as string) || mode === 'settling'],
            ['Minted on Base → Paycrest', order?.steps?.[0]?.status === 'done'],
            ['Naira paid to bank', order?.status === 'completed'],
          ]} />
          <div className="flex items-center gap-2 text-[13px] text-ink-muted">
            <span className="w-3.5 h-3.5 rounded-full border-2 border-hair border-t-forest animate-spin" />
            {mode === 'signing' ? stageLabel[stage ?? 'quote'] : `Settling… ${order?.status ?? ''}`}
          </div>
          {order && <div className="text-[12.5px] text-ink-muted">Recipient gets <b className="text-ink">{fmtNgn(order.destAmount)}</b> · {acctName}</div>}
          {hash && <a className="text-[12px] text-forest underline" target="_blank" rel="noreferrer" href={`https://stellar.expert/explorer/public/tx/${hash}`}>View Stellar transaction</a>}
        </div>
      )}

      {mode === 'done' && (
        <div className={`${card} reveal text-center`}>
          <div className="mx-auto w-14 h-14 rounded-full bg-forest-mist text-forest-deep flex items-center justify-center text-2xl">✓</div>
          <div className="mt-3 font-display text-[22px] font-semibold">Naira delivered</div>
          <p className="mt-1 text-[14px] text-ink-muted">{fmtNgn(order?.destAmount)} sent to {acctName} · {bankQuery}</p>
          {hash && <a className="mt-3 inline-block text-[12px] text-forest underline" target="_blank" rel="noreferrer" href={`https://stellar.expert/explorer/public/tx/${hash}`}>Stellar transaction</a>}
          <button onClick={() => { setMode('form'); setOrder(null); setHash(null); setAmount(''); setBankCode(''); setBankQuery(''); setAcct(''); setAcctName(''); setStage(null); }} className={`${primary(true)} mt-5`}>Send another</button>
        </div>
      )}

      {mode === 'error' && (
        <div className={`${card} reveal`}>
          <div className="font-display text-[20px] font-semibold text-terracotta">Something went wrong</div>
          <p className="mt-2 text-[14px] text-ink-muted">{error}</p>
          {order && <p className="mt-2 text-[12px] text-ink-faint">Reference {order.id}</p>}
          <button onClick={() => setMode('form')} className={`${primary(true)} mt-5`}>Try again</button>
        </div>
      )}
    </Shell>
  );
}

function Timeline({ items }: { items: Array<[string, boolean]> }) {
  return (
    <ol className="space-y-2">
      {items.map(([t, done], i) => (
        <li key={i} className="flex items-center gap-3 text-[14px]">
          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${done ? 'bg-forest text-cream' : 'border border-hair text-ink-faint'}`}>{done ? '✓' : i + 1}</span>
          <span className={done ? 'text-ink' : 'text-ink-muted'}>{t}</span>
        </li>
      ))}
    </ol>
  );
}
