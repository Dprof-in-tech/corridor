'use client';

import type { PollarClient } from '@pollar/core';
import { weave, IS_TESTNET } from './weave';

// The Bolivian (BOB) leg. On MAINNET this is Pollar's real Stereum ramp
// (QR in, ACH out) and nothing here is ours. On TESTNET Pollar exposes no BOB
// provider, and the Pollar team asked hackathon builds to mock the final BOB
// step — so when Pollar returns no quotes we fall back to `MockBolivia`,
// labelled as such everywhere it surfaces. The mocked on-ramp settles via
// Weave's sandbox faucet (testnet USDC into the wallet); the mocked off-ramp
// is a receipt only.

export const BO = { country: 'BO', currency: 'BOB' } as const;
const MOCK_RATE_BOB_PER_USD = 6.96;   // Bolivia's official peg
const MOCK_FEE_PCT = 0.01;

export type RampQuote = Awaited<ReturnType<PollarClient['getRampsQuote']>>['quotes'][number] & {
  fiatAmount?: number | null; cryptoAmount?: number | null; availableAmount?: number | null; expiresAt?: string; mocked?: boolean;
};

function mockQuote(direction: 'onramp' | 'offramp', amountFiat: number): RampQuote {
  const usdc = amountFiat / MOCK_RATE_BOB_PER_USD;
  return {
    quoteId: `mock-${direction}-${Date.now()}`, provider: 'MockBolivia (Stereum on mainnet)', fee: +(amountFiat * MOCK_FEE_PCT).toFixed(2), feeCurrency: 'BOB',
    rate: MOCK_RATE_BOB_PER_USD, rail: direction === 'onramp' ? 'QR' : 'ACH', protocol: 'REST', estimatedTime: '~2 min', recommended: true,
    requiredFields: direction === 'offramp' ? [
      { key: 'bank', label: 'Bank', type: 'select', options: [{ value: 'BNB', label: 'Banco Nacional de Bolivia' }, { value: 'BCP', label: 'Banco de Crédito BCP' }, { value: 'BISA', label: 'Banco BISA' }, { value: 'MERCANTIL', label: 'Banco Mercantil Santa Cruz' }] },
      { key: 'account', label: 'Account number', type: 'text', bankType: 'ACH', placeholder: '1234567890' },
      { key: 'holder', label: 'Account holder', type: 'text' },
    ] : [],
    minAmount: 10, maxAmount: 50000, fiatAmount: amountFiat, cryptoAmount: direction === 'offramp' ? +(usdc * (1 + MOCK_FEE_PCT)).toFixed(2) : null,
    availableAmount: null, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(), mocked: true,
  } as RampQuote;
}

export async function bestQuote(client: PollarClient, direction: 'onramp' | 'offramp', amountFiat: number): Promise<RampQuote> {
  try {
    const { quotes } = await client.getRampsQuote({ ...BO, direction, amount: amountFiat });
    const q = (quotes as RampQuote[]).find(x => x.recommended) ?? (quotes as RampQuote[])[0];
    if (q) return q;
  } catch { /* fall through to the mock on testnet */ }
  if (IS_TESTNET) return mockQuote(direction, amountFiat);
  throw new Error('No Bolivian ramp is enabled for this Pollar app. Enable Stereum (BOB · QR in / ACH out) under Integrations → Ramps on a mainnet app — the Pollar team can switch it on.');
}

/** BOB the user must pay to end up with ~`usdc` in the wallet (on-ramp). */
export async function bobForUsdc(client: PollarClient, usdc: number): Promise<{ bob: number; quote: RampQuote }> {
  const probe = await bestQuote(client, 'onramp', 100);
  const est = usdc * Number(probe.rate) * 1.01;
  const bob = Math.max(Number(probe.minAmount ?? 0), Math.ceil(est * 100) / 100);
  const quote = await bestQuote(client, 'onramp', bob);
  return { bob, quote };
}

/** USDC that will be debited to pay out `bob` (off-ramp). */
export async function usdcForBob(client: PollarClient, bob: number): Promise<{ usdc: number; quote: RampQuote }> {
  const quote = await bestQuote(client, 'offramp', bob);
  const usdc = quote.cryptoAmount != null ? Number(quote.cryptoAmount) : bob / Number(quote.rate);
  return { usdc, quote };
}

