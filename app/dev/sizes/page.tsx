'use client';

import { notFound } from 'next/navigation';

import { useEffect, useState } from 'react';

// Dev-only responsive harness: the landing (or any path) rendered in iframes
// at real viewport sizes, scaled to fit. vw/vh/media queries resolve against
// each iframe, so this is what a user at that size actually sees.
const SIZES: Array<[string, number, number]> = [
  ['Desktop 1440×900', 1440, 900], ['Laptop 1280×800', 1280, 800], ['Wide 1920×1080', 1920, 1080],
  ['Portrait monitor 1080×1400', 1080, 1400], ['Tablet 1024×768', 1024, 768], ['Phone 390×844', 390, 844],
];

export default function Sizes() {
  if (process.env.NODE_ENV === 'production') notFound();   // dev-only harness
  const [path, setPath] = useState('/?preview=1');
  const [vw, setVw] = useState(1200);
  useEffect(() => { const f = () => setVw(window.innerWidth); f(); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  return (
    <div style={{ padding: 24, background: '#E9E2D2', minHeight: '100vh', fontFamily: 'var(--font-body)' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20 }}>
        <b>Responsive harness</b>
        <input value={path} onChange={e => setPath(e.target.value)} style={{ padding: '6px 10px', border: '1px solid #D9D2C2', borderRadius: 8, width: 320 }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        {SIZES.map(([label, w, h]) => {
          const scale = Math.min(1, (Math.min(vw, 1500) - 48) / w, 520 / h);
          return (
            <div key={label}>
              <div style={{ fontSize: 12, color: '#5E6058', marginBottom: 6 }}>{label} · scale {scale.toFixed(2)}</div>
              <div style={{ width: w * scale, height: h * scale, overflow: 'hidden', border: '1px solid #D9D2C2', background: '#fff' }}>
                <iframe src={path} width={w} height={h} style={{ transform: `scale(${scale})`, transformOrigin: 'top left', border: 0 }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
