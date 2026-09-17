'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePollar } from '@pollar/react';
import { Shell, card, input, label, primary } from '../../../components/Shell';
import { weave, bankMatches, fmtNgn, fmtUsdc, STELLAR_USDC, NGN, type Bank } from '../../../lib/weave';
import { IS_TESTNET } from '../../../lib/weave';
import { bobForUsdc, isKycBlocked, startOnRamp, type RampQuote, type OnRampResult } from '../../../lib/pollar-ramps';
import { createNigeriaSend, executeNigeriaSend } from '../../../lib/nigeria-send';

// Bolivia → Nigeria, chained in ONE session: pay a BOB QR (Pollar / Stereum)
// → USDC lands in this wallet → the app immediately runs the Weave send
// (Pollar signs approve + bridge) → naira in the recipient's bank. The user
// does exactly one thing: pay the QR.

type Step = 'form' | 'quoting' | 'pay_qr' | 'waiting_usdc' | 'sending' | 'done' | 'error';

export default function BobToNigeria() {
  const { wallet, getClient, signAndSubmitTx, runTx, refreshWalletBalance } = usePollar();
  const [step, setStep] = useState<Step>('form');
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState('');               // USDC the recipient's payout is sized in
  const [ngnEstimate, setNgnEstimate] = useState<number | null>(null);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [bankQuery, setBankQuery] = useState(''); const [bankCode, setBankCode] = useState('');
  const [acct, setAcct] = useState(''); const [acctName, setAcctName] = useState(''); const [resolving, setResolving] = useState(false); const [acctErr, setAcctErr] = useState<string | null>(null);
  const [bob, setBob] = useState<{ bob: number; quote: RampQuote } | null>(null);
  const [ramp, setRamp] = useState<OnRampResult | null>(null);
  const [order, setOrder] = useState<any>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const acctRef = useRef<HTMLInputElement>(null);
  const mockPayResolver = useRef<(() => void) | null>(null);

  useEffect(() => { weave('institutions?currency=NGN').then(r => r.ok && setBanks(r.data ?? [])); }, []);
  useEffect(() => {
    const a = Number(amount); if (!a) { setNgnEstimate(null); setBob(null); return; }
    let live = true; const t = setTimeout(async () => {
      const [q] = await Promise.all([
        weave(`quotes?from=${STELLAR_USDC}&to=${NGN}&amount=${a}&amountIn=source`),
        bobForUsdc(getClient(), a).then(b => { if (live) setBob(b); }).catch(() => { if (live) setBob(null); }),
      ]);
      if (live) setNgnEstimate(q.ok ? q.data.estimatedDest : null);
    }, 450);
    return () => { live = false; clearTimeout(t); };
  }, [amount, getClient]);
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
  const can = a >= 2 && !!acctName && !!bob;

  async function usdcBalance(): Promise<number> {
    const { balances } = await getClient().getWalletBalance(wallet!.address);
    return Number((balances as any[]).find(b => b.code === 'USDC' || b.asset === 'USDC')?.balance ?? 0);
  }

  async function go() {
    if (!wallet || !bob) return;
    setError(null); setStep('quoting');
    try {
      // 1. Open the BOB on-ramp into THIS wallet (Stereum QR).
      const before = await usdcBalance();
      const onramp = await startOnRamp(getClient(), bob.quote, bob.bob, wallet.address, a);
      setRamp(onramp);
      if (isKycBlocked(onramp)) { setStep('pay_qr'); return; } // page shows the KYC link
      setStep('pay_qr');

      // 2. Wait for the on-ramp to settle, then for USDC to land in the wallet.
      if (onramp.mocked) {
        await new Promise<void>(res => { mockPayResolver.current = res; });   // user taps "I've paid" on the mock QR
        await onramp.settleMock!();                                            // "Stereum settlement" via the sandbox faucet
      } else {
        await getClient().pollRampTransaction(onramp.txId, { intervalMs: 12000, timeoutMs: 45 * 60_000 });
      }
      setStep('waiting_usdc');
      let landed = before;
      for (let i = 0; i < 40; i++) { landed = await usdcBalance(); if (landed - before >= a * 0.97) break; await new Promise(r => setTimeout(r, 6000)); }
      const sendAmount = Math.min(a, Math.floor((landed - before) * 100) / 100);
      if (sendAmount < 2) throw new Error(`Only ${fmtUsdc(landed - before)} arrived — below the 2 USDC bridge minimum.`);

      // 3. Chain straight into the Nigerian payout — no second user action.
      setStep('sending');
      const created = await createNigeriaSend(wallet.address, sendAmount, { bankCode, bankName: bankQuery, accountNumber: acct, accountName: acctName });
      setOrder(created.order);
      const { order: final, hash: h } = await executeNigeriaSend(created, { signAndSubmitTx: signAndSubmitTx as any, runTx: runTx as any }, (s, d) => { setStage(s); if (s === 'done') setHash(d ?? null); }, setOrder);
      setHash(h);
      if (final.status !== 'completed') throw new Error('The naira payout could not be completed; your USDC stays in your wallet.');
      setStep('done'); void refreshWalletBalance();
    } catch (e: any) { setError(e?.message ?? 'Something went wrong'); setStep('error'); }
  }

  const qr = ramp?.depositInstructions?.scannable;
  const qrSrc = qr?.image?.src ?? (qr?.image?.data ? `data:${qr.image.mediaType};${qr.image.encoding === 'base64' ? 'base64,' : 'utf8,'}${qr.image.encoding === 'base64' ? qr.image.data : encodeURIComponent(qr.image.data)}` : null);

  return (
    <Shell title="Pay a Nigerian bank from Bolivia" back="/app">
      {step === 'form' && (
        <div className={`${card} reveal space-y-5`}>
          <p className="text-[13.5px] text-ink-muted">Scan one BOB QR. We turn it into USDC in your wallet and immediately into naira in their bank — you don't touch the middle.</p>
          <div>
            <span className={label}>They receive (sized in USDC)</span>
            <div className="field flex items-center gap-3 px-4"><span className="text-ink-muted font-semibold">$</span><input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="25" autoFocus className="flex-1 py-3.5 text-[24px] font-semibold outline-none bg-transparent" /><span className="text-[13px] font-semibold text-ink-muted">USDC</span></div>
            <div className="mt-2 text-[13px] text-ink-muted min-h-5">
              {a > 0 && a < 2 ? <span className="text-terracotta">Minimum 2 USDC.</span> : a >= 2 ? <>≈ <b className="text-ink">{fmtNgn(ngnEstimate)}</b> to them · you pay <b className="text-ink">{bob ? `Bs ${bob.bob.toFixed(2)}` : '…'}</b>{bob ? ` via ${bob.quote.provider} (${bob.quote.rail})` : ''}</> : ''}
            </div>
          </div>
          {a >= 2 && (
            <div className="reveal relative">
              <span className={label}>Recipient bank in Nigeria</span>
              <input value={bankQuery} onChange={e => { setBankQuery(e.target.value); setBankCode(''); }} placeholder="GTBank, OPay, PalmPay, Kuda…" className={input} />
              {filtered.length > 0 && <div className="absolute z-20 left-0 right-0 mt-1 rounded-2xl border border-hair bg-white shadow-xl overflow-hidden">{filtered.map(b => <button key={b.code} onClick={() => { setBankCode(b.code); setBankQuery(b.name); setTimeout(() => acctRef.current?.focus(), 50); }} className="block w-full text-left px-4 py-2.5 text-[14px] hover:bg-cream-soft">{b.name}</button>)}</div>}
            </div>
          )}
          {bankCode && (
            <div className="reveal">
              <span className={label}>Account number</span>
              <input ref={acctRef} inputMode="numeric" value={acct} onChange={e => setAcct(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="0123456789" className={`${input} tracking-widest`} />
              <div className={`mt-2 text-[13px] min-h-5 ${acctErr ? 'text-terracotta' : 'text-forest-deep font-semibold'}`}>{resolving ? <span className="text-ink-muted font-normal">Checking…</span> : acctName || acctErr}</div>
            </div>
          )}
          {error && <p className="text-[13px] text-terracotta bg-terracotta-soft rounded-xl px-3 py-2">{error}</p>}
          <button disabled={!can} onClick={go} className={primary(can)}>{bob ? `Get QR for Bs ${bob.bob.toFixed(2)}` : 'Get BOB QR'}</button>
        </div>
      )}

      {step !== 'form' && step !== 'done' && step !== 'error' && (
        <div className={`${card} reveal space-y-4`}>
          <Progress current={step} />
          {step === 'pay_qr' && ramp && (
            isKycBlocked(ramp) ? (
              <div className="text-[14px]">Pollar needs a quick identity check for Bolivian ramps first. <a className="text-forest underline" href={ramp.kycUrl} target="_blank" rel="noreferrer">Complete KYC</a>, then start again.</div>
            ) : (
              <div className="text-center">
                {qrSrc && <img src={qrSrc} alt="BOB payment QR" className="mx-auto w-56 h-56 rounded-2xl border border-hair bg-white p-2" />}
                <div className="mt-3 text-[14px]">Pay <b>Bs {bob?.bob.toFixed(2)}</b> with your bank app</div>
                <dl className="mt-3 text-left divide-y divide-hair text-[13px]">
                  {(ramp.depositInstructions?.fields ?? []).map((f: any) => <div key={f.key} className="flex justify-between py-2"><dt className="text-ink-muted">{f.label}</dt><dd className="font-mono">{f.value}</dd></div>)}
                </dl>
                {ramp.mocked && (
                  <div className="mt-3 rounded-xl bg-tan-mist text-tan-deep text-[12.5px] px-3 py-2 text-left">
                    <b>Mocked BOB on-ramp (testnet).</b> On mainnet this QR is Stereum's and Pollar settles USDC to your wallet. Here, tapping the button simulates that settlement with testnet USDC.
                    <button onClick={() => mockPayResolver.current?.()} className="mt-2 w-full rounded-xl bg-ink text-cream py-2 text-[13px] font-semibold">I've paid the QR (simulate)</button>
                  </div>
                )}
              </div>
            )
          )}
          <div className="flex items-center gap-2 text-[13px] text-ink-muted"><span className="w-3.5 h-3.5 rounded-full border-2 border-hair border-t-forest animate-spin" />
            {step === 'quoting' ? 'Opening your BOB deposit…' : step === 'pay_qr' ? 'Waiting for your BOB payment…' : step === 'waiting_usdc' ? 'BOB received — waiting for USDC to land in your wallet…' : `Sending naira… ${stage ?? ''} ${order?.status ?? ''}`}
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className={`${card} reveal text-center`}>
          <div className="mx-auto w-14 h-14 rounded-full bg-forest-mist text-forest-deep flex items-center justify-center text-2xl">✓</div>
          <div className="mt-3 font-display text-[22px] font-semibold">Naira delivered</div>
          <p className="mt-1 text-[14px] text-ink-muted">Bs {bob?.bob.toFixed(2)} → {fmtNgn(order?.destAmount)} to {acctName}</p>
          {hash && <a className="mt-3 inline-block text-[12px] text-forest underline" target="_blank" rel="noreferrer" href={`https://stellar.expert/explorer/${IS_TESTNET ? 'testnet' : 'public'}/tx/${hash}`}>Stellar transaction</a>}
        </div>
      )}
      {step === 'error' && (
        <div className={`${card} reveal`}><div className="font-display text-[20px] font-semibold text-terracotta">Stopped</div><p className="mt-2 text-[14px] text-ink-muted">{error}</p><button onClick={() => setStep('form')} className={`${primary(true)} mt-5`}>Back</button></div>
      )}
    </Shell>
  );
}

function Progress({ current }: { current: string }) {
  const steps: Array<[string, string]> = [['quoting', 'BOB deposit opened'], ['pay_qr', 'You pay the QR'], ['waiting_usdc', 'USDC lands in your wallet'], ['sending', 'Bridged & paid out in naira']];
  const idx = steps.findIndex(([k]) => k === current);
  return (
    <ol className="space-y-2">{steps.map(([k, t], i) => <li key={k} className="flex items-center gap-3 text-[14px]"><span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${i < idx ? 'bg-forest text-cream' : i === idx ? 'border-2 border-forest text-forest' : 'border border-hair text-ink-faint'}`}>{i < idx ? '✓' : i + 1}</span><span className={i <= idx ? 'text-ink' : 'text-ink-muted'}>{t}</span></li>)}</ol>
  );
}
