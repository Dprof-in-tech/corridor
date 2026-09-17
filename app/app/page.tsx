'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePollar } from '@pollar/react';
import { Chrome } from '../../components/Chrome';
import { weave, bankMatches, STELLAR_USDC, NGN, shortG, type Bank } from '../../lib/weave';
import { useNetwork, explorerTx } from '../../lib/network';
import { bestQuote, bobFromUsdcOfframp, usdcFromBobOnramp, type RampQuote } from '../../lib/pollar-ramps';
import { runFlow, type To, type From, type FlowEvent, type FlowResult } from '../../lib/flows';

// Dashboard (design handoff "Dashboard v3"): balance, three secondary actions,
// and a conversational Send flow that reveals one sentence at a time:
//   I want to send money to [a bank in Nigeria | a bank in Bolivia | a friend]
//   → (recipient details — added; the design leaves them implicit)
//   paying with [my balance | a naira bank transfer | a Bolivian bank QR]
//   and the amount is [ $ 25 ]
//   [ Send ₦34,000 ]  Start over

const fmt = (n: number, c: 'NGN' | 'BOB' | 'USD') =>
  ({ NGN: '₦', BOB: 'Bs ', USD: '$' })[c] + new Intl.NumberFormat('en', { maximumFractionDigits: c === 'NGN' ? 0 : 2, minimumFractionDigits: c === 'NGN' ? 0 : 2 }).format(n);

type Stage = { label: string; done: boolean };

