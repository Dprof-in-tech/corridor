'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePollar } from '@pollar/react';
import { Shell, card, input, label, primary } from '../../../components/Shell';
import { weave, pollOrder, bankMatches, fmtNgn, fmtUsdc, STELLAR_USDC, NGN, type Bank } from '../../../lib/weave';

// Add naira: a Nigerian bank transfer → Paycrest onramp → USDC on Base →
// NEAR Intents → USDC in THIS Pollar wallet. The payer's own bank doubles as
// Paycrest's refund account. (NEAR's Stellar route is paused at the moment,
// so this direction runs against Weave sandbox until it resumes.)

type Mode = 'form' | 'pay' | 'done' | 'error';

export default function ReceiveNigeria() {
  const { wallet, refreshWalletBalance } = usePollar();
  const [mode, setMode] = useState<Mode>('form');
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [estimate, setEstimate] = useState<number | null>(null);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [bankQuery, setBankQuery] = useState(''); const [bankCode, setBankCode] = useState('');
  const [acct, setAcct] = useState(''); const [acctName, setAcctName] = useState(''); const [resolving, setResolving] = useState(false); const [acctErr, setAcctErr] = useState<string | null>(null);
  const [order, setOrder] = useState<any>(null);
  const [bank, setBank] = useState<any>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const acctRef = useRef<HTMLInputElement>(null);

  useEffect(() => { weave('institutions?currency=NGN').then(r => r.ok && setBanks(r.data ?? [])); }, []);
  useEffect(() => {
    const a = Number(amount); if (!a) { setEstimate(null); return; }
    let live = true; const t = setTimeout(() => weave(`quotes?from=${NGN}&to=${STELLAR_USDC}&amount=${a}&amountIn=source`).then(r => live && setEstimate(r.ok ? r.data.estimatedDest : null)), 400);
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
  const can = a >= 1000 && !!acctName;

  async function start() {
    if (!wallet) return;
    setError(null);
    const r = await weave('orders', { body: {
      source: { inline: { kind: 'bank_account', assetKey: NGN, bankInstitution: bankCode, bankAccountIdentifier: acct, bankAccountName: acctName } },
      dest:   { inline: { kind: 'crypto_wallet', assetKey: STELLAR_USDC, walletAddress: wallet.address } },
      amount: a, amountIn: 'source',
    } });
    if (!r.ok) { setError(r.error || 'Could not start'); return; }
    setOrder(r.data.order); setBank(r.data.nextAction?.bankDetails ?? null);
    if (r.data.order.status === 'completed') { setMode('done'); void refreshWalletBalance(); return; }
    setMode('pay');
    try {
      const final = await pollOrder(r.data.order.id, setOrder);
      setMode(final.status === 'completed' ? 'done' : 'error');
      if (final.status !== 'completed') setError('The deposit could not be completed.');
      void refreshWalletBalance();
    } catch (e: any) { setError(e.message); setMode('error'); }
  }
  const copy = (k: string, v: string) => navigator.clipboard.writeText(v).then(() => { setCopied(k); setTimeout(() => setCopied(null), 1500); });

  return (
    <Shell title="Add naira" back="/app">
      {mode === 'form' && (
        <div className={`${card} reveal space-y-5`}>
          <div>
            <span className={label}>How much naira?</span>
            <div className="flex items-center gap-3 rounded-2xl border border-hair bg-white px-4">
              <span className="text-ink-muted font-semibold">₦</span>
              <input inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value.replace(/\D/g, ''))} placeholder="50,000" autoFocus className="flex-1 py-3.5 text-[24px] font-semibold outline-none bg-transparent" />
              <span className="text-[13px] font-semibold text-ink-muted">NGN</span>
            </div>
            <div className="mt-2 text-[13px] text-ink-muted min-h-5">{a > 0 && a < 1000 ? <span className="text-terracotta">Minimum ₦1,000.</span> : estimate != null ? <>You'll receive about <b className="text-ink">{fmtUsdc(estimate)}</b></> : ''}</div>
          </div>
          {a >= 1000 && (
            <div className="reveal relative">
              <span className={label}>The bank you'll pay from (for refunds)</span>
              <input value={bankQuery} onChange={e => { setBankQuery(e.target.value); setBankCode(''); }} placeholder="Your bank" className={input} />
              {filtered.length > 0 && <div className="absolute z-20 left-0 right-0 mt-1 rounded-2xl border border-hair bg-white shadow-xl overflow-hidden">{filtered.map(b => <button key={b.code} onClick={() => { setBankCode(b.code); setBankQuery(b.name); setTimeout(() => acctRef.current?.focus(), 50); }} className="block w-full text-left px-4 py-2.5 text-[14px] hover:bg-cream-soft">{b.name}</button>)}</div>}
            </div>
          )}
          {bankCode && (
            <div className="reveal">
              <span className={label}>Your account number</span>
              <input ref={acctRef} inputMode="numeric" value={acct} onChange={e => setAcct(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="0123456789" className={`${input} tracking-widest`} />
              <div className={`mt-2 text-[13px] min-h-5 ${acctErr ? 'text-terracotta' : 'text-forest-deep font-semibold'}`}>{resolving ? <span className="text-ink-muted font-normal">Checking…</span> : acctName || acctErr}</div>
            </div>
          )}
          {error && <p className="text-[13px] text-terracotta bg-terracotta-soft rounded-xl px-3 py-2">{error}</p>}
          <button disabled={!can} onClick={start} className={primary(can)}>Get transfer details</button>
        </div>
      )}
      {mode === 'pay' && (
        <div className={`${card} reveal space-y-4`}>
          <div className="font-display text-[20px] font-semibold">Transfer exactly this amount</div>
          {bank ? (
            <dl className="divide-y divide-hair">
              {[['Bank', bank.institution, 'b'], ['Account number', bank.accountIdentifier, 'n'], ['Account name', bank.accountName, 'a'], ['Amount', `₦${Number(bank.amountToTransfer).toLocaleString()}`, 'm']].map(([k, v, id]) => (
                <div key={id} className="flex justify-between items-center py-2.5 text-[14px]"><dt className="text-ink-muted">{k}</dt><dd><button onClick={() => copy(id, String(v))} className="font-mono text-ink">{copied === id ? 'Copied ✓' : v}</button></dd></div>
              ))}
            </dl>
          ) : <p className="text-ink-muted text-[14px]">Preparing bank details…</p>}
          <div className="flex items-center gap-2 text-[13px] text-ink-muted"><span className="w-3.5 h-3.5 rounded-full border-2 border-hair border-t-forest animate-spin" />Waiting for your transfer… USDC will appear in your wallet automatically. ({order?.status})</div>
        </div>
      )}
      {mode === 'done' && (
        <div className={`${card} reveal text-center`}>
          <div className="mx-auto w-14 h-14 rounded-full bg-forest-mist text-forest-deep flex items-center justify-center text-2xl">✓</div>
          <div className="mt-3 font-display text-[22px] font-semibold">USDC received</div>
          <p className="mt-1 text-[14px] text-ink-muted">{fmtUsdc(order?.destAmount)} is in your wallet from {fmtNgn(order?.sourceAmount)}.</p>
          <button onClick={() => { setMode('form'); setOrder(null); setAmount(''); }} className={`${primary(true)} mt-5`}>Add more</button>
        </div>
      )}
      {mode === 'error' && (
        <div className={`${card} reveal`}><div className="font-display text-[20px] font-semibold text-terracotta">Something went wrong</div><p className="mt-2 text-[14px] text-ink-muted">{error}</p><button onClick={() => setMode('form')} className={`${primary(true)} mt-5`}>Try again</button></div>
      )}
    </Shell>
  );
}
