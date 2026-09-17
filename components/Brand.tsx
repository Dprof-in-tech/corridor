'use client';

import { useEffect, useState } from 'react';

// Corridor brand motif, per the design handoff: animated coins riding dotted
// guide paths, "arch" shapes (top-rounded rectangles), and the landing crescent.

const INK = '#2F4A3B', ACCENT = '#4F7A5C', SAGE = '#B8C7BA', CREAM = '#F3EDE0';

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-[14px]">
      <span style={{ width: size, height: size, borderRadius: '50%', background: INK, color: CREAM, font: `italic ${Math.round(size * 0.53)}px var(--font-display)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>w</span>
      <span style={{ font: '22px var(--font-display)', color: INK }}>Corridor</span>
    </span>
  );
}

type CoinSpec = { path: string; glyph: string; dur: number; begin: number };

function Coin({ path, glyph, dur, begin }: CoinSpec) {
  return (
    <g>
      <circle r={14} fill={ACCENT} />
      <circle r={10} fill="none" stroke={CREAM} strokeWidth={1.2} />
      <text y={4.5} fontFamily="var(--font-display), Instrument Serif, serif" fontSize={13} fill={CREAM} textAnchor="middle">{glyph}</text>
      <animateMotion dur={`${dur}s`} begin={`${begin}s`} repeatCount="indefinite" path={path} calcMode="spline" keyPoints="0;1" keyTimes="0;1" keySplines="0.45 0 0.55 1" />
    </g>
  );
}

const LANDING: CoinSpec[] = [
  { path: 'M 179 560 C 179 380, 460 380, 700 400 S 980 400, 1080 140', glyph: '₦', dur: 12, begin: 0 },
  { path: 'M 445 640 C 445 460, 640 470, 800 450 S 1000 420, 1120 200', glyph: '$', dur: 13.5, begin: 1.7 },
  { path: 'M 179 560 C 260 300, 560 320, 760 360 S 1000 360, 1040 90', glyph: 'Bs', dur: 15, begin: 3.1 },
];
const DASHBOARD: CoinSpec[] = [
  { path: 'M 1120 760 C 1000 560, 760 520, 520 560 S 140 640, 60 460', glyph: 'Bs', dur: 14, begin: 0 },
  { path: 'M 1000 820 C 900 660, 660 640, 420 690 S 120 760, 40 620', glyph: '₦', dur: 17, begin: 2.5 },
];

/**
 * Board scale for the landing. The design is a 1200×900 board; on wider
 * screens widths scale up (kx); heights follow the viewport height (ky) —
 * arches grow on tall screens and shrink on short ones, and the coin paths
 * are stretched the same way so the coins still start inside the arches
 * exactly as drawn.
 */
export function useBoardScale(): { kx: number; ky: number } {
  const [k, setK] = useState({ kx: 1, ky: 1 });
  useEffect(() => {
    // Widths follow the viewport width (never below the design), heights follow
    // the viewport height in both directions — a short landscape window gets
    // shorter arches, a tall portrait one gets taller arches.
    const calc = () => setK({ kx: Math.max(1, window.innerWidth / 1200), ky: Math.max(0.6, window.innerHeight / 900) });
    calc(); window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);
  return k;
}

// Scale every (x y) pair of an SVG path string.
function scalePath(d: string, kx: number, ky: number): string {
  let i = 0;
  return d.replace(/-?\d+(?:\.\d+)?/g, (n) => { const v = Number(n) * (i++ % 2 === 0 ? kx : ky); return String(Math.round(v * 100) / 100); });
}

/** Coin backdrop. Landing: 1200×900 board scaled (kx, ky), anchored bottom-left. Dashboard: fills its container, anchored bottom-right. */
export function Coins({ variant, opacity, scale }: { variant: 'landing' | 'dashboard'; opacity?: number; scale?: { kx: number; ky: number } }) {
  const kx = scale?.kx ?? 1, ky = scale?.ky ?? 1;
  const specs = (variant === 'landing' ? LANDING : DASHBOARD).map(c => ({ ...c, path: scalePath(c.path, kx, ky) }));
  const svgProps = variant === 'landing'
    ? { width: 1200 * kx, height: 900 * ky, viewBox: `0 0 ${1200 * kx} ${900 * ky}`, style: { position: 'absolute' as const, left: 0, bottom: 0 } }
    : { width: '100%', height: '100%', viewBox: '0 0 1200 900', preserveAspectRatio: 'xMaxYMax slice' as const, style: {} };
  const { style, ...rest } = svgProps;
  return (
    <svg {...rest} style={{ display: 'block', opacity: opacity ?? (variant === 'landing' ? 0.35 : 0.3), ...style }} aria-hidden="true">
      {specs.map((c, i) => <path key={`p${i}`} d={c.path} fill="none" stroke={SAGE} strokeWidth={1} strokeDasharray="2 9" />)}
      {specs.map((c, i) => <Coin key={`c${i}`} {...c} />)}
    </svg>
  );
}

/** Landing shapes: crescent top-right, two arches bottom-left (widths × kx, heights × ky), baseline. */
export function LandingShapes({ scale }: { scale?: { kx: number; ky: number } }) {
  const kx = scale?.kx ?? 1, ky = scale?.ky ?? 1;
  return (
    <>
      <div aria-hidden style={{ position: 'absolute', right: -120, top: -120, width: 620, height: 620, borderRadius: '50%', background: INK }} />
      <div aria-hidden style={{ position: 'absolute', right: -120, top: -120, width: 620, height: 620, borderRadius: '50%', background: CREAM, transform: 'translate(-110px,110px)' }} />
      <div aria-hidden style={{ position: 'absolute', left: 64 * kx, bottom: 0, width: 230 * kx, height: 420 * ky, background: ACCENT, borderRadius: `${115 * kx}px ${115 * kx}px 0 0` }} />
      <div aria-hidden style={{ position: 'absolute', left: 330 * kx, bottom: 0, width: 230 * kx, height: 300 * ky, background: SAGE, borderRadius: `${115 * kx}px ${115 * kx}px 0 0` }} />
      <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 1, background: INK }} />
    </>
  );
}

/** Dashboard shapes: two fixed arches bottom-right, behind content, non-interactive. */
export function DashboardArches() {
  return (
    <>
      <div aria-hidden style={{ position: 'fixed', right: 160, bottom: -40, width: 200, height: 300, background: ACCENT, borderRadius: '100px 100px 0 0', pointerEvents: 'none', zIndex: 0 }} />
      <div aria-hidden style={{ position: 'fixed', right: 0, bottom: -40, width: 200, height: 200, background: SAGE, borderRadius: '100px 100px 0 0', pointerEvents: 'none', zIndex: 0 }} />
    </>
  );
}
