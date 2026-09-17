'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePollar } from '@pollar/react';
import { GoogleButton } from '../components/GoogleButton';
import { Coins, LandingShapes, Logo, useBoardScale } from '../components/Brand';
import { useNetwork } from '../lib/network';
import { NEXT_AFRICA, NEXT_CURRENCIES } from '../lib/countries';

// Landing / sign-in (design handoff "Corridor Landing"). A fixed 1200×900 art
// board on wide viewports; below ~1000px the board (below its own 1200px width) becomes a fluid column with
// the sign-in card under the headline.

export default function Landing() {
  const { isAuthenticated, login, openLoginModal, getClient } = usePollar();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // `?preview=1` keeps the landing visible while signed in (design review).
  useEffect(() => {
    if (isAuthenticated && !new URLSearchParams(window.location.search).has('preview')) router.replace('/app');
  }, [isAuthenticated, router]);

  // Pollar's OAuth finishes in the tab that started it; the popup tab is
  // bounced back to our origin. The session lands in shared localStorage, so
  // any of our tabs that sees it appear can move on to /app.
  useEffect(() => {
    const preview = new URLSearchParams(window.location.search).has('preview');
    // Only the session key counts (the SDK also writes nonces), and never in preview.
    const onStorage = (e: StorageEvent) => { if (!preview && e.key && /pollar:.*:session$/i.test(e.key) && e.newValue) window.location.replace('/app'); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Pollar reports failures on its auth state machine, not as thrown errors.
  useEffect(() => getClient().onAuthStateChange((st) => {
    setBusy(!['idle', 'authenticated', 'error', 'entering_email', 'entering_code'].includes(st.step));
    if (st.step === 'error') {
      const code = (st as any).errorCode ? ` (${(st as any).errorCode})` : '';
      setAuthError(`${(st as any).message ?? 'Sign-in failed'}${code}. If you are the developer: add this origin under Build → Domains in the Pollar dashboard.`);
    } else if (st.step !== 'idle') setAuthError(null);
  }), [getClient]);

  const emailOk = /.+@.+\..+/.test(email);
  const IS_TESTNET = useNetwork() === 'testnet';
  const k = useBoardScale();
  // Keep the arches below the hero text: measure where the bullets end and
  // cap the arch height to the room left under them.
  const heroRef = useRef<HTMLDivElement>(null);
  const [archCap, setArchCap] = useState<number | undefined>(undefined);
  useEffect(() => {
    const el = heroRef.current; if (!el) return;
    const calc = () => { const r = el.getBoundingClientRect(); const room = window.innerHeight - (r.bottom + window.scrollY) - 24; setArchCap(Math.max(120, room)); };
    calc();
    const ro = new ResizeObserver(calc); ro.observe(el); window.addEventListener('resize', calc);
    return () => { ro.disconnect(); window.removeEventListener('resize', calc); };
  }, []);
  const shapeScale = { kx: k.kx, ky: archCap ? Math.min(k.ky, archCap / 420) : k.ky };

  const card = (
    <div className="signin-card" style={{ width: 360, background: '#FBF8F2', padding: 32, display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 30px 60px -30px rgba(47,74,59,.35)' }}>
      <div style={{ font: '28px var(--font-display)', color: '#2F4A3B' }}>Get started</div>
      <div style={{ font: '13px/1.5 var(--font-body)', color: '#8A8A80', marginTop: -8 }}>A Stellar wallet is created for you. No seed phrases.</div>
      <GoogleButton disabled={busy} onClick={() => login({ provider: 'google' })} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, font: '12px var(--font-body)', color: '#8A8A80' }}><span style={{ flex: 1, height: 1, background: '#D9D2C2' }} />or email<span style={{ flex: 1, height: 1, background: '#D9D2C2' }} /></div>
      <input value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" type="email" className="field" style={{ height: 48, padding: '0 18px', font: '15px var(--font-body)', color: '#2F4A3B' }} />
      <button disabled={!emailOk || busy} onClick={() => login({ provider: 'email', email })} style={{ height: 48, border: 0, background: emailOk ? '#4F7A5C' : '#B8C7BA', borderRadius: 24, font: '14px var(--font-body)', color: '#F3EDE0', cursor: emailOk ? 'pointer' : 'not-allowed' }} onMouseEnter={e => { if (emailOk) (e.currentTarget.style.background = '#2F4A3B'); }} onMouseLeave={e => { (e.currentTarget.style.background = emailOk ? '#4F7A5C' : '#B8C7BA'); }}>Send me a code</button>
      <button onClick={() => openLoginModal()} style={{ border: 0, background: 'transparent', font: '12px var(--font-body)', color: '#8A8A80', textAlign: 'center', cursor: 'pointer' }}>More sign-in options (Freighter, xBull…)</button>
      {authError && <p style={{ font: '12.5px/1.5 var(--font-body)', color: '#A8321E', background: '#F6E1DC', borderRadius: 12, padding: '8px 12px', margin: 0 }}>{authError}</p>}
    </div>
  );

  return (
    <div className="board">
      <style>{`
        .board { position: relative; width: 100%; min-height: 100vh; background: #F3EDE0; overflow: hidden; }
        .board .coins { position: absolute; inset: 0; pointer-events: none; }
        .board .content { position: relative; min-height: 100vh; padding: clamp(24px, 4.5vw, 56px) clamp(20px, 5vw, 64px) clamp(56px, 8vh, 80px); display: flex; flex-direction: column; box-sizing: border-box; }
        /* Headline: never wraps. Sized from (a) the width beside the 360px card —
           the longest line "Bolivianos in La Paz." is ~7.1em — and (b) the height
           above the arches (their top sits at 46.7% of the viewport); capped at the
           design's 104px. The bullets follow the tagline, so the ARCHES shrink to
           stay below them (see archCap), never the text. */
        .board .headline { font: 400 clamp(44px, min(calc((100vw - 560px) / 7.1), calc((53.3vh - 210px) / 2.85)), 104px)/0.95 var(--font-display); letter-spacing: -0.025em; color: #2F4A3B; margin: 20px 0 0; white-space: nowrap; }
        /* Bullets: directly under the tagline, every screen size. */
        .board .bullets { display: flex; flex-direction: column; gap: 14px; margin-top: 32px; max-width: 420px; position: relative; z-index: 1; }
        /* Card floats right on desktop. */
        .board .card-slot { position: absolute; right: clamp(24px, 5vw, 64px); top: clamp(240px, 30vh, 320px); z-index: 2; width: 360px; }

        /* Layout C — narrow: everything stacks, shapes fade back. */
        @media (max-width: 900px) {
          .board .headline { font-size: clamp(40px, 8.5vw, 92px); white-space: normal; }
          .board .card-slot { position: relative; right: auto; top: auto; margin-top: 40px; width: auto; }
          .board .shapes { opacity: .55; }
        }
        @media (max-width: 560px) {
          .board .shapes { display: none; }
          .signin-card { width: 100% !important; box-sizing: border-box; }
        }
      `}</style>
      <div className="coins"><Coins variant="landing" scale={shapeScale} /></div>
      <div className="shapes"><LandingShapes scale={shapeScale} /></div>

        <div className="content">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Logo />
            <span style={{ font: '13px var(--font-body)', color: '#2F4A3B', position: 'relative', zIndex: 1, background: '#F3EDE0', padding: '6px 12px', borderRadius: 14 }}>Weave × Pollar · Stellar</span>
          </div>
          <div ref={heroRef} style={{ marginTop: 72, maxWidth: 640, position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, font: '12px var(--font-mono)', letterSpacing: '.08em', color: '#4F7A5C' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4F7A5C' }} />NIGERIA ↔ BOLIVIA · {IS_TESTNET ? 'TESTNET DEMO' : 'MAINNET · COMING SOON'}
            </div>
            <h1 className="headline">Naira in Lagos.<br />Bolivianos in La Paz.<br /><span style={{ color: '#4F7A5C', fontStyle: 'italic' }}>Minutes, not days.</span></h1>
            <div className="bullets">
              {[
                ['Send to Nigeria', 'USDC leaves your wallet, naira lands in any Nigerian bank in ~3 minutes.'],
                ['Add naira', 'pay by bank transfer, USDC arrives in your wallet.'],
                ['Cash out in Bolivia', "BOB to your bank via Pollar's ramp."],
                ['Next: ' + NEXT_AFRICA.map(c => c.name).join(', '), `${NEXT_CURRENCIES} on the same Weave rail — a switch away.`],
              ].map(([lead, rest]) => (
                <div key={lead} style={{ font: '14px/1.5 var(--font-body)', color: '#2F4A3B' }}><strong style={{ fontWeight: 500 }}>{lead}</strong> — {rest}</div>
              ))}
              <Link href="/mainnet" style={{ font: 'italic 16px var(--font-display)', color: '#4F7A5C', textDecoration: 'none', borderBottom: '1px solid #4F7A5C', width: 'fit-content', marginTop: 4 }}>Already live on mainnet — see the proof →</Link>
            </div>
          </div>
          <div className="card-slot">{card}</div>
        </div>
    </div>
  );
}
