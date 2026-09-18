'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// The 5-minute mainnet demo. Never auto-plays: a click opens a modal in our
// palette and the player starts there (user-initiated, so sound is allowed).
// `inline` renders the player in place instead (the /mainnet page).

const VIMEO_ID = '1227946467';   // "Corridor by Weave", 4:58, mainnet
const allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen';
const player = (autoplay: boolean) => (
  <iframe src={`https://player.vimeo.com/video/${VIMEO_ID}?dnt=1&title=0&byline=0&portrait=0${autoplay ? '&autoplay=1' : ''}`} title="Corridor — 5-minute mainnet demo" allow={allow} allowFullScreen style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }} />
);

export function DemoVideoInline() {
  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 960, aspectRatio: '16 / 9', borderRadius: 28, overflow: 'hidden', background: '#2F4A3B', boxShadow: '0 40px 80px -40px rgba(47,74,59,.5)' }}>
      {player(false)}
    </div>
  );
}

export function DemoVideoLink({ children = '▶ Watch the 5-minute demo', style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open]);
  return (
    <>
      <button onClick={() => setOpen(true)} style={{ border: 0, background: 'transparent', padding: 0, font: 'italic 16px var(--font-display)', color: '#2F4A3B', borderBottom: '1px solid #2F4A3B', cursor: 'pointer', width: 'fit-content', ...style }}>{children}</button>
      {open && createPortal(
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 950, background: 'rgba(47,74,59,.55)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} className="rise" style={{ width: 'min(1100px, 100%)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', color: '#F3EDE0' }}>
              <span style={{ font: '400 24px var(--font-display)' }}>Corridor on mainnet — <span style={{ fontStyle: 'italic', color: '#B8C7BA' }}>five minutes</span></span>
              <button onClick={() => setOpen(false)} style={{ border: 0, background: 'transparent', color: '#D9D2C2', font: '14px var(--font-body)', cursor: 'pointer' }}>Close ✕</button>
            </div>
            <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', borderRadius: 24, overflow: 'hidden', background: '#000' }}>
              {player(true)}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
