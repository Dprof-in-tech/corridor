'use client';

import { TransactionBuilder, Networks, Operation, Address, xdr, type Transaction } from '@stellar/stellar-sdk';
import { getNetwork } from './network';

// Before the wallet signs anything Weave built, look at it. "Non-custodial"
// only means something if the client refuses transactions it did not ask for.
//
// The mainnet bridge is two Soroban invocations from the payer's account:
//   approve  — on the USDC contract, spender = Circle's CCTP TokenMessenger
//   bridge   — on the LI.FI diamond
// Anything else (other contracts, classic payments, a different source, an
// extra operation) is rejected here, whatever the server said.

export const CONTRACTS = {
  mainnet: {
    usdc: 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',
    tokenMessenger: 'CAE2G5Z77UP7GYPYGFOWFGW7C7J6I4YP2AFGSADRKQY62SYUFLPNFTXL',
    lifiDiamond: 'CDCNXZHYWRDHNAQEY5EX3WCF7BCWVJBS64ZBVUGRTQBFTHUKG6NAXFTR',
  },
} as const;

export type ExpectedCall = { kind: 'approve' | 'bridge'; from: string };

function parse(xdrB64: string): Transaction {
  const passphrase = getNetwork() === 'testnet' ? Networks.TESTNET : Networks.PUBLIC;
  const tx = TransactionBuilder.fromXDR(xdrB64, passphrase);
  if ('innerTransaction' in tx) throw new Error('Refusing to sign: fee-bump transactions are not expected here.');
  return tx as Transaction;
}

function invokedContract(op: Operation): { contract: string; fn: string } | null {
  if (op.type !== 'invokeHostFunction') return null;
  const fnc = (op as Operation.InvokeHostFunction).func;
  if (fnc.switch().name !== 'hostFunctionTypeInvokeContract') return null;
  const inv = fnc.invokeContract();
  const contract = Address.fromScAddress(inv.contractAddress()).toString();
  const fn = inv.functionName().toString();
  return { contract, fn };
}

/** Throws with a plain-English reason if the transaction is not the one expected. */
export function assertExpectedTx(xdrB64: string, expected: ExpectedCall): void {
  const tx = parse(xdrB64);
  if (tx.source !== expected.from) throw new Error(`Refusing to sign: this transaction is from ${tx.source.slice(0, 6)}…, not your wallet.`);
  if (tx.operations.length !== 1) throw new Error(`Refusing to sign: expected 1 operation, got ${tx.operations.length}.`);
  const call = invokedContract(tx.operations[0]);
  if (!call) throw new Error('Refusing to sign: expected a Soroban contract call.');
  const net = CONTRACTS.mainnet;
  if (expected.kind === 'approve') {
    if (call.contract !== net.usdc) throw new Error(`Refusing to sign: approve targets ${call.contract.slice(0, 6)}…, not the USDC contract.`);
    if (call.fn !== 'approve') throw new Error(`Refusing to sign: expected 'approve', got '${call.fn}'.`);
    // The spender is the first argument of approve(from, spender, amount, expiration_ledger).
    const args = ((tx.operations[0] as Operation.InvokeHostFunction).func.invokeContract().args());
    const spender = args[1] ? Address.fromScVal(args[1]).toString() : '';
    if (spender !== net.tokenMessenger) throw new Error(`Refusing to sign: allowance spender is ${spender.slice(0, 6)}…, not Circle's TokenMessenger.`);
  } else {
    if (call.contract !== net.lifiDiamond) throw new Error(`Refusing to sign: bridge call targets ${call.contract.slice(0, 6)}…, not the LI.FI bridge.`);
  }
}

// Keep xdr referenced for consumers that want the raw types.
export type { xdr };
