import 'server-only';
import { createHash, randomBytes } from 'crypto';
import { kvGet, kvSet } from '../store';
import type { Network } from './session';

// A "naira request": a Bolivian user asks a Nigerian payer for ₦, delivered
// as BOB. Two parties, two views:
//   owner  — the requester (holds an owner token issued at creation)
//   public — whoever opens /r/[id] (sees only what a payer needs)
// Only the SERVER ever sets orderId (it creates the order itself), and status
// only moves forward. The record's TTL is fixed from creation.

export interface NairaRequest {
  id: string;
  network: Network;
  requester: { address: string; handle: string | null };
  bob: { amount: number; provider: string; rail: string; fields: Record<string, string> };
  usdcNeeded: number;
  ngnAmount: number;
  orderId: string | null;
  bankDetails: { institution: string; accountIdentifier: string; accountName: string; amountToTransfer: string } | null;
  status: 'open' | 'paying' | 'funded' | 'cashed_out' | 'expired';
  offrampTxId: string | null;
  ownerTokenHash: string;
  createdAt: string;
}

export const TTL_S = 7 * 24 * 3600;
const KEY = (id: string) => `corridor:req:${id}`;
export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
export const newToken = () => randomBytes(24).toString('base64url');
export const newId = () => randomBytes(9).toString('base64url');

export const loadRequest = (id: string) => kvGet<NairaRequest>(KEY(id));
/** Save without extending the original TTL. */
export async function saveRequest(r: NairaRequest) {
  const age = Math.floor((Date.now() - new Date(r.createdAt).getTime()) / 1000);
  await kvSet(KEY(r.id), r, Math.max(60, TTL_S - age));
}

export const isOwner = (r: NairaRequest, token: string | null) => !!token && hashToken(token) === r.ownerTokenHash;

/** What a payer (or anyone with the link) may see. No bank fields, no owner token. */
export function publicView(r: NairaRequest) {
  return { id: r.id, status: r.status, ngnAmount: r.ngnAmount, bobAmount: r.bob.amount, handle: r.requester.handle, bankDetails: r.bankDetails, createdAt: r.createdAt };
}
/** The requester's own view. */
export function ownerView(r: NairaRequest) {
  const { ownerTokenHash: _h, ...rest } = r;
  return rest;
}
