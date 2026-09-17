'use client';

import { useEffect, useState } from 'react';

// OAuth landing for the Pollar popup. Pollar's server has already exchanged
// the Google code by the time the popup arrives here; the ORIGINAL tab's SDK
// finishes login by polling the session status. So this page has one job:
// tell the user it worked and get out of the way.
export default function OAuthCallback() {
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => { try { window.close(); } catch {} setClosed(true); }, 1200);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="rounded-3xl border border-hair bg-white/85 p-8 text-center max-w-sm">
        <div className="mx-auto w-12 h-12 rounded-full bg-forest-mist text-forest-deep flex items-center justify-center text-xl">✓</div>
        <h1 className="mt-3 font-display text-[20px] font-semibold">Signed in</h1>
        <p className="mt-1 text-[14px] text-ink-muted">{closed ? 'You can close this window and return to Corridor.' : 'Returning you to Corridor…'}</p>
      </div>
    </div>
  );
}
