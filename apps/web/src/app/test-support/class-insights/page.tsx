import { notFound } from 'next/navigation';
import { ClassInsightsPanel } from '@/components/class-insights/class-insights-panel';

export const dynamic = 'force-dynamic';
export default async function ClassInsightsFixture({ searchParams }: { searchParams: Promise<{ workspace?: string }> }) {
  if (process.env.METHOD_E2E_FIXTURES !== '1') notFound();
  const { workspace } = await searchParams;
  const props = { actorId: '11111111-1111-4111-8111-111111111111', classId: '33333333-3333-4333-8333-333333333333' };
  return workspace === 'admin' ? <main className="p-5"><ClassInsightsPanel {...props} workspace="admin" /></main> : <ClassInsightsPanel {...props} workspace="teach" />;
}
