// Real mainnet transactions the corridor has already done. Each one is shown
// on /mainnet with its on-chain record fetched live from Horizon, so a judge
// can check the hash rather than take our word for it. Append new proofs here.

export interface Proof {
  id: string;
  title: string;
  when: string;                 // ISO, UTC
  from: string; to: string;     // plain-language ends
  amountIn: string; amountOut: string;
  elapsed: string;              // from the last signature to money in the bank
  stellarTx: string;            // hash on Stellar mainnet
  baseTx?: string;              // hash on Base (CCTP mint side)
  weaveOrder?: string;
  notes: string[];
}

export const PROOFS: Proof[] = [
  {
    id: 'proof-1',
    title: 'Stellar USDC → Nigerian bank',
    when: '2026-09-17T01:29:36Z',
    from: 'A personal Stellar wallet (Freighter-class, signed through Stellar Wallets Kit on the SEP-24 withdraw page)',
    to: 'A PalmPay account in Nigeria',
    amountIn: '2 USDC', amountOut: '₦2,698.94',
    elapsed: '1 min 23 s',
    stellarTx: '3b04306949879f24384c0b2ccc50c1209a121cb531a5b238e372818f0c8a5b48',
    baseTx: '0x2eed4f577d75c19f028f86d770ff1d15e634453b8cd4359ee706245cb89dc701',
    weaveOrder: '64ec9474-5c54-4136-afce-35974990a213',
    notes: [
      'The payer signed twice: a Soroban allowance for Circle\'s CCTP TokenMessenger, then LI.FI\'s bridge call. Weave never held the funds.',
      'CCTP burned 2 USDC on Stellar and minted 1.995 USDC on Base straight to Paycrest\'s receive address.',
      'Paycrest paid ₦2,698.94 to PalmPay at 01:31:06 UTC. Weave fees: $0.017 + $0.005.',
    ],
  },
];

export const STELLAR_EXPERT_TX = (h: string) => `https://stellar.expert/explorer/public/tx/${h}`;
export const BASESCAN_TX = (h: string) => `https://basescan.org/tx/${h}`;
export const HORIZON_TX = (h: string) => `https://horizon.stellar.org/transactions/${h}`;
