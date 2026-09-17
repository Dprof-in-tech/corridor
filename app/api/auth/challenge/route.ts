import { NextRequest } from 'next/server';
import { issueChallenge } from '../../../../lib/server/session';
import { isGAddress } from '../../../../lib/stellar';
import { allow, clientIp, tooMany } from '../../../../lib/server/ratelimit';

export async function POST(req: NextRequest) {
  if (!(await allow(`challenge:${clientIp(req)}`, 30, 60))) return tooMany();
  const b = await req.json().catch(() => ({}));
  const address = String(b.address ?? '');
  const network = b.network === 'mainnet' ? 'mainnet' : 'testnet';
  if (!isGAddress(address)) return Response.json({ success: false, error: 'invalid Stellar address' }, { status: 400 });
  return Response.json({ success: true, data: issueChallenge(address, network) });
}
