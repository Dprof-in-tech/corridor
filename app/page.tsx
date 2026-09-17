'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePollar } from '@pollar/react';
import { GoogleButton } from '../components/GoogleButton';

export default function Landing() {
  const { isAuthenticated, login, openLoginModal, getClient } = usePollar();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (isAuthenticated) router.replace('/app'); }, [isAuthenticated, router]);

  // Pollar's OAuth flow finishes in the tab that STARTED it (it polls the
  // session status); the popup tab just gets bounced back to our origin. The
  // session lands in shared same-origin localStorage, so any of our tabs that
  // sees it appear can simply move on to /app.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key && /pollar/i.test(e.key) && e.newValue) window.location.replace('/app');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Pollar reports failures on its auth state machine, not as thrown errors —
  // e.g. ORIGIN_NOT_ALLOWED when this origin isn't in the app's Domains list.
  useEffect(() => getClient().onAuthStateChange((st) => {
    setBusy(!['idle', 'authenticated', 'error', 'entering_email', 'entering_code'].includes(st.step));
    if (st.step === 'error') {
      const code = (st as any).errorCode ? ` (${(st as any).errorCode})` : '';
      setAuthError(`${(st as any).message ?? 'Sign-in failed'}${code}. If you are the developer: add this origin under Build → Domains in the Pollar dashboard.`);
    } else if (st.step !== 'idle') setAuthError(null);
  }), [getClient]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="mx-auto w-full max-w-3xl px-5 py-5 flex items-center gap-2">
        <span className="w-8 h-8 rounded-full bg-forest text-cream flex items-center justify-center font-display font-bold text-sm">W</span>
        <span className="font-display font-semibold text-[17px]">Corridor</span>
        <span className="ml-auto text-[12px] text-ink-faint">Weave × Pollar · Stellar</span>
      </header>
      <main className="mx-auto w-full max-w-3xl px-5 pt-10 pb-16 grid gap-10 md:grid-cols-[1.2fr_1fr] items-start">
        <section className="reveal">
          <div className="inline-flex items-center gap-2 rounded-full border border-hair bg-cream-soft px-3 py-1 text-[12px] text-ink-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-forest" /> Nigeria ↔ Bolivia, live on mainnet
          </div>
          <h1 className="mt-5 font-display text-[40px] leading-[1.05] font-semibold text-ink">
            Naira in Lagos. <br />Bolivianos in La Paz. <br /><span className="text-forest">Minutes, not days.</span>
          </h1>
          <p className="mt-5 text-[16px] leading-relaxed text-ink-muted max-w-md">
            Sign in, get a Stellar wallet, and move money between Nigerian bank accounts and Bolivian ones.
            Pollar runs the Bolivian side; Weave runs the Nigerian side. Nobody in the middle ever holds your money.
          </p>
          <ul className="mt-6 space-y-2 text-[14px] text-ink-soft">
            <li>→ <b>Send to Nigeria</b> — USDC leaves your wallet, naira lands in any Nigerian bank in ~3 minutes.</li>
            <li>→ <b>Add naira</b> — pay by bank transfer, USDC arrives in your wallet.</li>
            <li>→ <b>Cash out in Bolivia</b> — BOB to your bank via Pollar's ramp.</li>
          </ul>
        </section>
        <section className="reveal rounded-3xl border border-hair bg-white/85 backdrop-blur p-6 shadow-[0_20px_60px_-32px_rgba(0,0,0,0.25)]">
          <h2 className="font-display text-[20px] font-semibold">Get started</h2>
          <p className="text-[13px] text-ink-muted mt-1">A Stellar wallet is created for you. No seed phrases.</p>
          <div className="mt-5"><GoogleButton disabled={busy} onClick={() => login({ provider: 'google' })} /></div>
          <div className="my-4 flex items-center gap-3 text-[11px] text-ink-faint"><span className="h-px flex-1 bg-hair" />or email<span className="h-px flex-1 bg-hair" /></div>
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" type="email" className="w-full rounded-2xl border border-hair bg-white px-4 py-3 text-[15px] outline-none focus:border-forest" />
          <button disabled={!/.+@.+\..+/.test(email)} onClick={() => login({ provider: 'email', email })} className={`mt-3 w-full rounded-2xl py-3 text-[14.5px] font-semibold text-cream ${/.+@.+\..+/.test(email) ? 'bg-forest hover:bg-forest-deep' : 'bg-forest/40'}`}>Send me a code</button>
          <button onClick={() => openLoginModal()} className="mt-3 w-full text-[12.5px] text-ink-muted hover:text-ink">More sign-in options (Freighter, xBull…)</button>
          {authError && <p className="mt-4 text-[12.5px] text-terracotta bg-terracotta-soft rounded-xl px-3 py-2">{authError}</p>}
        </section>
      </main>
    </div>
  );
}
