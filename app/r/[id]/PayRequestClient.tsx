'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { bankMatches, fmtNgn, type Bank } from '../../../lib/weave';
import { Logo } from '../../../components/Brand';

// Public payer page for a naira request. No account needed. Everything that
// touches Weave happens on the server for this request id: the bank list,
// the name lookup, and the order itself (destination fixed to the requester's
// stored wallet). This page only ever posts the payer's own bank details.

type Pub = { id: string; status: string; ngnAmount: number; bobAmount: number; handle: string | null; bankDetails: { institution: string; accountIdentifier: string; accountName: string; amountToTransfer: string } | null; orderStatus: string | null };
type Mode = 'loading' | 'form' | 'pay' | 'done' | 'error';

const INK = '#2F4A3B', ACCENT = '#4F7A5C', MUTED = '#5E6058', CAPTION = '#8A8A80', HAIR = '#D9D2C2', CARD = '#FBF8F2';

export default function PayRequestClient({ id }: { id: string }) {
  const [req, setReq] = useState<Pub | null>(null);
  const [mode, setMode] = useState<Mode>('loading');
  const [error, setError] = useState<string | null>(null);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [bankQuery, setBankQuery] = useState(''); const [bankCode, setBankCode] = useState('');
  const [acct, setAcct] = useState(''); const [acctName, setAcctName] = useState(''); const [resolving, setResolving] = useState(false); const [acctErr, setAcctErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const acctRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const j = await fetch(`/api/requests/${id}`).then(r => r.json()).catch(() => null);
    if (!j?.success) { setError('This request link is invalid or expired.'); setMode('error'); return null; }
    const p: Pub = j.data; setReq(p);
    setMode(p.status === 'cashed_out' || p.status === 'funded' || p.orderStatus === 'completed' ? 'done' : p.status === 'paying' ? 'pay' : 'form');
    return p;
  };
  useEffect(() => {
    load();
    fetch('/api/banks').then(r => r.json()).then(j => j.success && setBanks(j.data ?? [])).catch(() => {});
  }, [id]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Poll while the payer's transfer is pending.
  useEffect(() => {
    if (mode !== 'pay') return;
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [mode]);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setAcctName(''); setAcctErr(null);
    if (!bankCode || acct.length < 10) return;
    let live = true; setResolving(true);
    fetch(`/api/requests/${id}/verify-bank`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ institution: bankCode, accountIdentifier: acct }) })
      .then(r => r.json().then(j => ({ status: r.status, j })))
      .then(({ status, j }) => { if (!live) return; if (j.success && j.data) setAcctName(String(j.data)); else setAcctErr(status >= 500 ? 'We couldn’t check that account right now — try again in a moment.' : status === 429 ? 'Too many lookups — wait a minute.' : 'We couldn’t find that account. Check the number and bank.'); })
      .catch(() => live && setAcctErr('We couldn’t check that account right now.'))
      .finally(() => live && setResolving(false));
    return () => { live = false; };
  }, [bankCode, acct, id]);
  const filtered = useMemo(() => bankQuery && !bankCode ? banks.filter(b => bankMatches(b.name, bankQuery)).slice(0, 6) : [], [banks, bankQuery, bankCode]);

  async function start() {
    if (!req) return; setError(null);
    const j = await fetch(`/api/requests/${id}/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bankCode, accountNumber: acct, accountName: acctName }) }).then(r => r.json()).catch(() => null);
    if (!j?.success) { setError(j?.error || 'Could not start the transfer'); return; }
    setReq(j.data); setMode(j.data.orderStatus === 'completed' ? 'done' : 'pay');
  }
  const copy = (k: string, v: string) => navigator.clipboard.writeText(v).then(() => { setCopied(k); setTimeout(() => setCopied(null), 1500); });
  const who = req?.handle ? `@${req.handle}` : 'someone on Corridor';
  const bank = req?.bankDetails;

  const card: React.CSSProperties = { background: CARD, border: `1px solid ${HAIR}`, borderRadius: 28, padding: 28, boxShadow: '0 30px 60px -40px rgba(47,74,59,.35)', display: 'flex', flexDirection: 'column', gap: 18 };
  const input: React.CSSProperties = { border: 0, borderBottom: `1px solid ${INK}`, background: 'transparent', font: 'italic 400 28px var(--font-display)', color: INK, padding: '0 4px 4px', width: '100%' };

  return (
    <div style={{ minHeight: '100vh', background: '#F3EDE0' }}>
      <header style={{ maxWidth: 560, margin: '0 auto', padding: '28px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/" style={{ textDecoration: 'none' }}><Logo /></Link>
        <span className="mono-eyebrow">Pay from Nigeria</span>
      </header>
      <main style={{ maxWidth: 560, margin: '0 auto', padding: '48px 20px 120px' }}>
        {mode === 'loading' && <div style={{ font: 'italic 22px var(--font-display)', color: CAPTION }}>Loading…</div>}
        {mode === 'error' && <div style={card}><div style={{ font: '400 30px var(--font-display)', color: '#A8321E' }}>Can’t continue.</div><p style={{ margin: 0, font: '14px/1.5 var(--font-body)', color: MUTED }}>{error}</p></div>}
        {mode === 'form' && req && (
          <div style={card}>
            <div className="mono-eyebrow">Request from {who}</div>
            <div style={{ font: '400 56px/1 var(--font-display)', color: INK, letterSpacing: '-0.02em' }}>{fmtNgn(req.ngnAmount)}</div>
            <div style={{ font: '14px/1.5 var(--font-body)', color: MUTED }}>They receive Bs {req.bobAmount.toFixed(2)} in Bolivia. You pay by bank transfer from any Nigerian bank.</div>
            <div style={{ position: 'relative' }}>
              <div className="mono-eyebrow" style={{ marginBottom: 8 }}>Your bank · only used if we ever need to refund you</div>
              <input value={bankQuery} onChange={e => { setBankQuery(e.target.value); setBankCode(''); }} placeholder="GTBank, OPay, Kuda…" style={input} />
              {filtered.length > 0 && <div style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, top: '100%', marginTop: 6, background: CARD, border: `1px solid ${HAIR}`, borderRadius: 16, overflow: 'hidden', boxShadow: '0 30px 60px -30px rgba(47,74,59,.35)' }}>{filtered.map(b => <button key={b.code} onClick={() => { setBankCode(b.code); setBankQuery(b.name); setTimeout(() => acctRef.current?.focus(), 50); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', border: 0, background: 'transparent', font: '15px var(--font-body)', color: INK, cursor: 'pointer' }}>{b.name}</button>)}</div>}
            </div>
            {bankCode && (
              <div>
                <div className="mono-eyebrow" style={{ marginBottom: 8 }}>Your account number</div>
                <input ref={acctRef} inputMode="numeric" value={acct} onChange={e => setAcct(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="0123456789" style={{ ...input, font: '400 24px var(--font-mono)', letterSpacing: '.08em' }} />
                <div style={{ marginTop: 8, font: '14px var(--font-body)', color: acctErr ? '#A8321E' : ACCENT, minHeight: 20 }}>{resolving ? <span style={{ color: CAPTION }}>Checking the account…</span> : acctName ? `→ ${acctName}` : acctErr ?? ''}</div>
              </div>
            )}
            {error && <p style={{ margin: 0, font: '14px/1.5 var(--font-body)', color: '#A8321E', background: '#F6E1DC', borderRadius: 16, padding: '10px 14px' }}>{error}</p>}
            <div><button className="cta" disabled={!acctName} onClick={start} style={{ opacity: acctName ? 1 : .4 }}>Get transfer details</button></div>
          </div>
        )}
        {mode === 'pay' && (
          <div style={card}>
            <div style={{ font: '400 30px var(--font-display)', color: INK }}>Transfer exactly this amount</div>
            {bank ? (
              <div>
                {[['Bank', bank.institution, 'b'], ['Account number', bank.accountIdentifier, 'n'], ['Account name', bank.accountName, 'a'], ['Amount', fmtNgn(Number(bank.amountToTransfer)), 'm']].map(([k, v, key]) => (
                  <div key={key} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '10px 0', borderBottom: `1px solid #E6E0D0`, font: '14px var(--font-body)' }}>
                    <span style={{ color: CAPTION }}>{k}</span>
                    <button onClick={() => copy(key, String(v))} style={{ border: 0, background: 'transparent', font: '14px var(--font-mono)', color: INK, cursor: 'pointer' }}>{copied === key ? 'Copied ✓' : v}</button>
                  </div>
                ))}
              </div>
            ) : <p style={{ margin: 0, font: '14px var(--font-body)', color: MUTED }}>Preparing bank details…</p>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, font: '13px var(--font-body)', color: CAPTION }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: ACCENT, animation: 'tour-pulse 1.4s ease-in-out infinite' }} />Waiting for your transfer{req?.orderStatus ? ` · ${req.orderStatus}` : ''}</div>
          </div>
        )}
        {mode === 'done' && (
          <div style={card}>
            <div style={{ font: '400 44px/1.1 var(--font-display)', color: INK }}>Paid<span style={{ color: ACCENT, fontStyle: 'italic' }}>.</span></div>
            <p style={{ margin: 0, font: '15px/1.5 var(--font-body)', color: MUTED }}>{who} is receiving Bs {req?.bobAmount.toFixed(2)}. Thank you.</p>
          </div>
        )}
      </main>
      <style>{`@keyframes tour-pulse { 0%,100% { transform: scale(1); opacity: 1 } 50% { transform: scale(1.6); opacity: .5 } }`}</style>
    </div>
  );
}
