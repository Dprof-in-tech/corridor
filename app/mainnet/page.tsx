'use client';

import Link from 'next/link';
import { Fragment, useEffect, useState } from 'react';
import { Coins, DashboardArches, Logo } from '../../components/Brand';
import { PROOFS, STELLAR_EXPERT_TX, BASESCAN_TX, HORIZON_TX, type Proof } from '../../lib/proofs';

// Public page: what the corridor has already done on mainnet (with the
// on-chain records fetched live from Horizon) and a walkthrough of the
// mainnet path — who signs, who holds the money at each hop, and what is
// live vs. waiting on a switch. No sign-in needed.

const INK = '#2F4A3B', ACCENT = '#4F7A5C', MUTED = '#5E6058', CAPTION = '#8A8A80', HAIR = '#D9D2C2', CARD = '#FBF8F2';
const short = (h: string) => `${h.slice(0, 8)}…${h.slice(-6)}`;
const Serif = ({ children, size = 44 }: { children: React.ReactNode; size?: number }) => <h2 style={{ font: `400 ${size}px/1.1 var(--font-display)`, letterSpacing: '-0.015em', color: INK, margin: 0 }}>{children}</h2>;
const Em = ({ children }: { children: React.ReactNode }) => <span style={{ color: ACCENT, fontStyle: 'italic' }}>{children}</span>;
const Eyebrow = ({ children }: { children: React.ReactNode }) => <div className="mono-eyebrow">{children}</div>;

type Horizon = { ledger: number; created_at: string; fee_charged: string; successful: boolean; operation_count: number; source_account: string };

