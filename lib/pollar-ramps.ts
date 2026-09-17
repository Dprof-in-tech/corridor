'use client';

import type { PollarClient } from '@pollar/core';

// Thin helpers over Pollar's ramps API for the Bolivian (BOB) leg.
// Quotes live 15 min; Pollar re-quotes the provider at execution, so we never
// count down providerExpiresAt. Amount quirks per Pollar's docs: read
// `cryptoAmount` (off-ramp debit) and `fiatAmount` (what really settles) rather
// than dividing by `rate`.

export const BO = { country: 'BO', currency: 'BOB' } as const;

export type RampQuote = Awaited<ReturnType<PollarClient['getRampsQuote']>>['quotes'][number] & {
  fiatAmount?: number | null; cryptoAmount?: number | null; availableAmount?: number | null; expiresAt?: string;
};

export async function bestQuote(client: PollarClient, direction: 'onramp' | 'offramp', amountFiat: number): Promise<RampQuote> {
  const { quotes } = await client.getRampsQuote({ ...BO, direction, amount: amountFiat });
  const q = (quotes as RampQuote[]).find(x => x.recommended) ?? (quotes as RampQuote[])[0];
  if (!q) throw new Error(
    'No Bolivian ramp is enabled for this Pollar app. Enable Stereum (BOB · QR in / ACH out) under Integrations → Ramps on a mainnet app — the Pollar team can switch it on.',
  );
  return q;
}

/** BOB the user must pay to end up with ~`usdc` in the wallet (on-ramp), via the live rate. */
export async function bobForUsdc(client: PollarClient, usdc: number): Promise<{ bob: number; quote: RampQuote }> {
  const probe = await bestQuote(client, 'onramp', 100);
  // rate = BOB per USDC on Stereum; fee is on top in feeCurrency.
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
