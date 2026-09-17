'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { weave, pollOrder, bankMatches, fmtNgn, STELLAR_USDC, NGN, shortG, type Bank } from '../../../lib/weave';

type Req = { id: string; status: string; orderId: string | null; ngnAmount: number; usdcNeeded: number; requester: { address: string; handle: string | null }; bob: { amount: number } };
type Mode = 'loading' | 'form' | 'pay' | 'done' | 'error';

export default function PayRequestClient({ id }: { id: string }) {
  const [req, setReq] = useState<Req | null>(null);
  const [mode, setMode] = useState<Mode>('loading');
  const [error, setError] = useState<string | null>(null);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [bankQuery, setBankQuery] = useState(''); const [bankCode, setBankCode] = useState('');
  const [acct, setAcct] = useState(''); const [acctName, setAcctName] = useState(''); const [resolving, setResolving] = useState(false); const [acctErr, setAcctErr] = useState<string | null>(null);
  const [order, setOrder] = useState<any>(null); const [bank, setBank] = useState<any>(null); const [copied, setCopied] = useState<string | null>(null);
  const acctRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/requests?id=${id}`).then(r => r.json()).then(async j => {
      if (!j.success) { setError('This request link is invalid or expired.'); setMode('error'); return; }
      setReq(j.data);
      if (j.data.orderId) {
        const o = await weave(`orders/${j.data.orderId}`);
        if (o.ok) { setOrder(o.data); setBank(o.data.steps?.[0]?.depositBankDetails ?? null); setMode(o.data.status === 'completed' ? 'done' : 'pay'); return; }
      }
      setMode('form');
    });
    weave('institutions?currency=NGN').then(r => r.ok && setBanks(r.data ?? []));
  }, [id]);

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

  async function start() {
    if (!req) return; setError(null);
    const r = await weave('orders', { body: {
      source: { inline: { kind: 'bank_account', assetKey: NGN, bankInstitution: bankCode, bankAccountIdentifier: acct, bankAccountName: acctName } },
      dest:   { inline: { kind: 'crypto_wallet', assetKey: STELLAR_USDC, walletAddress: req.requester.address } },
      amount: req.ngnAmount, amountIn: 'source', reference: `req-${req.id}`,
    } });
    if (!r.ok) { setError(r.error || 'Could not start'); return; }
    await fetch(`/api/requests/${req.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: r.data.order.id }) });
    setOrder(r.data.order); setBank(r.data.nextAction?.bankDetails ?? null);
    if (r.data.order.status === 'completed') { setMode('done'); return; }
    setMode('pay');
    try { const final = await pollOrder(r.data.order.id, setOrder); setMode(final.status === 'completed' ? 'done' : 'error'); if (final.status !== 'completed') setError('The transfer could not be completed.'); }
    catch (e: any) { setError(e.message); setMode('error'); }
  }
  const copy = (k: string, v: string) => navigator.clipboard.writeText(v).then(() => { setCopied(k); setTimeout(() => setCopied(null), 1500); });
  const who = req?.requester.handle ? `@${req.requester.handle}` : req ? shortG(req.requester.address) : '';

  const cardCls = 'rounded-3xl border border-hair bg-white/90 p-6 shadow-[0_20px_60px_-32px_rgba(0,0,0,0.25)]';
  const inputCls = 'field w-full px-4 py-3 text-[15px]';
  return (
    <div className="min-h-screen flex flex-col">
      <header className="mx-auto w-full max-w-md px-5 py-5 flex items-center gap-2"><span className="w-8 h-8 rounded-full bg-forest text-cream flex items-center justify-center font-display font-bold text-sm">W</span><span className="font-display font-semibold">Corridor</span><span className="ml-auto text-[12px] text-ink-faint">Pay from Nigeria</span></header>
      <main className="mx-auto w-full max-w-md px-5 pb-16">
        {mode === 'loading' && <div className={`${cardCls} text-ink-muted text-sm`}>Loading…</div>}
        {mode === 'error' && <div className={cardCls}><div className="font-display text-[20px] font-semibold text-terracotta">Can't continue</div><p className="mt-2 text-[14px] text-ink-muted">{error}</p></div>}
        {mode === 'form' && req && (
          <div className={`${cardCls} space-y-5`}>
            <div><div className="text-[12px] uppercase tracking-wide text-ink-muted">Request from {who}</div><div className="mt-1 font-display text-[32px] font-semibold">{fmtNgn(req.ngnAmount)}</div><div className="text-[13px] text-ink-muted">They receive Bs {req.bob.amount.toFixed(2)} in Bolivia. You pay by bank transfer.</div></div>
            <div className="relative"><span className="block text-[11.5px] font-semibold uppercase tracking-wide text-ink-soft mb-2">Your bank (for refunds if anything fails)</span><input value={bankQuery} onChange={e => { setBankQuery(e.target.value); setBankCode(''); }} placeholder="GTBank, OPay, Kuda…" className={inputCls} />
              {filtered.length > 0 && <div className="absolute z-20 left-0 right-0 mt-1 rounded-2xl border border-hair bg-white shadow-xl overflow-hidden">{filtered.map(b => <button key={b.code} onClick={() => { setBankCode(b.code); setBankQuery(b.name); setTimeout(() => acctRef.current?.focus(), 50); }} className="block w-full text-left px-4 py-2.5 text-[14px] hover:bg-cream-soft">{b.name}</button>)}</div>}</div>
            {bankCode && <div><span className="block text-[11.5px] font-semibold uppercase tracking-wide text-ink-soft mb-2">Your account number</span><input ref={acctRef} inputMode="numeric" value={acct} onChange={e => setAcct(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="0123456789" className={`${inputCls} tracking-widest`} /><div className={`mt-2 text-[13px] min-h-5 ${acctErr ? 'text-terracotta' : 'text-forest-deep font-semibold'}`}>{resolving ? <span className="text-ink-muted font-normal">Checking…</span> : acctName || acctErr}</div></div>}
            {error && <p className="text-[13px] text-terracotta bg-terracotta-soft rounded-xl px-3 py-2">{error}</p>}
            <button disabled={!acctName} onClick={start} className={`w-full rounded-2xl py-3.5 text-[15px] font-semibold text-cream ${acctName ? 'bg-forest hover:bg-forest-deep' : 'bg-forest/40'}`}>Get transfer details</button>
          </div>
        )}
        {mode === 'pay' && (
          <div className={`${cardCls} space-y-4`}>
            <div className="font-display text-[20px] font-semibold">Transfer exactly this amount</div>
            {bank ? <dl className="divide-y divide-hair">{[['Bank', bank.institution, 'b'], ['Account number', bank.accountIdentifier, 'n'], ['Account name', bank.accountName, 'a'], ['Amount', `₦${Number(bank.amountToTransfer).toLocaleString()}`, 'm']].map(([k, v, key]) => <div key={key} className="flex justify-between items-center py-2.5 text-[14px]"><dt className="text-ink-muted">{k}</dt><dd><button onClick={() => copy(key, String(v))} className="font-mono">{copied === key ? 'Copied ✓' : v}</button></dd></div>)}</dl> : <p className="text-[14px] text-ink-muted">Preparing bank details…</p>}
            <div className="flex items-center gap-2 text-[13px] text-ink-muted"><span className="w-3.5 h-3.5 rounded-full border-2 border-hair border-t-forest animate-spin" />Waiting for your transfer… ({order?.status})</div>
          </div>
        )}
        {mode === 'done' && <div className={`${cardCls} text-center`}><div className="mx-auto w-14 h-14 rounded-full bg-forest-mist text-forest-deep flex items-center justify-center text-2xl">✓</div><div className="mt-3 font-display text-[22px] font-semibold">Paid</div><p className="mt-1 text-[14px] text-ink-muted">{who} is receiving Bs {req?.bob.amount.toFixed(2)}. Thank you.</p></div>}
      </main>
    </div>
  );
}
