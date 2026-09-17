'use client';

import { useEffect, useState } from 'react';
import { usePollar } from '@pollar/react';
import { Shell, card, input, label, primary } from '../../../components/Shell';
import { fmtUsdc, shortG } from '../../../lib/weave';

// Pay another corridor user: a plain Stellar USDC payment between Pollar
// wallets (≈5s, fractions of a cent). This is the "wire" of the corridor — a
// Nigerian sender adds naira here, pays a Bolivian friend, who cashes out to
// BOB with Pollar's ramp. Recipient by @handle (directory) or raw G-address.

const USDC_ISSUER: Record<string, string> = {
  mainnet: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  testnet: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
};

export default function SendFriend() {
  const { runTx, network, walletBalance, refreshWalletBalance } = usePollar();
  const usdcBal = walletBalance.step === 'loaded' ? Number(walletBalance.data.balances.find(b => b.code === 'USDC')?.balance ?? 0) : null;
  const [to, setTo] = useState(''); const [resolved, setResolved] = useState<string | null>(null); const [resolveErr, setResolveErr] = useState<string | null>(null);
  const [amount, setAmount] = useState(''); const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false); const [hash, setHash] = useState<string | null>(null); const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setResolved(null); setResolveErr(null);
    const v = to.trim();
    if (/^G[A-Z2-7]{55}$/.test(v)) { setResolved(v); return; }
    const h = v.replace(/^@/, '');
    if (h.length < 3) return;
    let live = true;
    fetch(`/api/directory?handle=${encodeURIComponent(h)}`).then(r => r.json()).then(j => { if (!live) return; if (j.success) setResolved(j.data.address); else setResolveErr('No one has claimed that handle yet.'); });
    return () => { live = false; };
  }, [to]);

  const a = Number(amount);
  const can = !!resolved && a > 0 && (usdcBal == null || a <= usdcBal) && !busy;

  async function pay() {
    if (!resolved) return;
    setBusy(true); setError(null);
    const out = await runTx('payment', { destination: resolved, amount: a.toFixed(7), asset: { type: 'credit_alphanum4', code: 'USDC', issuer: USDC_ISSUER[network] } }, memo ? { memo: { type: 'text', value: memo.slice(0, 28) } } : undefined);
    setBusy(false);
    if (out.status === 'error') { setError(out.details || out.message || 'The payment failed'); return; }
    setHash(out.hash); void refreshWalletBalance();
  }

  return (
    <Shell title="Pay a friend" back="/app">
      {!hash ? (
        <div className={`${card} reveal space-y-5`}>
          <div>
            <span className={label}>To</span>
            <input value={to} onChange={e => setTo(e.target.value)} placeholder="@handle or G… address" autoFocus className={`${input} font-mono`} />
            <div className={`mt-2 text-[13px] min-h-5 ${resolveErr ? 'text-terracotta' : 'text-forest-deep'}`}>{resolved ? `→ ${shortG(resolved)}` : resolveErr}</div>
          </div>
          <div>
            <span className={label}>Amount</span>
            <div className="field flex items-center gap-3 px-4"><span className="text-ink-muted font-semibold">$</span><input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="10" className="flex-1 py-3.5 text-[24px] font-semibold outline-none bg-transparent" /><span className="text-[13px] font-semibold text-ink-muted">USDC</span></div>
            <div className="mt-2 text-[13px] text-ink-muted">{usdcBal != null ? `Balance ${fmtUsdc(usdcBal)}` : ''}</div>
          </div>
          <div><span className={label}>Note (optional)</span><input value={memo} onChange={e => setMemo(e.target.value)} placeholder="rent, thanks, ⚽" className={input} maxLength={28} /></div>
          {error && <p className="text-[13px] text-terracotta bg-terracotta-soft rounded-xl px-3 py-2">{error}</p>}
          <button disabled={!can} onClick={pay} className={primary(can)}>{busy ? 'Sending…' : a ? `Pay ${fmtUsdc(a)}` : 'Pay'}</button>
          <p className="text-[11.5px] text-ink-faint text-center">Settles on Stellar in ~5 seconds · fee ≈ $0.00001</p>
        </div>
      ) : (
        <div className={`${card} reveal text-center`}>
          <div className="mx-auto w-14 h-14 rounded-full bg-forest-mist text-forest-deep flex items-center justify-center text-2xl">✓</div>
          <div className="mt-3 font-display text-[22px] font-semibold">Sent</div>
          <p className="mt-1 text-[14px] text-ink-muted">{fmtUsdc(a)} to {to}</p>
          <a className="mt-3 inline-block text-[12px] text-forest underline" target="_blank" rel="noreferrer" href={`https://stellar.expert/explorer/${network === 'mainnet' ? 'public' : 'testnet'}/tx/${hash}`}>View on Stellar</a>
          <button onClick={() => { setHash(null); setAmount(''); setTo(''); setMemo(''); }} className={`${primary(true)} mt-5`}>Pay someone else</button>
        </div>
      )}
    </Shell>
  );
}
