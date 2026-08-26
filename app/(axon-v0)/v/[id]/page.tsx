import { VentureRoom } from '@/components/axon-v0/venture-room';

export const dynamic = 'force-dynamic';

export default async function VenturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <VentureRoom ventureId={id} />;
}
