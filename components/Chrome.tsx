'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePollar } from '@pollar/react';
import { Coins, DashboardArches, Logo } from './Brand';
import { IS_TESTNET } from '../lib/weave';

// Authenticated frame per the design handoff "Dashboard v3": coin backdrop,
// fixed arches bottom-right, header with TEST MODE pill / History / Sign out,
// collapsible test notice, 1120px content column.

export function Chrome({ children, back }: { children: React.ReactNode; back?: string }) {
  const { isAuthenticated, logout, openTxHistoryModal, getClient } = usePollar();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(true);

  useEffect(() => { let live = true; getClient().ready().then(() => live && setReady(true)).catch(() => live && setReady(true)); return () => { live = false; }; }, [getClient]);
  useEffect(() => { if (ready && !isAuthenticated) router.replace('/'); }, [ready, isAuthenticated, router]);
  useEffect(() => { try { setNoticeOpen(localStorage.getItem('corridor.notice') !== 'hidden'); } catch {} }, []);
  const toggleNotice = () => setNoticeOpen(v => { try { localStorage.setItem('corridor.notice', v ? 'hidden' : 'shown'); } catch {} return !v; });

  return (
    <div style={{ minHeight: '100vh', background: '#F3EDE0', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}><Coins variant="dashboard" /></div>
      <DashboardArches />

      <header style={{ position: 'relative', zIndex: 1, maxWidth: 1120, margin: '0 auto', padding: '28px 48px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }} className="chrome-pad">
        <Link href="/app" style={{ textDecoration: 'none' }}><Logo /></Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#F3EDE0', borderRadius: 20, padding: 3 }}>
          {IS_TESTNET && (
            <button onClick={toggleNotice} className="chrome-btn" style={{ display: 'flex', alignItems: 'center', gap: 8, height: 34, padding: '0 14px', borderRadius: 17, border: '1px solid #4F7A5C', background: '#F3EDE0', color: '#2F4A3B', font: '12px var(--font-mono)', letterSpacing: '.06em', cursor: 'pointer' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#4F7A5C' }} />TEST MODE
            </button>
          )}
          <button onClick={() => openTxHistoryModal()} className="chrome-btn" style={{ height: 34, padding: '0 14px', borderRadius: 17, border: 0, background: 'transparent', color: '#2F4A3B', fontSize: 13, cursor: 'pointer' }}>History</button>
          <button onClick={() => logout()} className="chrome-btn" style={{ height: 34, padding: '0 14px', borderRadius: 17, border: 0, background: 'transparent', color: '#5E6058', fontSize: 13, cursor: 'pointer' }}>Sign out</button>
        </div>
      </header>

      {IS_TESTNET && noticeOpen && (
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 1120, margin: '20px auto 0', padding: '0 48px' }} className="chrome-pad">
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', padding: '12px 18px', border: '1px solid #4F7A5C', borderRadius: 16, background: '#FBF8F2', font: '13px/1.5 var(--font-body)', color: '#5E6058', maxWidth: 640 }}>
            <span style={{ flex: 1 }}><strong style={{ color: '#2F4A3B', fontWeight: 500 }}>Test version.</strong> Nothing here moves real money; bank steps are simulated, the Stellar bridge is a labelled simulator, and BOB payouts are mocked (Pollar runs them on mainnet).</span>
            <button onClick={toggleNotice} style={{ border: 0, background: 'transparent', color: '#8A8A80', fontSize: 13, cursor: 'pointer', padding: 0 }}>Hide</button>
          </div>
        </div>
      )}

      <main style={{ position: 'relative', zIndex: 1, maxWidth: 1120, margin: '0 auto', padding: '64px 48px 160px' }} className="chrome-pad">
        {back && <Link href={back} style={{ font: '14px var(--font-body)', color: '#8A8A80', textDecoration: 'none' }}>← Back</Link>}
        {children}
      </main>
      <style>{`
        .chrome-btn:hover { background: #FBF8F2 !important; color: #2F4A3B !important; }
        @media (max-width: 720px) { .chrome-pad { padding-left: 20px !important; padding-right: 20px !important; } }
      `}</style>
    </div>
  );
}
