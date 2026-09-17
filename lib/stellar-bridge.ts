'use client';

import { weave, type ApiResult } from './weave';

// The LI.FI Stellar leg from the payer's POLLAR wallet: approve → bridge →
// report, with Pollar doing the signing (custodial: server-side; external
// wallet: in-extension). Mirrors dashboard/app/lib/stellar-signing.ts.

export interface StellarSigning {
  fromAddress: string; amount: number; approveXdr: string | null;
  approveTxPath: string; bridgeTxPath: string; submittedPath: string; estimatedSecs: number; tool: string;
}
export type Stage = 'approve' | 'bridge' | 'submitting' | 'done';

export async function runBridge(
  ss: StellarSigning,
  signAndSubmit: (unsignedXdr: string) => Promise<string>,
  onStage: (s: Stage, detail?: string) => void,
  opts: { standing?: boolean } = {},
) {
  // `standing` swaps the exact-amount approve for a bounded standing allowance
  // (~1,000 USDC / ~30 days to Circle's TokenMessenger) so later sends need
  // one signature. Weave answers null when the allowance already suffices.
  // The XDR decoder pulls in the Stellar SDK; only the mainnet path needs it.
  const { assertExpectedTx } = await import('./xdr-guard');
  let approveXdr = opts.standing ? null : ss.approveXdr;
  if (!approveXdr) {
    const r: ApiResult = await weave(ss.approveTxPath, { method: 'POST', body: { standing: !!opts.standing } });
    if (!r.ok) throw new Error(r.error || 'Could not build the approval');
    approveXdr = r.data?.unsignedXdr ?? null;
  }
  if (approveXdr) { assertExpectedTx(approveXdr, { kind: 'approve', from: ss.fromAddress }); onStage('approve'); await signAndSubmit(approveXdr); }

  onStage('bridge');
  let bridgeXdr: string | null = null;
  for (let i = 0; i < 12 && !bridgeXdr; i++) {
    const r: ApiResult = await weave(ss.bridgeTxPath, { method: 'POST' });
    if (r.ok) bridgeXdr = r.data.unsignedXdr;
    else if (r.status === 409) await new Promise(res => setTimeout(res, 4000));
    else throw new Error(r.error || 'Could not build the bridge transaction');
  }
  if (!bridgeXdr) throw new Error('Approval not confirmed yet — please try again.');
  assertExpectedTx(bridgeXdr, { kind: 'bridge', from: ss.fromAddress });
  const hash = await signAndSubmit(bridgeXdr);
  onStage('submitting', hash);
  const rep = await weave(ss.submittedPath, { method: 'POST', body: { txHash: hash } });
  if (!rep.ok) throw new Error(rep.error || 'Could not record the bridge transaction');
  onStage('done', hash);
  return hash;
}
