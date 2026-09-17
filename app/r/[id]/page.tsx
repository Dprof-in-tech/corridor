import PayRequestClient from './PayRequestClient';

// Public page a Nigerian payer opens from a shared link. No Pollar login: the
// payer just needs a bank. Weave issues NGN transfer details whose proceeds
// land as USDC in the requester's Stellar wallet.
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PayRequestClient id={id} />;
}