export function isKycBlocked(r: { kycRequired?: boolean; kycUrl?: string }) {
  return !!(r.kycRequired || r.kycUrl);
}

// ── Mock execution (testnet only) ────────────────────────────────────────────

const mockQrSvg = (text: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="224" height="224" viewBox="0 0 224 224"><rect width="224" height="224" fill="#fff"/><g fill="#1C1B17">${Array.from({ length: 14 }, (_, y) => Array.from({ length: 14 }, (_, x) => ((x * 7 + y * 13 + text.length) % 3 === 0 || (x < 3 && y < 3) || (x > 10 && y < 3) || (x < 3 && y > 10)) ? `<rect x="${x * 16}" y="${y * 16}" width="16" height="16"/>` : '').join('')).join('')}</g><rect x="56" y="98" width="112" height="28" fill="#fff"/><text x="112" y="117" font-family="sans-serif" font-size="12" text-anchor="middle" fill="#B8935A">MOCK QR · TESTNET</text></svg>`)}`;

export type OnRampResult = { txId: string; provider: string; status: 'pending' | 'processing' | 'completed' | 'failed'; kycUrl?: string; kycRequired?: boolean; depositInstructions?: any; mocked?: boolean; settleMock?: () => Promise<string> };

/** Real Pollar on-ramp when available; otherwise a mocked QR whose "payment" settles via the sandbox faucet. */
export async function startOnRamp(client: PollarClient, quote: RampQuote, bob: number, walletAddress: string, usdcToLand: number): Promise<OnRampResult> {
  if (!quote.mocked) {
    return client.createOnRamp({ quoteId: quote.quoteId, amount: bob, currency: 'BOB', country: 'BO', walletAddress }) as Promise<OnRampResult>;
  }
  const ref = `MOCK-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  return {
    txId: `mock-onramp-${ref}`, provider: 'MockBolivia', status: 'pending', mocked: true,
    depositInstructions: {
      scannable: { kind: 'opaque', payload: ref, payloadLabel: 'Reference', image: { mediaType: 'image/svg+xml', encoding: 'utf8', data: '', inlineSafe: true, src: mockQrSvg(ref) } },
      fields: [{ key: 'amount', label: 'Amount', value: `Bs ${bob.toFixed(2)}`, type: 'amount', copyable: false }, { key: 'reference', label: 'Reference', value: ref, type: 'code', copyable: true }, { key: 'rail', label: 'Rail', value: 'QR simple (mocked)', type: 'text', copyable: false }],
    },
    // "Stereum settlement": the sandbox faucet drops testnet USDC into the wallet.
    settleMock: async () => {
      const r = await weave('sandbox/stellar-faucet', { body: { to: walletAddress, amount: +usdcToLand.toFixed(2) } });
      if (!r.ok) throw new Error(r.error || 'Mock settlement failed');
      return r.data.txHash as string;
    },
  };
}

export type OffRampResult = { txId: string; provider: string; status: string; kycUrl?: string; mocked?: boolean; receipt?: { bank: string; account: string; holder: string; bob: number } };

/** Real Pollar off-ramp when available; otherwise a mocked payout receipt (per the Pollar team's guidance). */
export async function startOffRamp(client: PollarClient, quote: RampQuote, bob: number, walletAddress: string, fields: Record<string, string>): Promise<OffRampResult> {
  if (!quote.mocked) {
    const bankField = (quote.requiredFields ?? []).find((f: any) => f.bankType);
    return client.createOffRamp({
      quoteId: quote.quoteId, amount: bob, currency: 'BOB', country: 'BO', walletAddress,
      ...(bankField && fields[bankField.key] ? { bankDetails: { type: bankField.bankType as any, value: fields[bankField.key] } } : {}),
      fields,
    }) as Promise<OffRampResult>;
  }
  await new Promise(r => setTimeout(r, 1500));
  return { txId: `mock-offramp-${Date.now()}`, provider: 'MockBolivia', status: 'completed', mocked: true, receipt: { bank: fields.bank ?? '', account: fields.account ?? '', holder: fields.holder ?? '', bob } };
}
