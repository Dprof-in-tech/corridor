'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// First-run tour. Not a slideshow: it spotlights the real dashboard and walks
// a brand-new user through their first top-up — the steps only advance when
// the person actually does the thing (clicks Add money, fills in their bank,
// types an amount) and end on a ready button. Targets are
// `data-tour="<key>"` elements on the page; the page feeds the tour its state.
//
// Replayable from the "?" in the header (Chrome dispatches `corridor:tour`).

export const TOUR_KEY = 'corridor.tour';           // 'done' once finished/skipped
export const TOUR_EVENT = 'corridor:tour';

export interface TourState { add: boolean; payer: boolean; amount: boolean; ready: boolean; testnet: boolean; balance: number | null }

interface Step {
  target?: string;                       // data-tour key; none = centred card
  eyebrow: string; title: React.ReactNode; body: React.ReactNode;
  advanceWhen?: (s: TourState) => boolean;   // auto-advance once satisfied
  waitLabel?: string;                    // shown instead of "Next" while waiting
  extraBottom?: number;                  // room under the target for popovers (bank typeahead)
}

const INK = '#2F4A3B', ACCENT = '#4F7A5C', CREAM = '#F3EDE0', CARD = '#FBF8F2';
const em = (t: string) => <span style={{ color: ACCENT, fontStyle: 'italic' }}>{t}</span>;

