'use client';

import { weave, pollOrder, STELLAR_USDC, NGN } from './weave';
import { runBridge, type Stage } from './stellar-bridge';

// The reusable "USDC in a Pollar wallet → naira in a Nigerian bank" primitive.
// Used by Send-to-Nigeria and by the chained Bolivia → Nigeria flow.

export interface NigeriaRecipient { bankCode: string; bankName: string; accountNumber: string; accountName: string }

export async function createNigeriaSend(walletAddress: string, amountUsdc: number, r: NigeriaRecipient) {
  const res = await weave('orders', { body: {
    source: { inline: { kind: 'crypto_wallet', assetKey: STELLAR_USDC, walletAddress } },
    dest:   { inline: { kind: 'bank_account', assetKey: NGN, bankInstitution: r.bankCode, bankAccountIdentifier: r.accountNumber, bankAccountName: r.accountName } },
    amount: amountUsdc, amountIn: 'source', refundAddress: walletAddress,
  } });
  if (!res.ok) throw new Error(res.error || 'Could not start the transfer');
  return { order: res.data.order as any, nextAction: res.data.nextAction as any };
}

/** Sign (via Pollar) and settle. Resolves with the final order. */
export async function executeNigeriaSend(
  created: { order: any; nextAction: any },
  signAndSubmitTx: (xdr: string) => Promise<{ status: string; hash?: string; details?: string; message?: string }>,
  onStage: (s: Stage | 'quote', hash?: string) => void,
  onOrder: (o: any) => void,
  opts: { standing?: boolean } = {},
): Promise<{ order: any; hash: string | null }> {
  let hash: string | null = null;
  if (created.nextAction?.screen === 'sign_stellar_tx') {
    const sign = async (xdr: string) => {
      const out = await signAndSubmitTx(xdr);
      if (out.status === 'error' || !out.hash) throw new Error(out.details || out.message || 'Your wallet rejected the transaction');
      return out.hash;
    };
    hash = await runBridge(created.nextAction.stellarSigning, sign, (s, d) => onStage(s, d), opts);
  }
  const final = await pollOrder(created.order.id, onOrder);
  return { order: final, hash };
}
