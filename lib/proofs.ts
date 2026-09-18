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
    id: 'proof-3',
    title: 'Naira → Bolivian bank, end to end',
    when: '2026-09-18T01:46:23Z',
    from: 'A Nigerian bank account: ₦5,000 by bank transfer into a Corridor user\'s Pollar wallet (Weave → USDC on Base → NEAR Intents → Stellar)',
    to: 'A Bolivian bank account, by ACH through Pollar\'s Stereum ramp',
    amountIn: '₦5,000', amountOut: '≈ Bs 35',
    elapsed: 'minutes, two hops',
    stellarTx: '6cb4236eee628a0858a0fe91a75024a63eaf157b6ace541a714901923b0cc722',
    notes: [
      'The flagship direction of the corridor, live: naira in from a Nigerian bank, bolivianos out to a Bolivian bank, one wallet in the middle that the user holds.',
      'This transaction is the payout leg — 3.52 USDC from the user\'s Pollar wallet to Stereum (memo PLR…), signed by the embedded wallet.',
      'Both providers were switched on that evening: NEAR Intents\' Stellar pairs and Stereum on the mainnet Pollar app.',
    ],
  },
  {
    id: 'proof-2',
    title: 'Pollar wallet → Nigerian bank, from the app',
    when: '2026-09-18T02:39:43Z',
    from: 'The Pollar embedded wallet inside Corridor (Google sign-in, no seed phrase) — signed on mainnet via signAndSubmitTx',
    to: 'A PalmPay account in Nigeria',
    amountIn: '2 USDC', amountOut: '₦2,700',
    elapsed: 'about 2 minutes',
    stellarTx: 'b968422fc059f8b04ec3b133f307535581c65bc8ba10da926f881c48bc921c52',
    baseTx: '0xcef1b30145d5df56dc06360ad67b69c22b8faf1cebafbe66c8a0ae3f8bc0e731',
    notes: [
      'Two Soroban signatures from the embedded wallet: approve on the USDC contract (tx 182d4ea9…9fae6, spender = Circle\'s CCTP TokenMessenger), then LI.FI\'s bridge call — each XDR checked by the app before signing.',
      'CCTP burned 1.995 USDC on Stellar and minted 1.995 USDC on Base 14 seconds later, straight to Weave\'s payout rail.',
      'Weave paid the naira to PalmPay. Same corridor as proof #1, now from a wallet a first-time user gets by signing in with Google.',
    ],
  },
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
      'CCTP burned 2 USDC on Stellar and minted 1.995 USDC on Base straight to Weave\'s payout rail.',
      'Weave paid ₦2,698.94 to PalmPay at 01:31:06 UTC. Fees: $0.017 + $0.005.',
    ],
  },
];

export const STELLAR_EXPERT_TX = (h: string) => `https://stellar.expert/explorer/public/tx/${h}`;
export const BASESCAN_TX = (h: string) => `https://basescan.org/tx/${h}`;
export const HORIZON_TX = (h: string) => `https://horizon.stellar.org/transactions/${h}`;
