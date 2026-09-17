import { NextRequest } from 'next/server';
import { loginWithSignedChallenge } from '../../../../lib/server/session';
import { allow, clientIp, tooMany } from '../../../../lib/server/ratelimit';

export async function POST(req: NextRequest) {
  if (!(await allow(`verify:${clientIp(req)}`, 30, 60))) return tooMany();
  const b = await req.json().catch(() => ({}));
  const s = await loginWithSignedChallenge(String(b.address ?? ''), String(b.nonce ?? ''), String(b.signature ?? ''));
  if (!s) return Response.json({ success: false, error: 'That signature did not check out.' }, { status: 401 });
  return Response.json({ success: true, data: { address: s.address, network: s.network } });
}