function ProofCard({ p }: { p: Proof }) {
  const [h, setH] = useState<Horizon | null | 'error'>(null);
  useEffect(() => {
    fetch(HORIZON_TX(p.stellarTx)).then(r => r.ok ? r.json() : Promise.reject()).then(setH).catch(() => setH('error'));
  }, [p.stellarTx]);
  const rows: Array<[string, React.ReactNode]> = [
    ['From', p.from], ['To', p.to],
    ['Sent → received', <><b style={{ fontWeight: 500, color: INK }}>{p.amountIn}</b> → <b style={{ fontWeight: 500, color: INK }}>{p.amountOut}</b> in {p.elapsed}</>],
    ['Stellar', <a href={STELLAR_EXPERT_TX(p.stellarTx)} target="_blank" rel="noreferrer" style={{ font: '13px var(--font-mono)', color: ACCENT }}>{short(p.stellarTx)} ↗</a>],
    ...(p.baseTx ? [['Base (CCTP mint)', <a href={BASESCAN_TX(p.baseTx)} target="_blank" rel="noreferrer" style={{ font: '13px var(--font-mono)', color: ACCENT }}>{short(p.baseTx)} ↗</a>] as [string, React.ReactNode]] : []),
    ...(p.weaveOrder ? [['Weave order', <span style={{ font: '13px var(--font-mono)', color: MUTED }}>{p.weaveOrder}</span>] as [string, React.ReactNode]] : []),
  ];
  return (
    <div style={{ background: CARD, border: `1px solid ${HAIR}`, borderRadius: 28, padding: 28, display: 'flex', flexDirection: 'column', gap: 18, boxShadow: '0 30px 60px -40px rgba(47,74,59,.35)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ font: '400 30px/1.1 var(--font-display)', color: INK }}>{p.title}</div>
        <div style={{ font: '12px var(--font-mono)', letterSpacing: '.06em', color: CAPTION }}>{new Date(p.when).toUTCString().replace('GMT', 'UTC')}</div>
      </div>
      <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '10px 20px', font: '14px/1.5 var(--font-body)', color: MUTED }}>
        {rows.map(([k, v]) => <Fragment key={k}><dt style={{ font: '11px var(--font-mono)', letterSpacing: '.08em', textTransform: 'uppercase', color: CAPTION, paddingTop: 3 }}>{k}</dt><dd style={{ margin: 0 }}>{v}</dd></Fragment>)}
      </dl>
      {/* Live from Horizon — proves the hash is on Stellar mainnet right now. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 18, background: '#F3EDE0', font: '13px var(--font-body)', color: MUTED }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: h === 'error' ? '#A8321E' : h ? ACCENT : HAIR, animation: h ? undefined : 'tour-pulse 1.4s ease-in-out infinite' }} />
        {h === null ? 'Checking Horizon (Stellar mainnet)…'
          : h === 'error' ? 'Horizon could not be reached — open the explorer link instead.'
          : <>Confirmed on Stellar mainnet · ledger <span style={{ font: '13px var(--font-mono)', color: INK }}>{h.ledger.toLocaleString()}</span> · {h.operation_count} op · fee {(Number(h.fee_charged) / 1e7).toFixed(4)} XLM · signed by <span style={{ font: '13px var(--font-mono)', color: INK }}>{short(h.source_account)}</span></>}
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, font: '14px/1.55 var(--font-body)', color: MUTED, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {p.notes.map(n => <li key={n}>{n}</li>)}
      </ul>
    </div>
  );
}

// The mainnet path for the flagship direction, hop by hop.
const HOPS: Array<{ n: string; title: string; who: string; holds: string; time: string; status: 'live' | 'switch' | 'paused'; note: string }> = [
  { n: '01', title: 'Sign in, get a wallet', who: 'Pollar', holds: 'You', time: 'seconds', status: 'live', note: 'Google or email → a Stellar wallet with sponsored fees. Same on testnet and mainnet.' },
  { n: '02', title: 'Sign 1 of 2 — allow USDC to move', who: 'Your wallet · Circle CCTP', holds: 'You', time: '~5 s', status: 'live', note: 'A Soroban allowance on the USDC contract for Circle\'s TokenMessenger. Weave can offer a standing allowance so repeat sends are one signature.' },
  { n: '03', title: 'Sign 2 of 2 — bridge', who: 'LI.FI diamond on Stellar', holds: 'Circle (in flight)', time: '~60 s', status: 'live', note: 'CCTP burns the USDC on Stellar and mints it on Base directly to the payout provider\'s receive address. Floor: 2 USDC; the sender needs ≥ 2 XLM.' },
  { n: '04', title: 'Naira payout', who: 'Weave → Paycrest', holds: 'Paycrest (seconds)', time: '~20 s', status: 'live', note: 'Weave plans the route, watches the mint land and Paycrest pays any Nigerian bank. Account name is verified before you send.' },
  { n: '05', title: 'Naira in the bank', who: 'Any Nigerian bank', holds: 'The recipient', time: '', status: 'live', note: 'Proof #1 below: ₦2,698.94 in PalmPay, 1 min 23 s after the second signature.' },
];
const OTHER: Array<{ leg: string; via: string; status: 'live' | 'switch' | 'paused'; note: string }> = [
  { leg: 'Naira → your wallet (Add money)', via: 'Weave → NEAR Intents', status: 'paused', note: 'NEAR\'s Stellar pairs are paused ("quoting not available"). On testnet a labelled simulator stands in; on mainnet this turns on the day NEAR resumes.' },
  { leg: 'Bolivianos in and out', via: 'Pollar · Stereum (QR in, ACH out)', status: 'switch', note: 'Pollar enables the BOB ramp per mainnet app. Mocked on testnet at the Pollar team\'s request; the calls are the same SDK calls.' },
  { leg: 'Friend → friend', via: 'Stellar payment, sponsored', status: 'live', note: 'USDC to an @handle or G-address. No fee.' },
  { leg: 'Any Stellar wallet (SEP-24)', via: 'Weave anchor · stellar.toml', status: 'switch', note: 'Weave is a SEP-10/24 anchor for NGN. Needs a stable HTTPS home domain so Pollar can list it.' },
];
const StatusPill = ({ s }: { s: 'live' | 'switch' | 'paused' }) => {
  const m = { live: ['Live', ACCENT], switch: ['Waiting on a switch', INK], paused: ['Provider paused', '#A8321E'] }[s];
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: '11px var(--font-mono)', letterSpacing: '.06em', textTransform: 'uppercase', color: m[1], border: `1px solid ${m[1]}55`, borderRadius: 999, padding: '3px 10px', whiteSpace: 'nowrap' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: m[1] }} />{m[0]}</span>;
};

export default function MainnetPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#F3EDE0', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}><Coins variant="dashboard" /></div>
      <DashboardArches />
      <header style={{ position: 'relative', zIndex: 1, maxWidth: 1120, margin: '0 auto', padding: '28px 48px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 }} className="chrome-pad">
        <Link href="/" style={{ textDecoration: 'none' }}><Logo /></Link>
        <Link href="/app" style={{ font: '13px var(--font-body)', color: INK, background: CARD, borderRadius: 17, padding: '8px 14px', textDecoration: 'none', border: `1px solid ${HAIR}` }}>Open the app →</Link>
      </header>

      <main style={{ position: 'relative', zIndex: 1, maxWidth: 1120, margin: '0 auto', padding: '64px 48px 200px', display: 'flex', flexDirection: 'column', gap: 72 }} className="chrome-pad">
        <section style={{ maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Eyebrow>Mainnet · what is real today</Eyebrow>
          <h1 style={{ font: '400 clamp(48px, 7vw, 88px)/0.95 var(--font-display)', letterSpacing: '-0.025em', color: INK, margin: 0 }}>Real naira.<br />Real Stellar.<br /><Em>Nobody in the middle.</Em></h1>
          <p style={{ font: '16px/1.6 var(--font-body)', color: MUTED, margin: 0, maxWidth: 560 }}>The app you can sign into runs on testnet with the Bolivian payout mocked, as the Pollar team asked. The Nigerian leg is already live on mainnet — below are the transactions, checked against Horizon as you read this, and what the whole path looks like hop by hop.</p>
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div><Eyebrow>Live proof</Eyebrow><Serif>Done on mainnet, <Em>verifiable</Em>.</Serif></div>
          <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', maxWidth: 960 }}>
            {PROOFS.map(p => <ProofCard key={p.id} p={p} />)}
          </div>
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div><Eyebrow>Walkthrough</Eyebrow><Serif>Send $2 to a bank in Nigeria, <Em>on mainnet</Em>.</Serif></div>
          <div style={{ font: '15px/1.6 var(--font-body)', color: MUTED, maxWidth: 560 }}>The same sentence as in the app — <i>a bank in Nigeria · my balance · $2</i> — and what happens after you press Send. The "holds" column is the custody story: it is only ever you, then a bridge in flight, then the payout provider for seconds.</div>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', maxWidth: 900 }}>
            {HOPS.map((h, i) => (
              <li key={h.n} style={{ display: 'grid', gridTemplateColumns: '52px 1fr', gap: 20, padding: '22px 0', borderTop: i ? `1px solid ${HAIR}` : 0 }} className="hop">
                <div style={{ font: '400 32px/1 var(--font-display)', color: '#B8C7BA' }}>{h.n}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
                    <span style={{ font: '400 26px/1.15 var(--font-display)', color: INK }}>{h.title}</span>
                    <StatusPill s={h.status} />
                  </div>
                  <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', font: '12px var(--font-mono)', letterSpacing: '.04em', color: CAPTION }}>
                    <span>WHO · <span style={{ color: INK }}>{h.who}</span></span>
                    <span>HOLDS THE MONEY · <span style={{ color: INK }}>{h.holds}</span></span>
                    {h.time && <span>TIME · <span style={{ color: INK }}>{h.time}</span></span>}
                  </div>
                  <div style={{ font: '14.5px/1.55 var(--font-body)', color: MUTED, maxWidth: 640 }}>{h.note}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div><Eyebrow>The rest of the corridor</Eyebrow><Serif>What flips on, and <Em>who flips it</Em>.</Serif></div>
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', maxWidth: 960 }}>
            {OTHER.map(o => (
              <div key={o.leg} style={{ background: CARD, border: `1px solid ${HAIR}`, borderRadius: 22, padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ font: '400 22px/1.15 var(--font-display)', color: INK }}>{o.leg}</div>
                  <StatusPill s={o.status} />
                </div>
                <div style={{ font: '12px var(--font-mono)', letterSpacing: '.04em', color: CAPTION }}>VIA · <span style={{ color: INK }}>{o.via}</span></div>
                <div style={{ font: '14px/1.55 var(--font-body)', color: MUTED }}>{o.note}</div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
          <Serif size={32}>Network follows <Em>credentials</Em>.</Serif>
          <p style={{ font: '15px/1.6 var(--font-body)', color: MUTED, margin: 0 }}>There is no "mainnet mode" flag in the code. The switch in the app header picks a credential pair — Pollar's mainnet publishable key and Weave's live secret key — and the USDC issuer, the explorer, the real bridge instead of the simulator and the real BOB ramp instead of the mock all follow from which keys are in use. That is how Weave's sandbox and live environments already work for merchants.</p>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <Link href="/app" className="cta" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>Try it on testnet</Link>
            <a href="https://stellar.expert/explorer/public/tx/3b04306949879f24384c0b2ccc50c1209a121cb531a5b238e372818f0c8a5b48" target="_blank" rel="noreferrer" style={{ font: '14px var(--font-body)', color: INK }}>Open proof #1 on stellar.expert ↗</a>
          </div>
        </section>
      </main>
      <style>{`
        @keyframes tour-pulse { 0%,100% { transform: scale(1); opacity: 1 } 50% { transform: scale(1.6); opacity: .5 } }
        @media (max-width: 720px) { .chrome-pad { padding-left: 20px !important; padding-right: 20px !important; } .hop { grid-template-columns: 1fr !important; } }
        @media (max-width: 520px) { dl { grid-template-columns: 1fr !important; } }
      `}</style>
    </div>
  );
}
