'use client';

import type { PollarClient } from '@pollar/core';
import { weave, pollOrder, STELLAR_USDC, NGN } from './weave';
import { usdcIssuer } from './network';
import { createNigeriaSend, executeNigeriaSend, type PollarSigner, type NigeriaRecipient } from './nigeria-send';
import { bestQuote, usdcFromBobOnramp, bobFromUsdcOfframp, startOnRamp, startOffRamp, isKycBlocked, type RampQuote } from './pollar-ramps';

// The conversational dashboard reduces every transfer to (recipient, source,
// amount). This module turns that triple into the concrete sequence of Weave
// orders / Pollar calls, reporting progress as it goes. Seven valid pairs:
//
//   to      \ from   my balance          naira transfer            Bolivian QR
//   NG bank          USDC→₦ (Weave)      —                         BOB→USDC→₦
//   BO bank          USDC→Bs (Pollar)    ₦→USDC→Bs                 —
//   friend           USDC payment        ₦→USDC into their wallet  BOB→USDC into their wallet

export type To = 'ng' | 'bo' | 'fr';
export type From = 'bal' | 'ngn' | 'bob';

export type NgDetails = NigeriaRecipient;
export interface BoDetails { fields: Record<string, string>; quote: RampQuote }
export interface FrDetails { address: string; handle: string | null }
export interface PayerBank { bankCode: string; accountNumber: string; accountName: string }  // refund account for naira transfers

export interface FlowInput {
  to: To; from: From;
  amount: number;                // in the SOURCE currency (USD / NGN / BOB)
  wallet: string;                // the signed-in Pollar wallet
  ng?: NgDetails; bo?: BoDetails; fr?: FrDetails;
  payerBank?: PayerBank;         // required when from === 'ngn'
}

export type FlowEvent =
  | { kind: 'stage'; label: string }
  | { kind: 'bank_details'; bank: { institution: string; accountIdentifier: string; accountName: string; amountToTransfer: string } }
  | { kind: 'qr'; ramp: Awaited<ReturnType<typeof startOnRamp>>; bob: number; resolvePaid: () => void }
  | { kind: 'kyc'; url: string }
  | { kind: 'tx'; hash: string }
  | { kind: 'order'; order: any };

export interface FlowResult { headline: string; detail: string; hash?: string | null; mocked?: boolean }

