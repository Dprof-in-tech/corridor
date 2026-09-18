'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// The 5-minute mainnet demo. Never auto-plays: a click opens a modal in our
// palette and the player starts there (user-initiated, so sound is allowed).
// `inline` renders the player in place instead (the /mainnet page).

// NEXT_PUBLIC_DEMO_VIDEO: a YouTube id or URL, a Vimeo URL, or a direct .mp4
// URL. Unset → the link and the section do not render at all.
const SRC = (process.env.NEXT_PUBLIC_DEMO_VIDEO || '').trim();
export const DEMO_VIDEO_SET = SRC.length > 0;

function player(autoplay: boolean): React.ReactNode {
  const yt = SRC.match(/(?:youtu\.be\/|v=|\/embed\/)([\w-]{11})/)?.[1] ?? (/^[\w-]{11}$/.test(SRC) ? SRC : null);
  const vimeo = SRC.match(/vimeo\.com\/(?:video\/)?(\d+)/)?.[1];
  const frame = { position: 'absolute' as const, inset: 0, width: '100%', height: '100%', border: 0 };
  const allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen';
  if (yt) return <iframe src={`https://www.youtube-nocookie.com/embed/${yt}?rel=0&modestbranding=1${autoplay ? '&autoplay=1' : ''}`} title="Corridor — 5-minute mainnet demo" allow={allow} allowFullScreen style={frame} />;
  if (vimeo) return <iframe src={`https://player.vimeo.com/video/${vimeo}?dnt=1${autoplay ? '&autoplay=1' : ''}`} title="Corridor — 5-minute mainnet demo" allow={allow} allowFullScreen style={frame} />;
  return <video src={SRC} controls autoPlay={autoplay} playsInline style={{ ...frame, background: '#000' }} />;
}

export function DemoVideoInline() {
  if (!DEMO_VIDEO_SET) return null;
  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 960, aspectRatio: '16 / 9', borderRadius: 28, overflow: 'hidden', background: '#2F4A3B', boxShadow: '0 40px 80px -40px rgba(47,74,59,.5)' }}>
      {player(false)}
    </div>
  );
}

export function DemoVideoLink({ children = '▶ Watch the 5-minute demo', style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!DEMO_VIDEO_SET) return;
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open]);
  if (!DEMO_VIDEO_SET) return null;
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
