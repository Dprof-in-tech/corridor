'use client';

import { Chrome } from './Chrome';

// Sub-page frame: the dashboard Chrome plus a serif title. The class exports
// keep the remaining form pages on the handoff palette.
export function Shell({ children, title, back }: { children: React.ReactNode; title?: string; back?: string }) {
  return (
    <Chrome back={back}>
      {title && <h1 style={{ font: '400 44px/1.15 var(--font-display)', color: '#2F4A3B', margin: '16px 0 28px', letterSpacing: '-0.01em' }}>{title}</h1>}
      <div style={{ maxWidth: 640 }}>{children}</div>
    </Chrome>
  );
}

export const card = 'rounded-3xl border border-hair bg-cream-soft p-6 shadow-[0_30px_60px_-30px_rgba(47,74,59,0.35)]';
export const input = 'field w-full px-4 py-3 text-[15px] text-ink';
export const label = 'block text-[11px] font-mono uppercase tracking-[0.08em] text-ink-faint mb-2';
export const primary = (on: boolean) => `w-full rounded-full py-3.5 text-[15px] text-cream transition ${on ? 'bg-ink hover:bg-forest' : 'bg-sage cursor-not-allowed'}`;