export async function runFlow(input: FlowInput, client: PollarClient, signer: PollarSigner, emit: (e: FlowEvent) => void): Promise<FlowResult> {
  const { to, from, amount, wallet } = input;

  // ── helpers ──────────────────────────────────────────────────────────────
  const usdcBalance = async () => { const { balances } = await client.getWalletBalance(wallet); return Number((balances as any[]).find(b => b.code === 'USDC' || b.asset === 'USDC')?.balance ?? 0); };
  const waitForUsdc = async (before: number, target: number) => {
    let landed = before;
    for (let i = 0; i < 40; i++) { landed = await usdcBalance(); if (landed - before >= target * 0.97) break; await new Promise(r => setTimeout(r, 6000)); }
    return Math.floor((landed - before) * 100) / 100;
  };
  // Nigerian payout from `usd` USDC in the signed-in wallet (Weave plans + Pollar signs).
  const payoutNigeria = async (usd: number, ng: NgDetails) => {
    emit({ kind: 'stage', label: 'Opening the naira payout' });
    const created = await createNigeriaSend(wallet, usd, ng);
    emit({ kind: 'order', order: created.order });
    const { order, hash } = await executeNigeriaSend(created, signer, (s, d) => {
      emit({ kind: 'stage', label: s === 'pay' ? 'Paying from your wallet (sponsored)' : s === 'approve' ? 'Sign 1 of 2 — allow USDC to move' : s === 'bridge' ? 'Sign 2 of 2 — bridge' : s === 'submitting' ? 'Submitting' : 'Bridging to the payout' });
      if (s === 'done' && d) emit({ kind: 'tx', hash: d });
    }, (o) => emit({ kind: 'order', order: o }));
    if (order.status !== 'completed') throw new Error(order.status === 'refunded' ? 'The transfer was refunded to your wallet.' : 'The naira payout could not be completed.');
    return { order, hash };
  };
  // Naira bank transfer into `dest` wallet (Weave deposit order); resolves when USDC lands.
  const depositNaira = async (ngn: number, dest: string) => {
    if (!input.payerBank) throw new Error('Tell us which bank you will pay from (for refunds).');
    emit({ kind: 'stage', label: 'Getting your transfer details' });
    const r = await weave('orders', { body: {
      source: { inline: { kind: 'bank_account', assetKey: NGN, bankInstitution: input.payerBank.bankCode, bankAccountIdentifier: input.payerBank.accountNumber, bankAccountName: input.payerBank.accountName } },
      dest:   { inline: { kind: 'crypto_wallet', assetKey: STELLAR_USDC, walletAddress: dest } },
      amount: ngn, amountIn: 'source',
    } });
    if (!r.ok) throw new Error(r.error || 'Could not start the deposit');
    emit({ kind: 'order', order: r.data.order });
    if (r.data.nextAction?.bankDetails) emit({ kind: 'bank_details', bank: r.data.nextAction.bankDetails });
    emit({ kind: 'stage', label: 'Waiting for your bank transfer' });
    const final = r.data.order.status === 'completed' ? r.data.order : await pollOrder(r.data.order.id, (o) => emit({ kind: 'order', order: o }));
    if (final.status !== 'completed') throw new Error('The deposit could not be completed.');
    return final;
  };
  // BOB on-ramp into `dest` wallet (Pollar; mocked on testnet). `bob` is what
  // the user pays; the USDC that lands is the quote's net amount.
  const onrampBob = async (bob: number, dest: string) => {
    const { usdc, quote } = await usdcFromBobOnramp(client, bob);
    const before = await usdcBalance();
    emit({ kind: 'stage', label: 'Opening your BOB deposit' });
    const ramp = await startOnRamp(client, quote, bob, dest, usdc);
    if (isKycBlocked(ramp)) { emit({ kind: 'kyc', url: ramp.kycUrl! }); throw new Error('Pollar needs a quick identity check before Bolivian ramps. Complete it and try again.'); }
    if (ramp.mocked) {
      await new Promise<void>(res => emit({ kind: 'qr', ramp, bob, resolvePaid: res }));
      emit({ kind: 'stage', label: 'Simulating the BOB settlement (testnet)' });
      await ramp.settleMock!();
    } else {
      emit({ kind: 'qr', ramp, bob, resolvePaid: () => {} });
      emit({ kind: 'stage', label: 'Waiting for your BOB payment' });
      await client.pollRampTransaction(ramp.txId, { intervalMs: 12000, timeoutMs: 45 * 60_000 });
    }
    emit({ kind: 'stage', label: 'Waiting for USDC to land in the wallet' });
    return { usdc, landed: dest === wallet ? await waitForUsdc(before, usdc) : usdc };
  };
  // BOB off-ramp from the signed-in wallet (Pollar; mocked on testnet).
  const offrampBob = async (bob: number, bo: BoDetails) => {
    emit({ kind: 'stage', label: 'Sending bolivianos to your bank' });
    const q = await bestQuote(client, 'offramp', bob);
    const out = await startOffRamp(client, q, bob, wallet, bo.fields);
    if (out.kycUrl) { emit({ kind: 'kyc', url: out.kycUrl }); throw new Error('Pollar needs a quick identity check before paying out. Complete it and try again; the USDC stays in your wallet.'); }
    return out;
  };

  // ── the seven pairs ──────────────────────────────────────────────────────
  if (to === 'ng') {
    if (!input.ng) throw new Error('Add the recipient bank account.');
    if (from === 'bal') {
      const { order, hash } = await payoutNigeria(amount, input.ng);
      return { headline: 'Naira delivered', detail: `₦${Math.round(order.destAmount).toLocaleString()} to ${input.ng.accountName} · ${input.ng.bankName}`, hash };
    }
    if (from === 'bob') {
      const { usdc, landed } = await onrampBob(amount, wallet);
      if (landed <= 0) throw new Error('The USDC from your BOB payment has not arrived yet.');
      const { order, hash } = await payoutNigeria(Math.min(landed, usdc), input.ng);
      return { headline: 'Naira delivered', detail: `Bs ${amount.toFixed(2)} → ₦${Math.round(order.destAmount).toLocaleString()} to ${input.ng.accountName}`, hash, mocked: true };
    }
  }
  if (to === 'bo') {
    if (!input.bo) throw new Error('Add the Bolivian bank details.');
    if (from === 'bal') {
      const { bob } = await bobFromUsdcOfframp(client, amount);
      const out = await offrampBob(bob, input.bo);
      return { headline: 'Bolivianos on the way', detail: `Bs ${bob.toFixed(2)} → ${input.bo.fields.bank ?? 'your bank'} ····${(input.bo.fields.account ?? '').slice(-4)}`, mocked: !!out.mocked };
    }
    if (from === 'ngn') {
      const before = await usdcBalance();
      const dep = await depositNaira(amount, wallet);
      const landed = await waitForUsdc(before, Number(dep.destAmount));
      if (!(landed > 0)) throw new Error('The naira deposit completed but no USDC has reached your wallet yet — nothing was paid out. Try the Bolivian payout again in a minute.');
      const { bob } = await bobFromUsdcOfframp(client, landed);
      const out = await offrampBob(bob, input.bo);
      return { headline: 'Bolivianos on the way', detail: `₦${amount.toLocaleString()} → Bs ${bob.toFixed(2)} to your bank`, mocked: !!out.mocked };
    }
  }
  if (to === 'fr') {
    if (!input.fr) throw new Error('Pick who to pay.');
    const dest = input.fr.address;
    const who = input.fr.handle ? `@${input.fr.handle}` : `${dest.slice(0, 6)}…${dest.slice(-6)}`;
    if (from === 'bal') {
      if (dest === wallet) throw new Error("That's your own wallet.");
      emit({ kind: 'stage', label: 'Paying from your wallet (sponsored)' });
      const out = await signer.runTx('payment', { destination: dest, amount: amount.toFixed(7), asset: { type: 'credit_alphanum4', code: 'USDC', issuer: usdcIssuer() } });
      if (out.status === 'error' || !out.hash) throw new Error(out.details || out.message || 'The payment failed');
      emit({ kind: 'tx', hash: out.hash });
      return { headline: 'Sent', detail: `$${amount.toFixed(2)} USDC to ${who} · settled on Stellar`, hash: out.hash };
    }
    if (from === 'ngn') {
      const dep = await depositNaira(amount, dest);
      return { headline: dest === wallet ? 'Money added' : 'Sent', detail: `₦${amount.toLocaleString()} → ${Number(dep.destAmount).toFixed(2)} USDC in ${dest === wallet ? 'your wallet' : who}` };
    }
    if (from === 'bob') {
      const { usdc } = await onrampBob(amount, dest);
      return { headline: dest === wallet ? 'Money added' : 'Sent', detail: `Bs ${amount.toFixed(2)} → ${usdc.toFixed(2)} USDC in ${dest === wallet ? 'your wallet' : who}`, mocked: true };
    }
  }
  throw new Error('That combination is just a local transfer — no corridor needed.');
}
