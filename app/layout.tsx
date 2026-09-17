import type { Metadata } from 'next';
import { Instrument_Serif, IBM_Plex_Sans, IBM_Plex_Mono, Roboto } from 'next/font/google';
// Pollar's modals (login, tx history, receive, ramp, KYC…) ship their CSS separately.
import '@pollar/react/styles.css';
import './globals.css';
import './pollar-theme.css';
import { Providers } from './providers';

const instrument = Instrument_Serif({ subsets: ['latin'], weight: '400', style: ['normal', 'italic'], variable: '--font-instrument' });
const plex = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-plex' });
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: '400', variable: '--font-plex-mono' });
// Google's sign-in button guidelines call for Roboto Medium.
const roboto = Roboto({ subsets: ['latin'], weight: ['500'], variable: '--font-roboto' });

export const metadata: Metadata = {
  title: 'Weave × Pollar — Nigeria ↔ Bolivia',
  description: 'Send money between Nigeria and Bolivia in minutes. Naira in, bolivianos out — or the other way round — on Stellar, non-custodially.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${instrument.variable} ${plex.variable} ${plexMono.variable} ${roboto.variable}`}>
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
