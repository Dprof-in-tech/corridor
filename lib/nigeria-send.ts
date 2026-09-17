'use client';

import { weave, pollOrder, STELLAR_USDC, NGN } from './weave';
import { usdcIssuer } from './network';
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
  return { order: res.data.order as any, nextAction: res.data.nextAction as any, amountUsdc };
}

export interface PollarSigner {
  // Mainnet (LI.FI/CCTP): sign Weave-built Soroban XDRs.
  signAndSubmitTx: (xdr: string) => Promise<{ status: string; hash?: string; details?: string; message?: string }>;
  // Sandbox/testnet (simulator) and any deposit-address bridge: a plain USDC payment with memo.
  runTx: (op: 'payment', params: any, options?: any) => Promise<{ status: string; hash?: string; details?: string; message?: string }>;
}

/** Sign (via Pollar) and settle. Resolves with the final order. */
export async function executeNigeriaSend(
  created: { order: any; nextAction: any; amountUsdc: number },
  signer: PollarSigner,
  onStage: (s: Stage | 'quote' | 'pay', hash?: string) => void,
  onOrder: (o: any) => void,
  opts: { standing?: boolean } = {},
): Promise<{ order: any; hash: string | null }> {
  let hash: string | null = null;
  const na = created.nextAction;
  // Never pay what the server says if it is not what the user asked for.
  const asked = created.amountUsdc;
  if (na?.screen === 'collect_crypto' && na.depositAddress) {
    const toPay = Number(na.amount);
    if (!(toPay > 0) || Math.abs(toPay - asked) > 0.0000001 + asked * 0.001) throw new Error(`Refusing to pay: Weave asked for ${toPay} USDC but the order is for ${asked} USDC.`);
    if (!/^G[A-Z2-7]{55}$/.test(String(na.depositAddress))) throw new Error('Refusing to pay: invalid deposit address.');
    // Deposit-address bridge (sandbox simulator today; NEAR Intents on mainnet
    // when quotable): ONE sponsored Stellar payment with the order's memo.
    onStage('pay');
    const out = await signer.runTx('payment',
      { destination: na.depositAddress, amount: Number(na.amount).toFixed(7), asset: { type: 'credit_alphanum4', code: 'USDC', issuer: usdcIssuer() } },
      na.depositMemo ? { memo: { type: 'text', value: String(na.depositMemo).slice(0, 28) } } : undefined,
    );
    if (out.status === 'error' || !out.hash) throw new Error(out.details || out.message || 'Your wallet rejected the payment');
    hash = out.hash; onStage('done', hash);
  } else if (na?.screen === 'sign_stellar_tx' && na.stellarSigning?.fromAddress) {
    if (na.stellarSigning.fromAddress !== created.order?.sourceInstrument?.walletAddress && created.order?.sourceInstrument?.walletAddress) throw new Error('Refusing to sign: the transaction is not from your wallet.');
    const { signAndSubmitTx } = signer;
    const sign = async (xdr: string) => {
      const out = await signAndSubmitTx(xdr);
      if (out.status === 'error' || !out.hash) throw new Error(out.details || out.message || 'Your wallet rejected the transaction');
      return out.hash;
    };
    hash = await runBridge(na.stellarSigning, sign, (s, d) => onStage(s, d), opts);
  } else if (na) {
    throw new Error(`Weave asked for a step this app does not handle (${na.screen ?? 'unknown'}). Nothing was signed.`);
  }
  const final = await pollOrder(created.order.id, onOrder);
  return { order: final, hash };
}