// Pills & inline fields live at module scope so they keep identity (and focus) across renders.
const Pill = ({ on, dot, disabled, title, onClick, children }: { on: boolean; dot?: string; disabled?: boolean; title?: string; onClick: () => void; children: React.ReactNode }) => (
  <button className="pill" data-on={on} disabled={disabled} title={title} onClick={onClick}>
    {dot && <span style={{ width: 10, height: 10, borderRadius: '50%', background: on ? '#F3EDE0' : dot }} />}{children}
  </button>
);
const Inline = ({ value, onChange, placeholder, width = 260, mono, inputMode }: { value: string; onChange: (v: string) => void; placeholder: string; width?: number; mono?: boolean; inputMode?: 'numeric' | 'text' }) => (
  <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} inputMode={inputMode}
    style={{ border: 0, borderBottom: '1px solid #2F4A3B', background: 'transparent', font: `${mono ? '400 22px var(--font-mono)' : 'italic 400 32px var(--font-display)'}`, color: '#2F4A3B', padding: '0 4px 2px', width, minWidth: 120 }} />
);
const Typeahead = ({ q, setQ, pick, picked, options, placeholder }: { q: string; setQ: (v: string) => void; pick: (b: Bank) => void; picked: Bank | null; options: Bank[]; placeholder: string }) => (
  <span style={{ position: 'relative', display: 'inline-block' }}>
    <Inline value={picked ? picked.name : q} onChange={v => { setQ(v); }} placeholder={placeholder} width={300} />
    {options.length > 0 && (
      <div style={{ position: 'absolute', zIndex: 20, left: 0, top: '100%', marginTop: 6, background: '#FBF8F2', border: '1px solid #D9D2C2', borderRadius: 16, overflow: 'hidden', minWidth: 300, boxShadow: '0 30px 60px -30px rgba(47,74,59,.35)' }}>
        {options.map(b => <button key={b.code} onClick={() => pick(b)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', border: 0, background: 'transparent', font: '15px var(--font-body)', color: '#2F4A3B', cursor: 'pointer' }}>{b.name}</button>)}
      </div>
    )}
  </span>
);

export default function Dashboard() {
  const { wallet, walletBalance, refreshWalletBalance, signAndSubmitTx, runTx, getClient } = usePollar();
  const IS_TESTNET = useNetwork() === 'testnet';
  const bal = walletBalance.step === 'loaded' ? Number(walletBalance.data.balances.find(b => b.code === 'USDC')?.balance ?? 0) : null;

  // Balance may still be idle when we mount (login finished in another tab).
  useEffect(() => { if (wallet && walletBalance.step === 'idle') void refreshWalletBalance(); }, [wallet, walletBalance.step, refreshWalletBalance]);

  // ── rates (live where available; the design's numbers are illustrative) ──
  const [ngnPerUsd, setNgnPerUsd] = useState(1400);
  const [bobPerUsd, setBobPerUsd] = useState(6.96);
  useEffect(() => {
    weave(`quotes?from=${STELLAR_USDC}&to=${NGN}&amount=1&amountIn=source`).then(r => { if (r.ok && r.data?.estimatedDest) setNgnPerUsd(Number(r.data.estimatedDest)); });
    bestQuote(getClient(), 'offramp', 100).then(q => setBobPerUsd(Number(q.rate))).catch(() => {});
  }, [getClient]);

  // ── handle ─────────────────────────────────────────────────────────────
  const [handle, setHandle] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false); const [handleDraft, setHandleDraft] = useState(''); const [handleErr, setHandleErr] = useState<string | null>(null);
  useEffect(() => { try { setHandle(localStorage.getItem('corridor.handle')); } catch {} }, []);
  async function claim() {
    setHandleErr(null);
    const r = await fetch('/api/directory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle: handleDraft, address: wallet?.address }) }).then(r => r.json());
    if (r.success) { setHandle(r.data.handle); setClaiming(false); try { localStorage.setItem('corridor.handle', r.data.handle); } catch {} } else setHandleErr(r.error);
  }

  // ── send flow state ────────────────────────────────────────────────────
  const [to, setTo] = useState<To | null>(null);
  const [from, setFrom] = useState<From | null>(null);
  const [amount, setAmount] = useState('');
  // recipient details
  const [banks, setBanks] = useState<Bank[]>([]);
  const [ngBankQ, setNgBankQ] = useState(''); const [ngBank, setNgBank] = useState<Bank | null>(null); const [ngAcct, setNgAcct] = useState(''); const [ngName, setNgName] = useState(''); const [ngErr, setNgErr] = useState<string | null>(null); const [ngResolving, setNgResolving] = useState(false);
  const [boQuote, setBoQuote] = useState<RampQuote | null>(null); const [boFields, setBoFields] = useState<Record<string, string>>({});
  const [frInput, setFrInput] = useState(''); const [frAddr, setFrAddr] = useState<string | null>(null); const [frHandle, setFrHandle] = useState<string | null>(null); const [frErr, setFrErr] = useState<string | null>(null);
  // payer bank (naira transfers → Paycrest refund account)
  const [pBankQ, setPBankQ] = useState(''); const [pBank, setPBank] = useState<Bank | null>(null); const [pAcct, setPAcct] = useState(''); const [pName, setPName] = useState(''); const [pErr, setPErr] = useState<string | null>(null);
  // execution
  const [running, setRunning] = useState(false);
  const [stages, setStages] = useState<Stage[]>([]);
  const [bankDetails, setBankDetails] = useState<any>(null);
  const [qr, setQr] = useState<{ ramp: any; bob: number; resolvePaid: () => void } | null>(null);
  const [kyc, setKyc] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [result, setResult] = useState<FlowResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => { weave('institutions?currency=NGN').then(r => r.ok && setBanks(r.data ?? [])); }, []);
  useEffect(() => { if (to === 'bo' && !boQuote) bestQuote(getClient(), 'offramp', 100).then(setBoQuote).catch(e => setError(e.message)); }, [to, boQuote, getClient]);

  // NG account name resolution
  useEffect(() => {
    setNgName(''); setNgErr(null);
    if (!ngBank || ngAcct.length < 10) return;
    let live = true; setNgResolving(true);
    weave('institutions/verify', { body: { institution: ngBank.code, accountIdentifier: ngAcct, currency: 'NGN' } })
      .then(r => { if (!live) return; if (r.ok && r.data) setNgName(String(r.data)); else setNgErr('We couldn’t find that account.'); })
      .finally(() => live && setNgResolving(false));
    return () => { live = false; };
  }, [ngBank, ngAcct]);
  // payer account resolution
  useEffect(() => {
    setPName(''); setPErr(null);
    if (!pBank || pAcct.length < 10) return;
    let live = true;
    weave('institutions/verify', { body: { institution: pBank.code, accountIdentifier: pAcct, currency: 'NGN' } })
      .then(r => { if (!live) return; if (r.ok && r.data) setPName(String(r.data)); else setPErr('We couldn’t find that account.'); });
    return () => { live = false; };
  }, [pBank, pAcct]);
  // friend resolution
  useEffect(() => {
    setFrAddr(null); setFrHandle(null); setFrErr(null);
    const v = frInput.trim();
    if (/^G[A-Z2-7]{55}$/.test(v)) { setFrAddr(v); return; }
    const h = v.replace(/^@/, '').toLowerCase();
    if (h.length < 3) return;
    let live = true;
    fetch(`/api/directory?handle=${encodeURIComponent(h)}`).then(r => r.json()).then(j => { if (!live) return; if (j.success) { setFrAddr(j.data.address); setFrHandle(h); } else setFrErr('No one has claimed that handle yet.'); });
    return () => { live = false; };
  }, [frInput]);

  const ngBanks = useMemo(() => ngBankQ && !ngBank ? banks.filter(b => bankMatches(b.name, ngBankQ)).slice(0, 6) : [], [banks, ngBankQ, ngBank]);
  const pBanks = useMemo(() => pBankQ && !pBank ? banks.filter(b => bankMatches(b.name, pBankQ)).slice(0, 6) : [], [banks, pBankQ, pBank]);

  // ── derived ────────────────────────────────────────────────────────────
  const detailsOk = to === 'ng' ? !!ngName : to === 'bo' ? !!boQuote && (boQuote.requiredFields ?? []).every((f: any) => f.optional || (boFields[f.key] ?? '').trim()) : to === 'fr' ? !!frAddr : false;
  const blocked: From | null = to === 'ng' ? 'ngn' : to === 'bo' ? 'bob' : null;
  const a = parseFloat(amount) || 0;
  // Rough USD value from the cached rates — only for the balance check.
  const usd = !from ? 0 : from === 'ngn' ? a / ngnPerUsd : from === 'bob' ? a / bobPerUsd : a;
  // What actually arrives, from real quotes (Weave for the naira legs, Pollar
  // for the BOB legs), debounced as the amount is typed.
  const [est, setEst] = useState<{ key: string; value: number | null; error?: string } | null>(null);
  const estKey = `${to}|${from}|${a}`;
  useEffect(() => {
    if (!to || !from || !a) { setEst(null); return; }
    let live = true;
    const t = setTimeout(async () => {
      try {
        const client = getClient();
        const q = async (fromKey: string, toKey: string, amt: number) => {
          const r = await weave(`quotes?from=${fromKey}&to=${toKey}&amount=${amt}&amountIn=source`);
          if (!r.ok) throw new Error(r.error || 'No quote');
          return Number(r.data.estimatedDest);
        };
        // 1) source → USDC in the wallet
        const usdc = from === 'bal' ? a : from === 'ngn' ? await q(NGN, STELLAR_USDC, a) : (await usdcFromBobOnramp(client, a)).usdc;
        // 2) USDC → destination
        const value = to === 'fr' ? usdc : to === 'ng' ? await q(STELLAR_USDC, NGN, usdc) : (await bobFromUsdcOfframp(client, usdc)).bob;
        if (live) setEst({ key: estKey, value });
      } catch (e: any) { if (live) setEst({ key: estKey, value: null, error: e?.message }); }
    }, 400);
    return () => { live = false; clearTimeout(t); };
  }, [estKey, to, from, a, getClient]);
  const estReady = !!est && est.key === estKey;
  const outCcy = to === 'ng' ? 'NGN' : to === 'bo' ? 'BOB' : 'USD';
  const out = estReady && est!.value != null ? fmt(est!.value, outCcy) : fmt(to === 'ng' ? usd * ngnPerUsd : to === 'bo' ? usd * bobPerUsd : usd, outCcy);
  const over = from === 'bal' && bal != null && usd > bal;
  const tooSmall = !IS_TESTNET && a > 0 && to === 'ng' && from === 'bal' && a < 2;  // LI.FI bridge minimum (mainnet only)
  const payerOk = from !== 'ngn' || !!pName;
  const step2 = !!to && detailsOk;
  const step3 = step2 && !!from && payerOk;
  const step4 = step3 && a > 0 && !over && !tooSmall && estReady && est!.value != null;
  const sym = from === 'ngn' ? '₦' : from === 'bob' ? 'Bs' : '$';
  const self = to === 'fr' && !!frAddr && frAddr === wallet?.address;
  const eta = to === 'fr' && from === 'bal' ? 'in seconds' : to === 'ng' ? 'in about 3 minutes' : 'in a few minutes';
  const summary = !a ? 'Type an amount to see what arrives.'
    : over ? `That's more than your ${fmt(bal ?? 0, 'USD')}. Add money first, or pay from a bank.`
    : tooSmall ? 'The bridge minimum is $2.'
    : !estReady ? 'Getting a quote…'
    : est!.value == null ? (est!.error ?? 'No quote for that amount.')
    : `${self ? 'You get' : 'They receive'} ${out} ${eta}.${from === 'bal' && to === 'fr' ? ' No fee.' : ' Fees included.'}`;
  const ctaLabel = self ? `Add ${fmt(a, from === 'ngn' ? 'NGN' : 'BOB')}` : `Send ${out}`;
  const sourceHint = from === 'bal' ? `${fmt(bal ?? 0, 'USD')} available.` : from === 'ngn' ? 'We give you account details; you transfer from any Nigerian bank app.' : from === 'bob' ? (IS_TESTNET ? 'You scan one QR from your Bolivian banking app (mocked on testnet).' : 'You scan one QR from your Bolivian banking app.') : "Pick how you'd like to pay.";

  function reset() {
    setTo(null); setFrom(null); setAmount(''); setNgBank(null); setNgBankQ(''); setNgAcct(''); setNgName(''); setBoFields({}); setFrInput(''); setFrAddr(null);
    setPBank(null); setPBankQ(''); setPAcct(''); setPName(''); setRunning(false); setStages([]); setBankDetails(null); setQr(null); setKyc(null); setHash(null); setResult(null); setError(null);
  }
  function pickTo(t: To) { setTo(t); setFrom(null); setAmount(''); setError(null); }
  function pickFrom(f: From) { if (f !== from) setAmount(''); setFrom(f); }  // the currency changes with the source
  function startAdd() { reset(); setTo('fr'); if (wallet) { setFrInput(wallet.address); } setFrom('ngn'); }
  function startWithdraw() { reset(); setTo('ng'); setFrom('bal'); }

  async function send() {
    if (!wallet || !to || !from) return;
    setRunning(true); setError(null); setStages([]); setBankDetails(null); setQr(null); setKyc(null); setHash(null); setResult(null);
    const emit = (e: FlowEvent) => {
      if (e.kind === 'stage') setStages(s => [...s.map(x => ({ ...x, done: true })), { label: e.label, done: false }]);
      if (e.kind === 'bank_details') setBankDetails(e.bank);
      if (e.kind === 'qr') setQr({ ramp: e.ramp, bob: e.bob, resolvePaid: () => { setQr(null); e.resolvePaid(); } });
      if (e.kind === 'kyc') setKyc(e.url);
      if (e.kind === 'tx') setHash(e.hash);
    };
    try {
      const res = await runFlow({
        to, from, amount: a, wallet: wallet.address,
        ng: to === 'ng' && ngBank ? { bankCode: ngBank.code, bankName: ngBank.name, accountNumber: ngAcct, accountName: ngName } : undefined,
        bo: to === 'bo' && boQuote ? { fields: boFields, quote: boQuote } : undefined,
        fr: to === 'fr' && frAddr ? { address: frAddr, handle: frHandle } : undefined,
        payerBank: from === 'ngn' && pBank ? { bankCode: pBank.code, accountNumber: pAcct, accountName: pName } : undefined,
      }, getClient(), { signAndSubmitTx: signAndSubmitTx as any, runTx: runTx as any }, emit);
      setStages(s => s.map(x => ({ ...x, done: true }))); setResult(res); void refreshWalletBalance();
    } catch (e: any) { setError(e?.message ?? 'Something went wrong'); }
    finally { setRunning(false); setQr(null); }
  }

  const detailsRow = (
    <div className="rise" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {to === 'ng' && (
        <>
          <div className="prose-step" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '8px 16px' }}>
            <span>at</span><Typeahead q={ngBankQ} setQ={v => { setNgBankQ(v); setNgBank(null); }} pick={b => { setNgBank(b); setNgBankQ(b.name); }} picked={ngBank} options={ngBanks} placeholder="GTBank, OPay, PalmPay…" />
            {ngBank && <><span>account</span><Inline value={ngAcct} onChange={v => setNgAcct(v.replace(/\D/g, '').slice(0, 10))} placeholder="0123456789" width={220} mono inputMode="numeric" /></>}
          </div>
          <div style={{ font: '14px var(--font-body)', color: ngErr ? '#A8321E' : '#4F7A5C', minHeight: 20 }}>{ngResolving ? 'Checking the account…' : ngName ? `→ ${ngName}` : ngErr ?? ''}</div>
        </>
      )}
      {to === 'bo' && (
        <>
          <div className="prose-step" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '8px 16px' }}>
            <span>at</span>
            {!boQuote ? <span style={{ font: 'italic 22px var(--font-display)', color: '#8A8A80' }}>loading Bolivian banks…</span> : (boQuote.requiredFields ?? []).map((f: any) => f.type === 'select' ? (
              <select key={f.key} value={boFields[f.key] ?? ''} onChange={e => setBoFields({ ...boFields, [f.key]: e.target.value })} style={{ border: 0, borderBottom: '1px solid #2F4A3B', background: 'transparent', font: 'italic 28px var(--font-display)', color: '#2F4A3B' }}>
                <option value="">{f.label}</option>{(f.options ?? []).map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : <Inline key={f.key} value={boFields[f.key] ?? ''} onChange={v => setBoFields({ ...boFields, [f.key]: v })} placeholder={f.placeholder || f.label} width={f.bankType ? 220 : 260} mono={!!f.bankType} />)}
          </div>
          {boQuote?.mocked && <div style={{ font: '13px var(--font-body)', color: '#8A8A80' }}>Bolivian payout is mocked on testnet · Pollar's Stereum ramp on mainnet</div>}
        </>
      )}
      {to === 'fr' && (
        <>
          <div className="prose-step" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '8px 16px' }}>
            <span>@</span><Inline value={frInput} onChange={setFrInput} placeholder="handle or G… address" width={340} mono={/^G[A-Z2-7]{10,}/.test(frInput)} />
            {wallet && frInput !== wallet.address && <button className="pill" onClick={() => setFrInput(wallet.address)} style={{ height: 40, fontSize: 18 }}>myself</button>}
          </div>
          <div style={{ font: '14px var(--font-body)', color: frErr ? '#A8321E' : '#4F7A5C', minHeight: 20 }}>{frAddr ? (frAddr === wallet?.address ? '→ your own wallet' : `→ ${shortG(frAddr)}`) : frErr ?? ''}</div>
        </>
      )}
    </div>
  );

  return (
    <Chrome>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 72 }}>
        {/* Balance */}
        <section>
          <div className="mono-eyebrow">You have</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 20, marginTop: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ font: 'italic 40px var(--font-display)', color: '#4F7A5C' }}>$</span>
              <span style={{ font: '400 104px/1 var(--font-display)', letterSpacing: '-0.03em', color: '#2F4A3B' }} className="balance-num">{bal == null ? '…' : bal.toFixed(2)}</span>
            </div>
            {bal != null && <span style={{ font: 'italic 26px var(--font-display)', color: '#8A8A80' }}>about {fmt(bal * ngnPerUsd, 'NGN')} · {fmt(bal * bobPerUsd, 'BOB')}</span>}
          </div>
          <div style={{ display: 'flex', gap: 28, marginTop: 22, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <button className="link-serif" onClick={startAdd}>Add money</button>
            {handle ? (
              <Link href="/app/request-naira" className="link-serif" style={{ textDecoration: 'none' }} title="Request naira from anyone in Nigeria — paid out to you in BOB">Get paid at @{handle}</Link>
            ) : claiming ? (
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 10 }}>
                <span style={{ font: 'italic 22px var(--font-display)' }}>Get paid at @</span>
                <Inline value={handleDraft} onChange={v => setHandleDraft(v.toLowerCase().replace(/[^a-z0-9_]/g, ''))} placeholder="ada" width={140} />
                <button className="pill" onClick={claim} disabled={handleDraft.length < 3} style={{ height: 36, fontSize: 16 }}>claim</button>
                {handleErr && <span style={{ font: '13px var(--font-body)', color: '#A8321E' }}>{handleErr}</span>}
              </span>
            ) : (
              <button className="link-serif" onClick={() => setClaiming(true)}>Get paid at @…</button>
            )}
            <button className="link-serif" onClick={startWithdraw}>Withdraw to my bank</button>
          </div>
          <div style={{ font: '12px var(--font-body)', color: '#8A8A80', marginTop: 10 }}>{wallet ? shortG(wallet.address) : ''}{IS_TESTNET ? ' · testnet · fees sponsored by Pollar' : ''}</div>
        </section>

        {/* Send flow */}
        {!result && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 36, maxWidth: 820 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div className="prose-step">I want to send money to</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Pill on={to === 'ng'} dot="#4F7A5C" onClick={() => pickTo('ng')}>a bank in Nigeria</Pill>
                <Pill on={to === 'bo'} dot="#B8C7BA" onClick={() => pickTo('bo')}>a bank in Bolivia</Pill>
                <Pill on={to === 'fr'} dot="#2F4A3B" onClick={() => pickTo('fr')}>a friend on Corridor</Pill>
              </div>
            </div>

            {to && detailsRow}

            {step2 && (
              <div className="rise" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div className="prose-step">paying with</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <Pill on={from === 'bal'} onClick={() => pickFrom('bal')}>my balance</Pill>
                  <Pill on={from === 'ngn'} disabled={blocked === 'ngn'} title={blocked === 'ngn' ? 'Naira to a Nigerian bank is just a local transfer.' : undefined} onClick={() => pickFrom('ngn')}>a naira bank transfer</Pill>
                  <Pill on={from === 'bob'} disabled={blocked === 'bob'} title={blocked === 'bob' ? 'Bolivianos to a Bolivian bank is just a local transfer.' : undefined} onClick={() => pickFrom('bob')}>a Bolivian bank QR</Pill>
                </div>
                <div style={{ font: '14px var(--font-body)', color: '#8A8A80' }}>{sourceHint}</div>
                {from === 'ngn' && (
                  <div className="rise" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div className="prose-step" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '8px 16px', fontSize: 32 }}>
                      <span>from my</span><Typeahead q={pBankQ} setQ={v => { setPBankQ(v); setPBank(null); }} pick={b => { setPBank(b); setPBankQ(b.name); }} picked={pBank} options={pBanks} placeholder="bank" />
                      {pBank && <><span>account</span><Inline value={pAcct} onChange={v => setPAcct(v.replace(/\D/g, '').slice(0, 10))} placeholder="0123456789" width={220} mono inputMode="numeric" /></>}
                    </div>
                    <div style={{ font: '13px var(--font-body)', color: pErr ? '#A8321E' : '#8A8A80' }}>{pName ? `→ ${pName} · used only for refunds` : pErr ?? 'The account you will pay from — only used if we ever need to refund you.'}</div>
                  </div>
                )}
              </div>
            )}

            {step3 && (
              <div className="rise" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
                  <span className="prose-step">and the amount is</span>
                  <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, borderBottom: '1px solid #2F4A3B' }}>
                    <span style={{ font: 'italic 36px var(--font-display)', color: '#4F7A5C' }}>{sym}</span>
                    <input ref={amountRef} value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="0" autoFocus className="inline-input" style={{ width: 200 }} />
                  </span>
                </div>
                <div style={{ font: '15px/1.5 var(--font-body)', color: '#5E6058' }}>{summary}</div>
              </div>
            )}

            {(step4 || over) && !running && (
              <div className="rise" style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                {over ? <button className="cta" onClick={startAdd}>Add money instead</button> : <button className="cta" onClick={send}>{ctaLabel}</button>}
                <button onClick={reset} style={{ border: 0, background: 'transparent', font: '14px var(--font-body)', color: '#8A8A80', cursor: 'pointer', padding: 0 }}>Start over</button>
              </div>
            )}
            {error && !running && <div style={{ font: '14px/1.5 var(--font-body)', color: '#A8321E', background: '#F6E1DC', borderRadius: 16, padding: '10px 14px', maxWidth: 640 }}>{error}</div>}
          </section>
        )}

        {/* Progress / result */}
        {(running || result) && (
          <section className="rise" style={{ maxWidth: 820, display: 'flex', flexDirection: 'column', gap: 24 }}>
            {result ? (
              <>
                <div style={{ font: '400 44px/1.15 var(--font-display)', color: '#2F4A3B' }}>{result.headline}<span style={{ color: '#4F7A5C', fontStyle: 'italic' }}>.</span></div>
                <div style={{ font: '16px/1.5 var(--font-body)', color: '#5E6058' }}>{result.detail}{result.mocked ? ' · mocked on testnet' : ''}</div>
                {hash && <a href={explorerTx(hash)} target="_blank" rel="noreferrer" style={{ font: '13px var(--font-body)', color: '#4F7A5C' }}>View on Stellar →</a>}
                <div><button className="cta" onClick={reset}>Done</button></div>
              </>
            ) : (
              <>
                <div style={{ font: '400 32px/1.15 var(--font-display)', color: '#2F4A3B' }}>On its way<span style={{ color: '#4F7A5C', fontStyle: 'italic' }}>…</span></div>
                <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {stages.map((s, i) => (
                    <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, font: '16px var(--font-body)', color: s.done ? '#2F4A3B' : '#5E6058' }}>
                      <span style={{ width: 18, height: 18, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, background: s.done ? '#2F4A3B' : 'transparent', color: '#F3EDE0', border: s.done ? 0 : '1px solid #B8C7BA' }}>{s.done ? '✓' : ''}</span>
                      {s.label}{!s.done && <span style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid #D9D2C2', borderTopColor: '#4F7A5C', animation: 'spin .9s linear infinite' }} />}
                    </li>
                  ))}
                </ol>
                {bankDetails && (
                  <div style={{ background: '#FBF8F2', border: '1px solid #D9D2C2', borderRadius: 20, padding: 20, maxWidth: 520 }}>
                    <div style={{ font: '22px var(--font-display)', marginBottom: 10 }}>Transfer exactly this amount</div>
                    {[['Bank', bankDetails.institution], ['Account number', bankDetails.accountIdentifier], ['Account name', bankDetails.accountName], ['Amount', fmt(Number(bankDetails.amountToTransfer), 'NGN')]].map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '8px 0', borderBottom: '1px solid #E6E0D0', font: '14px var(--font-body)' }}><span style={{ color: '#8A8A80' }}>{k}</span><button onClick={() => navigator.clipboard.writeText(String(v))} style={{ border: 0, background: 'transparent', font: '14px var(--font-mono)', color: '#2F4A3B', cursor: 'pointer' }}>{v}</button></div>
                    ))}
                    {IS_TESTNET && <div style={{ font: '12px var(--font-body)', color: '#8A8A80', marginTop: 10 }}>Sandbox bank — the transfer is simulated as received.</div>}
                  </div>
                )}
                {qr && (
                  <div style={{ background: '#FBF8F2', border: '1px solid #D9D2C2', borderRadius: 20, padding: 20, maxWidth: 420, textAlign: 'center' }}>
                    {qr.ramp.depositInstructions?.scannable?.image?.src && <img src={qr.ramp.depositInstructions.scannable.image.src} alt="BOB QR" style={{ width: 200, height: 200, margin: '0 auto', display: 'block' }} />}
                    <div style={{ font: '18px var(--font-display)', marginTop: 10 }}>Pay {fmt(qr.bob, 'BOB')} with your bank app</div>
                    {qr.ramp.mocked && <button className="cta" onClick={qr.resolvePaid} style={{ marginTop: 14, height: 44, padding: '0 22px', fontSize: 14 }}>I've paid the QR (simulate)</button>}
                    {qr.ramp.mocked && <div style={{ font: '12px var(--font-body)', color: '#8A8A80', marginTop: 8 }}>Mocked BOB on-ramp — Pollar's Stereum QR on mainnet.</div>}
                  </div>
                )}
                {kyc && <a href={kyc} target="_blank" rel="noreferrer" style={{ font: '14px var(--font-body)', color: '#4F7A5C' }}>Complete Pollar's identity check →</a>}
              </>
            )}
            {error && <div style={{ font: '14px/1.5 var(--font-body)', color: '#A8321E', background: '#F6E1DC', borderRadius: 16, padding: '10px 14px', maxWidth: 640 }}>{error}</div>}
          </section>
        )}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @media (max-width: 720px) { .balance-num { font-size: 64px !important; } }`}</style>
    </Chrome>
  );
}
