import type { Metadata } from 'next';
import { Inter, Fraunces, Roboto } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'], variable: '--font-body' });
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-display' });
// Google's sign-in button guidelines call for Roboto Medium.
const roboto = Roboto({ subsets: ['latin'], weight: ['500'], variable: '--font-roboto' });

export const metadata: Metadata = {
  title: 'Weave × Pollar — Nigeria ↔ Bolivia',
  description: 'Send money between Nigeria and Bolivia in minutes. Naira in, bolivianos out — or the other way round — on Stellar, non-custodially.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable} ${roboto.variable}`}>
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
