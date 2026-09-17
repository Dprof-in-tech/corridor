import { getSession, clearSession } from '../../../../lib/server/session';

export async function GET() {
  const s = await getSession();
  return s ? Response.json({ success: true, data: { address: s.address, network: s.network } }) : Response.json({ success: false, error: 'no session' }, { status: 401 });
}
export async function DELETE() { await clearSession(); return Response.json({ success: true }); }
