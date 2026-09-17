'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePollar } from '@pollar/react';
import { Coins, DashboardArches, Logo } from './Brand';
import { useNetwork, setNetwork, MAINNET_LIVE } from '../lib/network';
import { TOUR_EVENT } from './Tour';
import { ensureWalletSession, endWalletSession } from '../lib/session-client';

// Authenticated frame per the design handoff "Dashboard v3": coin backdrop,
// fixed arches bottom-right, header with TEST MODE pill / History / Sign out,
// collapsible test notice, 1120px content column.

/** Does this browser hold a Pollar session at all? Synchronous, no SDK needed. */
function hasStoredSession(): boolean {
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i) ?? ''; if (/^pollar:.*:session$/.test(k) && localStorage.getItem(k)) return true; } } catch {}
  return false;
}

export function Chrome({ children, back }: { children: React.ReactNode; back?: string }) {
  const { isAuthenticated, logout, openTxHistoryModal, getClient, wallet } = usePollar();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [proved, setProved] = useState(false);       // Corridor's own session (signed challenge)
  const [proveError, setProveError] = useState<string | null>(null);
  const [noticeOpen, setNoticeOpen] = useState(true);
  const network = useNetwork();
  const IS_TESTNET = network === 'testnet';
  const COMING_SOON = !IS_TESTNET && !MAINNET_LIVE;

  // Auth gate. Pollar's isAuthenticated is false for a moment on a hard load
  // while the SDK restores a persisted session, so we cannot bounce on it
  // alone — but ready() does real work (key manager, session restore, maybe a
  // token refresh), so we only wait for it when there IS a session to restore.
  // No stored session → straight back to the landing, no waiting.
  useEffect(() => {
    if (!hasStoredSession() && !isAuthenticated) { router.replace('/'); return; }   // (memory-only sessions stay authenticated in-tab)
    let live = true;
    const done = () => live && setReady(true);
    getClient().ready().then(done).catch(done);
    const cap = setTimeout(done, 4000);           // never hang on a slow restore
    return () => { live = false; clearTimeout(cap); };
  }, [getClient, router]);  // eslint-disable-line react-hooks/exhaustive-deps — runs once per mount
  useEffect(() => { if (ready && !isAuthenticated) router.replace('/'); }, [ready, isAuthenticated, router]);
  // Once Pollar says who we are, prove it to our own server: the wallet signs a
  // one-time challenge and gets an httpOnly session the proxy requires.
  const address = wallet?.address ?? null;
  useEffect(() => {
    if (!ready || !isAuthenticated || !address) return;
    let live = true;
    setProveError(null);
    ensureWalletSession(getClient(), address, network).then(() => live && setProved(true)).catch(e => { if (live) { setProved(false); setProveError(e?.message ?? 'Wallet verification failed'); } });
    return () => { live = false; };
  }, [ready, isAuthenticated, address, network, getClient]);   // keyed on the address, not the wallet object, so balance refreshes never remount the page
  useEffect(() => { try { setNoticeOpen(localStorage.getItem('corridor.notice') !== 'hidden'); } catch {} }, []);
  const toggleNotice = () => setNoticeOpen(v => { try { localStorage.setItem('corridor.notice', v ? 'hidden' : 'shown'); } catch {} return !v; });

  if (!ready || !isAuthenticated || !proved) {
    return (
      <div style={{ minHeight: '100vh', background: '#F3EDE0', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        {proveError ? (
          <div style={{ maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ font: '400 32px/1.1 var(--font-display)', color: '#2F4A3B' }}>We couldn’t verify this wallet.</div>
            <div style={{ font: '14px/1.5 var(--font-body)', color: '#5E6058' }}>{proveError}</div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <button className="cta" onClick={() => { setProveError(null); ensureWalletSession(getClient(), address!, network).then(() => setProved(true)).catch(e => setProveError(e?.message ?? 'Wallet verification failed')); }} style={{ height: 44, padding: '0 20px', fontSize: 14 }}>Try again</button>
              <button onClick={() => { void endWalletSession(); logout(); }} style={{ border: 0, background: 'transparent', font: '14px var(--font-body)', color: '#8A8A80', cursor: 'pointer' }}>Sign out</button>
            </div>
          </div>
        ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, font: 'italic 22px var(--font-display)', color: '#8A8A80' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4F7A5C', animation: 'tour-pulse 1.4s ease-in-out infinite' }} />{ready && isAuthenticated ? 'Confirming it’s your wallet…' : 'Opening your wallet…'}
        </div>
        )}
        <style>{`@keyframes tour-pulse { 0%,100% { transform: scale(1); opacity: 1 } 50% { transform: scale(1.6); opacity: .5 } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F3EDE0', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}><Coins variant="dashboard" /></div>
      <DashboardArches />

      <header style={{ position: 'relative', zIndex: 1, maxWidth: 1120, margin: '0 auto', padding: '28px 48px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }} className="chrome-pad">
        <Link href="/app" style={{ textDecoration: 'none' }}><Logo /></Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#F3EDE0', borderRadius: 20, padding: 3 }}>
          {/* Test-mode switch: flips the credential set (Pollar key + Weave key), and the network follows. */}
          <button role="switch" aria-checked={IS_TESTNET} onClick={() => setNetwork(IS_TESTNET ? 'mainnet' : 'testnet')} className="chrome-btn" title={IS_TESTNET ? 'Switch to mainnet (live keys)' : 'Switch to test mode (sandbox keys)'}
            style={{ display: 'flex', alignItems: 'center', gap: 10, height: 34, padding: '0 12px 0 6px', borderRadius: 17, border: `1px solid ${IS_TESTNET ? '#4F7A5C' : '#2F4A3B'}`, background: IS_TESTNET ? '#F3EDE0' : '#2F4A3B', color: IS_TESTNET ? '#2F4A3B' : '#F3EDE0', font: '12px var(--font-mono)', letterSpacing: '.06em', cursor: 'pointer', transition: 'background .2s, color .2s, border-color .2s' }}>
            <span aria-hidden style={{ position: 'relative', width: 34, height: 20, borderRadius: 10, background: IS_TESTNET ? '#4F7A5C' : '#5E6058', transition: 'background .2s' }}>
              <span style={{ position: 'absolute', top: 3, left: IS_TESTNET ? 17 : 3, width: 14, height: 14, borderRadius: '50%', background: '#F3EDE0', transition: 'left .2s' }} />
            </span>
            {IS_TESTNET ? 'TEST MODE' : 'MAINNET'}
          </button>
          {IS_TESTNET && <button onClick={() => window.dispatchEvent(new Event(TOUR_EVENT))} className="chrome-btn" title="Show me around" aria-label="Show me around" style={{ width: 34, height: 34, borderRadius: 17, border: 0, background: 'transparent', color: '#2F4A3B', font: 'italic 18px var(--font-display)', cursor: 'pointer' }}>?</button>}
          <button onClick={() => openTxHistoryModal()} className="chrome-btn" style={{ height: 34, padding: '0 14px', borderRadius: 17, border: 0, background: 'transparent', color: '#2F4A3B', fontSize: 13, cursor: 'pointer' }}>History</button>
          <button onClick={() => { void endWalletSession(); logout(); }} className="chrome-btn" style={{ height: 34, padding: '0 14px', borderRadius: 17, border: 0, background: 'transparent', color: '#5E6058', fontSize: 13, cursor: 'pointer' }}>Sign out</button>
        </div>
      </header>

      {(IS_TESTNET || MAINNET_LIVE) && noticeOpen && (
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 1120, margin: '20px auto 0', padding: '0 48px' }} className="chrome-pad">
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', padding: '12px 18px', border: `1px solid ${IS_TESTNET ? '#4F7A5C' : '#2F4A3B'}`, borderRadius: 16, background: '#FBF8F2', font: '13px/1.5 var(--font-body)', color: '#5E6058', maxWidth: 640 }}>
            <span style={{ flex: 1 }}>
              {IS_TESTNET
                ? <><strong style={{ color: '#2F4A3B', fontWeight: 500 }}>Test version.</strong> Nothing here moves real money; bank steps are simulated, the Stellar bridge is a labelled simulator, and BOB payouts are mocked (Pollar runs them on mainnet).</>
                : <><strong style={{ color: '#2F4A3B', fontWeight: 500 }}>Live on mainnet.</strong> Real money. Sends to Nigeria go over LI.FI / Circle CCTP (2 USDC minimum, two signatures) and pay out through Weave. Naira top-ups and the Bolivian ramp turn on as their providers enable them.</>}
            </span>
            <button onClick={toggleNotice} style={{ border: 0, background: 'transparent', color: '#8A8A80', fontSize: 13, cursor: 'pointer', padding: 0 }}>Hide</button>
          </div>
        </div>
      )}

      <main style={{ position: 'relative', zIndex: 1, maxWidth: 1120, margin: '0 auto', padding: '64px 48px 160px' }} className="chrome-pad">
        {COMING_SOON ? (
          <section className="rise" style={{ minHeight: '50vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 20, maxWidth: 720 }}>
            <div className="mono-eyebrow">Mainnet</div>
            <h1 style={{ font: '400 clamp(48px, 8vw, 96px)/0.95 var(--font-display)', letterSpacing: '-0.025em', color: '#2F4A3B', margin: 0 }}>Coming <span style={{ color: '#4F7A5C', fontStyle: 'italic' }}>soon.</span></h1>
            <p style={{ font: '16px/1.6 var(--font-body)', color: '#5E6058', margin: 0, maxWidth: 520 }}>The live corridor — naira via Weave, the Stellar → Base hop via LI.FI / Circle CCTP, bolivianos via Pollar's Stereum ramp — is being switched on. Flip the switch back to keep using test mode.</p>
            <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
              <Link href="/mainnet" className="cta" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>See what is live on mainnet</Link>
              <button onClick={() => setNetwork('testnet')} style={{ border: 0, background: 'transparent', font: '14px var(--font-body)', color: '#2F4A3B', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>Back to test mode</button>
            </div>
          </section>
        ) : (
          <>
            {back && <Link href={back} style={{ font: '14px var(--font-body)', color: '#8A8A80', textDecoration: 'none' }}>← Back</Link>}
            {children}
          </>
        )}
      </main>
      <style>{`
        .chrome-btn:hover { background: #FBF8F2 !important; color: #2F4A3B !important; }
        @media (max-width: 720px) { .chrome-pad { padding-left: 20px !important; padding-right: 20px !important; } }
      `}</style>
    </div>
  );
}