export function Tour({ open, state, onClose }: { open: boolean; state: TourState; onClose: () => void }) {
  const steps: Step[] = [
    { eyebrow: 'Welcome', title: <>A wallet, <em style={{ color: ACCENT }}>done.</em></>,
      body: <>Signing in just created a Stellar wallet for you — no seed phrase, and Pollar pays the network fees. This takes about a minute and ends with money in it. {state.testnet ? 'Everything here is test money.' : ''}</> },
    { target: 'balance', eyebrow: 'Your money', title: <>What you {em('have')}.</>,
      body: <>USDC on Stellar, shown in dollars with what it is worth in naira and bolivianos right now. {(state.balance ?? 0) > 0 ? 'Yours already has a little in it.' : 'Empty for now — let’s fix that.'}</> },
    { target: 'links', eyebrow: 'First top-up', title: <>Start with {em('Add money')}.</>,
      body: <>Add money gives you Nigerian bank details to transfer to; the naira lands here as USDC. Click <b style={{ fontWeight: 500 }}>Add money</b> to begin.</>,
      advanceWhen: (s) => s.add, waitLabel: 'Click Add money' },
    { target: 'from', eyebrow: 'Top-up, step 1', title: <>Which bank you {em('pay from')}.</>,
      body: <>Type your bank, then your account number. We only use this if something ever has to be refunded to you.</>,
      advanceWhen: (s) => s.add && s.payer, waitLabel: 'Fill in your bank', extraBottom: 280 },
    { target: 'amount', eyebrow: 'Top-up, step 2', title: <>How {em('much')}.</>,
      body: <>Type an amount in naira. The line under it is a live quote with fees included — the USDC you will get.</>,
      advanceWhen: (s) => s.add && s.amount, waitLabel: 'Type an amount' },
    { target: 'cta', eyebrow: 'That’s it', title: <>Add when {em('ready')}.</>,
      body: <>You get account details to transfer to{state.testnet ? ' — on testnet the transfer is simulated as received' : ''}, and the balance updates when it lands. Sending works the same way: who, paid with what, how much. Replay this from the <b style={{ fontWeight: 500 }}>?</b> in the header.</> },
  ];

  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [radius, setRadius] = useState(0);   // the target's own corner radius, so the cutout follows its shape
  const step = steps[i];
  const last = i === steps.length - 1;

  useEffect(() => { if (open) setI(0); }, [open]);

  // Track the target's box (scroll it into view first).
  useLayoutEffect(() => {
    if (!open) return;
    const el = step.target ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`) : null;
    if (!el) { setRect(null); return; }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setRadius(parseFloat(getComputedStyle(el).borderRadius) || 0);
    // Re-measure when the target or the page moves: layout changes, scroll
    // (incl. the smooth scrollIntoView above), resize. No per-frame polling.
    const measure = () => setRect(el.getBoundingClientRect());
    measure();
    const ro = new ResizeObserver(measure); ro.observe(el); ro.observe(document.body);
    window.addEventListener('scroll', measure, { passive: true }); window.addEventListener('resize', measure);
    const settle = setInterval(measure, 120); const stop = setTimeout(() => clearInterval(settle), 1200);   // while the smooth scroll runs
    return () => { ro.disconnect(); window.removeEventListener('scroll', measure); window.removeEventListener('resize', measure); clearInterval(settle); clearTimeout(stop); };
  }, [open, i, step.target]);

  // Auto-advance once the person has done the step.
  const satisfied = !!step.advanceWhen && step.advanceWhen(state);
  useEffect(() => {
    if (!open || !satisfied) return;
    const t = setTimeout(() => setI(n => Math.min(n + 1, steps.length - 1)), 700);
    return () => clearTimeout(t);
  }, [open, satisfied, i, steps.length]);

  // Keyboard: Esc skips.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const PAD = 14, R = radius ? radius + PAD : 28;
  const hole = rect ? { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 + (step.extraBottom ?? 0) } : null;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200, vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const narrow = vw < 720;
  // Card placement: under the hole if there is room, else above; centred when no target.
  const CARD_W = Math.min(440, vw - 32), CARD_H = 260;
  let cardStyle: React.CSSProperties;
  if (!hole) cardStyle = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: CARD_W };
  else if (narrow) cardStyle = { left: 16, right: 16, bottom: 16 };
  else {
    const below = hole.top + hole.height + 16, right = hole.left + hole.width + 16;
    if (step.extraBottom && right + CARD_W < vw) cardStyle = { top: Math.max(16, hole.top), left: right, width: CARD_W };   // beside, so the popover stays clear
    else {
      const top = !step.extraBottom && below + CARD_H < vh ? below : Math.max(16, hole.top - CARD_H - 16);
      const left = Math.min(Math.max(16, hole.left), vw - CARD_W - 16);
      cardStyle = { top, left, width: CARD_W };
    }
  }
  const dim = 'rgba(47, 74, 59, 0.42)';
  const panel = (s: React.CSSProperties) => <div style={{ position: 'fixed', pointerEvents: 'auto', ...s }} />;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 900, pointerEvents: 'none' }} aria-live="polite">
      {/* The dim is one element with a rounded cutout (its box-shadow), so the
          corners follow the target. Four transparent panels around the hole
          block clicks everywhere except inside it. */}
      {hole ? (
        <>
          <div style={{ position: 'fixed', ...hole, borderRadius: R, boxShadow: `0 0 0 100vmax ${dim}, 0 0 0 1.5px ${CREAM}, 0 0 0 4px ${ACCENT}55`, pointerEvents: 'none', transition: 'top .25s, left .25s, width .25s, height .25s, border-radius .25s' }} />
          {panel({ top: 0, left: 0, right: 0, height: Math.max(0, hole.top) })}
          {panel({ top: hole.top, left: 0, width: Math.max(0, hole.left), height: hole.height })}
          {panel({ top: hole.top, left: hole.left + hole.width, right: 0, height: hole.height })}
          {panel({ top: hole.top + hole.height, left: 0, right: 0, bottom: 0 })}
        </>
      ) : <div style={{ position: 'fixed', inset: 0, background: dim, pointerEvents: 'auto', backdropFilter: 'blur(4px)' }} />}

      <div className="rise" key={i} style={{ position: 'fixed', pointerEvents: 'auto', background: CARD, borderRadius: 28, padding: '24px 26px 22px', boxShadow: '0 40px 80px -40px rgba(47,74,59,.6)', border: '1px solid #D9D2C2', display: 'flex', flexDirection: 'column', gap: 12, ...cardStyle }}>
        <div className="mono-eyebrow" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>{step.eyebrow}</span><span style={{ color: '#8A8A80' }}>{i + 1} / {steps.length}</span>
        </div>
        <div style={{ font: '400 32px/1.1 var(--font-display)', color: INK, letterSpacing: '-0.01em' }}>{step.title}</div>
        <div style={{ font: '14.5px/1.55 var(--font-body)', color: '#5E6058' }}>{step.body}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 6, flexWrap: 'wrap' }}>
          {step.advanceWhen && !satisfied ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, font: 'italic 18px var(--font-display)', color: ACCENT }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: ACCENT, animation: 'tour-pulse 1.4s ease-in-out infinite' }} />{step.waitLabel}
            </span>
          ) : (
            <button className="cta" onClick={() => last ? onClose() : setI(i + 1)} style={{ height: 44, padding: '0 22px', fontSize: 14 }}>{last ? 'Done' : i === 0 ? 'Show me' : 'Next'}</button>
          )}
          {!last && <button onClick={onClose} style={{ border: 0, background: 'transparent', font: '13px var(--font-body)', color: '#8A8A80', cursor: 'pointer', padding: 0, marginLeft: 'auto' }}>Skip tour</button>}
        </div>
      </div>
      <style>{`@keyframes tour-pulse { 0%,100% { transform: scale(1); opacity: 1 } 50% { transform: scale(1.6); opacity: .5 } }`}</style>
    </div>
  );
}

/** True for a browser that has never finished or skipped the tour. */
export function tourPending(): boolean {
  try { return localStorage.getItem(TOUR_KEY) !== 'done'; } catch { return false; }
}
export function markTourDone() { try { localStorage.setItem(TOUR_KEY, 'done'); } catch {} }
