'use client';

import { useEffect, useState } from 'react';
import { usePollar } from '@pollar/react';
import { Shell, card, input, label, primary } from '../../../components/Shell';
import { weave, fmtNgn, fmtUsdc, STELLAR_USDC, NGN } from '../../../lib/weave';
import { usdcForBob, type RampQuote } from '../../../lib/pollar-ramps';

// Nigeria → Bolivia as a REQUEST. The Bolivian says how many BOB they want;
// we size the USDC (Pollar off-ramp quote) and the naira (Weave quote), mint a
// share link for the Nigerian payer, and — because Pollar's ramps run in the
// wallet owner's session — this page, while open, fires the BOB payout the
// moment USDC lands. Nobody in the middle holds anything.

type Req = { id: string; status: string; orderId: string | null; ngnAmount: number; usdcNeeded: number; bob: { amount: number; provider: string; rail: string; fields: Record<string, string> }; offrampTxId: string | null };

export default function RequestNaira() {
  const { wallet, getClient, refreshWalletBalance } = usePollar();
  const [bobAmount, setBobAmount] = useState('');
  const [quote, setQuote] = useState<{ usdc: number; quote: RampQuote } | null>(null);
  const [ngn, setNgn] = useState<number | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [req, setReq] = useState<Req | null>(null);
  const [order, setOrder] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [offramp, setOfframp] = useState<any>(null);

  // Quote both legs from the BOB amount.
  useEffect(() => {
    const b = Number(bobAmount); if (!b) { setQuote(null); setNgn(null); return; }
    let live = true; const t = setTimeout(async () => {
      try {
        const q = await usdcForBob(getClient(), b);
        if (!live) return; setQuote(q);
        // NGN needed for q.usdc on Stellar: derive from a source-anchored Weave quote (+1% buffer for rate drift).
        const probe = await weave(`quotes?from=${NGN}&to=${STELLAR_USDC}&amount=100000&amountIn=source`);
        if (!live) return;
        const usdcPer100k = probe.ok ? Number(probe.data.estimatedDest) : 0;
        setNgn(usdcPer100k > 0 ? Math.ceil((q.usdc / usdcPer100k) * 100000 * 1.01 / 100) * 100 : null);
      } catch (e: any) { if (live) { setQuote(null); setError(e.message); } }
    }, 450);
    return () => { live = false; clearTimeout(t); };
  }, [bobAmount, getClient]);

  const required = quote?.quote.requiredFields ?? [];
  const fieldsOk = required.every(f => f.optional || (fields[f.key] ?? '').trim());
  const can = !!quote && !!ngn && fieldsOk && !busy;

  async function create() {
    if (!wallet || !quote || !ngn) return;
    setBusy(true); setError(null);
    let handle: string | null = null; try { handle = localStorage.getItem('corridor.handle'); } catch {}
    const r = await fetch('/api/requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      address: wallet.address, handle, bobAmount: Number(bobAmount), usdcNeeded: quote.usdc * 1.005, ngnAmount: ngn,
      provider: quote.quote.provider, rail: quote.quote.rail, fields,
    }) }).then(r => r.json());
    setBusy(false);
    if (!r.success) { setError(r.error); return; }
    setReq(r.data);
  }

  // Watch the request → the Weave order → then fire the BOB off-ramp in THIS session.
  useEffect(() => {
    if (!req || req.status === 'cashed_out') return;
    let stopped = false; let t: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (stopped) return;
      try {
        const rr = await fetch(`/api/requests?id=${req.id}`).then(r => r.json());
        if (rr.success) setReq(rr.data);
        const cur: Req = rr.data ?? req;
        if (cur.orderId) {
          const o = await weave(`orders/${cur.orderId}`);
          if (o.ok) setOrder(o.data);
          if (o.ok && o.data.status === 'completed' && cur.status !== 'cashed_out' && !offramp) {
            stopped = true;
            await cashOut(cur, Number(o.data.destAmount));
            return;
          }
        }
      } catch { /* keep polling */ }
      t = setTimeout(tick, 5000);
    };
    tick();
    return () => { stopped = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req?.id, req?.orderId, offramp]);

  async function cashOut(cur: Req, usdcLanded: number) {
    if (!wallet) return;
    try {
      setBusy(true);
      // Fresh quote for what actually arrived (Pollar re-quotes the provider at execution anyway).
      const fresh = await getClient().getRampsQuote({ country: 'BO', currency: 'BOB', direction: 'offramp', amount: cur.bob.amount });
      const q = (fresh.quotes as any[]).find(x => x.recommended) ?? fresh.quotes[0];
      if (!q) throw new Error('No Bolivian payout route available right now.');
      const need = q.cryptoAmount != null ? Number(q.cryptoAmount) : cur.bob.amount / Number(q.rate);
      if (need > usdcLanded * 1.0001) throw new Error(`${fmtUsdc(usdcLanded)} arrived but the payout now needs ${fmtUsdc(need)}. Cash out manually from the ramp menu.`);
      const bankField = (q.requiredFields ?? []).find((f: any) => f.bankType);
      const out = await getClient().createOffRamp({
        quoteId: q.quoteId, amount: cur.bob.amount, currency: 'BOB', country: 'BO', walletAddress: wallet.address,
        ...(bankField && cur.bob.fields[bankField.key] ? { bankDetails: { type: bankField.bankType, value: cur.bob.fields[bankField.key] } } : {}),
        fields: cur.bob.fields,
      });
      setOfframp(out);
      await fetch(`/api/requests/${cur.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: out.kycUrl ? 'funded' : 'cashed_out', offrampTxId: out.txId }) });
      void refreshWalletBalance();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  }

  const link = req ? `${typeof window !== 'undefined' ? window.location.origin : ''}/r/${req.id}` : '';

  return (
    <Shell title="Receive naira as BOB" back="/app">
      {!req ? (
        <div className={`${card} reveal space-y-5`}>
          <p className="text-[13.5px] text-ink-muted">Someone in Nigeria pays naira by bank transfer; bolivianos land in your bank. Keep this page open — it completes the payout when the money arrives.</p>
          <div>
            <span className={label}>You want to receive</span>
            <div className="flex items-center gap-3 rounded-2xl border border-hair bg-white px-4"><span className="text-ink-muted font-semibold">Bs</span><input inputMode="decimal" value={bobAmount} onChange={e => setBobAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="200" autoFocus className="flex-1 py-3.5 text-[24px] font-semibold outline-none bg-transparent" /><span className="text-[13px] font-semibold text-ink-muted">BOB</span></div>
            <div className="mt-2 text-[13px] text-ink-muted min-h-5">{quote ? <>≈ {fmtUsdc(quote.usdc)} via {quote.quote.provider} · payer sends <b className="text-ink">{fmtNgn(ngn)}</b></> : ''}</div>
          </div>
          {required.length > 0 && (
            <div className="reveal space-y-3">
              <span className={label}>Your Bolivian bank ({quote?.quote.rail})</span>
              {required.map(f => f.type === 'select' ? (
                <select key={f.key} value={fields[f.key] ?? ''} onChange={e => setFields({ ...fields, [f.key]: e.target.value })} className={input}><option value="">{f.label}</option>{(f.options ?? []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
              ) : (
                <input key={f.key} type={f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : 'text'} value={fields[f.key] ?? ''} onChange={e => setFields({ ...fields, [f.key]: e.target.value })} placeholder={f.placeholder || f.label} className={input} />
              ))}
            </div>
          )}
          {error && <p className="text-[13px] text-terracotta bg-terracotta-soft rounded-xl px-3 py-2">{error}</p>}
          <button disabled={!can} onClick={create} className={primary(can)}>{busy ? 'Creating…' : 'Create request link'}</button>
        </div>
      ) : (
        <div className={`${card} reveal space-y-4`}>
          <div className="font-display text-[20px] font-semibold">{req.status === 'cashed_out' ? 'Bolivianos on the way' : 'Share this with the payer'}</div>
          <div className="flex gap-2"><input readOnly value={link} className={`${input} font-mono text-[12.5px]`} /><button onClick={() => navigator.clipboard.writeText(link)} className="rounded-2xl bg-ink text-cream px-4 text-[13px]">Copy</button></div>
          <dl className="divide-y divide-hair text-[14px]">
            {[['They pay', fmtNgn(req.ngnAmount)], ['You receive', `Bs ${req.bob.amount.toFixed(2)}`], ['Via', `${req.bob.provider} · ${req.bob.rail}`], ['Status', order?.status ? `${req.status} · order ${order.status}` : req.status]].map(([k, v]) => <div key={k} className="flex justify-between py-2"><dt className="text-ink-muted">{k}</dt><dd className="font-semibold">{v}</dd></div>)}
          </dl>
          {offramp?.kycUrl && <p className="text-[13px]">Pollar needs a quick identity check before paying out: <a className="text-forest underline" href={offramp.kycUrl} target="_blank" rel="noreferrer">complete KYC</a>. USDC stays in your wallet meanwhile.</p>}
          {offramp && !offramp.kycUrl && <p className="text-[13px] text-forest-deep">Payout submitted ({offramp.provider}, {offramp.status}). Track it under History.</p>}
          {error && <p className="text-[13px] text-terracotta bg-terracotta-soft rounded-xl px-3 py-2">{error}</p>}
          {req.status !== 'cashed_out' && <div className="flex items-center gap-2 text-[13px] text-ink-muted"><span className="w-3.5 h-3.5 rounded-full border-2 border-hair border-t-forest animate-spin" />{req.orderId ? 'Payer has started — waiting for the naira to clear…' : 'Waiting for the payer to open the link…'}</div>}
        </div>
      )}
    </Shell>
  );
}
