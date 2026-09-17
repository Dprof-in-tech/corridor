'use client';

import { weave, pollOrder, STELLAR_USDC, NGN, POLLAR_NETWORK, USDC_ISSUER } from './weave';
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

export interface PollarSigner {
  // Mainnet (LI.FI/CCTP): sign Weave-built Soroban XDRs.
  signAndSubmitTx: (xdr: string) => Promise<{ status: string; hash?: string; details?: string; message?: string }>;
  // Sandbox/testnet (simulator) and any deposit-address bridge: a plain USDC payment with memo.
  runTx: (op: 'payment', params: any, options?: any) => Promise<{ status: string; hash?: string; details?: string; message?: string }>;
}

/** Sign (via Pollar) and settle. Resolves with the final order. */
export async function executeNigeriaSend(
  created: { order: any; nextAction: any },
  signer: PollarSigner,
  onStage: (s: Stage | 'quote' | 'pay', hash?: string) => void,
  onOrder: (o: any) => void,
  opts: { standing?: boolean } = {},
): Promise<{ order: any; hash: string | null }> {
  let hash: string | null = null;
  const na = created.nextAction;
  if (na?.screen === 'collect_crypto' && na.depositAddress) {
    // Deposit-address bridge (sandbox simulator today; NEAR Intents on mainnet
    // when quotable): ONE sponsored Stellar payment with the order's memo.
    onStage('pay');
    const out = await signer.runTx('payment',
      { destination: na.depositAddress, amount: Number(na.amount).toFixed(7), asset: { type: 'credit_alphanum4', code: 'USDC', issuer: USDC_ISSUER[POLLAR_NETWORK] } },
      na.depositMemo ? { memo: { type: 'text', value: String(na.depositMemo).slice(0, 28) } } : undefined,
    );
    if (out.status === 'error' || !out.hash) throw new Error(out.details || out.message || 'Your wallet rejected the payment');
    hash = out.hash; onStage('done', hash);
  } else if (na?.screen === 'sign_stellar_tx') {
    const { signAndSubmitTx } = signer;
    const sign = async (xdr: string) => {
      const out = await signAndSubmitTx(xdr);
      if (out.status === 'error' || !out.hash) throw new Error(out.details || out.message || 'Your wallet rejected the transaction');
      return out.hash;
    };
    hash = await runBridge(na.stellarSigning, sign, (s, d) => onStage(s, d), opts);
  }
  const final = await pollOrder(created.order.id, onOrder);
  return { order: final, hash };
}
