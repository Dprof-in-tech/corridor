'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePollar } from '@pollar/react';
import { GoogleButton } from '../components/GoogleButton';
import { Coins, LandingShapes, Logo, useBoardScale } from '../components/Brand';
import { IS_TESTNET } from '../lib/weave';

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
    const onStorage = (e: StorageEvent) => { if (e.key && /pollar/i.test(e.key) && e.newValue) window.location.replace('/app'); };
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
  const k = useBoardScale();

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
        .board .content { position: relative; min-height: 100vh; padding: clamp(24px, 4.5vw, 56px) clamp(24px, 5vw, 64px) clamp(56px, 8vh, 80px); display: flex; flex-direction: column; box-sizing: border-box; }
        /* Desktop (card floats right): the headline sizes to the space left of the 360px card. */
        .board .headline { font: 400 clamp(52px, calc((100vw - 600px) / 6.6), 104px)/0.95 var(--font-display); letter-spacing: -0.025em; color: #2F4A3B; margin: 20px 0 0; max-width: calc(100vw - 600px); }
        /* Bullets: pinned to the bottom on landscape screens (the design board); on
           portrait screens they follow the headline so the page has no dead middle. */
        /* Bullets: bottom-anchored, right of the arches, exactly as the design board. */
        .board .bullets { margin-top: auto; padding-top: 56px; margin-left: min(600px, calc(100vw - 484px)); max-width: 420px; display: flex; flex-direction: column; gap: 14px; position: relative; z-index: 1; }
        .board .card-slot { position: absolute; right: clamp(24px, 5vw, 64px); top: clamp(240px, 30vh, 320px); z-index: 2; }
        @media (max-width: 900px) {
          .board .headline { font-size: clamp(44px, 9vw, 92px); max-width: none; }
          .board .card-slot { position: relative; right: auto; top: auto; margin-top: 40px; }
          .board .bullets { margin-left: 0; padding-top: 40px; }
          .board .shapes { opacity: .55; }
        }
        @media (max-width: 560px) {
          .board .shapes { display: none; }
          .signin-card { width: 100% !important; box-sizing: border-box; }
        }
      `}</style>
      <div className="coins"><Coins variant="landing" scale={k} /></div>
      <div className="shapes"><LandingShapes scale={k} /></div>

        <div className="content">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Logo />
            <span style={{ font: '13px var(--font-body)', color: '#2F4A3B', position: 'relative', zIndex: 1, background: '#F3EDE0', padding: '6px 12px', borderRadius: 14 }}>Weave × Pollar · Stellar</span>
          </div>
          <div style={{ marginTop: 72, maxWidth: 640, position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, font: '12px var(--font-mono)', letterSpacing: '.08em', color: '#4F7A5C' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4F7A5C' }} />NIGERIA ↔ BOLIVIA · {IS_TESTNET ? 'TESTNET DEMO' : 'LIVE ON MAINNET'}
            </div>
            <h1 className="headline">Naira in Lagos.<br />Bolivianos in La Paz.<br /><span style={{ color: '#4F7A5C', fontStyle: 'italic' }}>Minutes, not days.</span></h1>
          </div>
          <div className="bullets">
            {[
              ['Send to Nigeria', 'USDC leaves your wallet, naira lands in any Nigerian bank in ~3 minutes.'],
              ['Add naira', 'pay by bank transfer, USDC arrives in your wallet.'],
              ['Cash out in Bolivia', "BOB to your bank via Pollar's ramp."],
            ].map(([lead, rest]) => (
              <div key={lead} style={{ font: '14px/1.5 var(--font-body)', color: '#2F4A3B' }}><strong style={{ fontWeight: 500 }}>{lead}</strong> — {rest}</div>
            ))}
          </div>
          <div className="card-slot">{card}</div>
        </div>
    </div>
  );
}
