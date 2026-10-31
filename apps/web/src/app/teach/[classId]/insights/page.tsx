import { notFound, redirect } from 'next/navigation';
import { ClassInsightsPanel } from '@/components/class-insights/class-insights-panel';
import { readClassInsightsPage } from '@/lib/class-insights-api';

export default async function InstructorClassInsightsPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  const access = await readClassInsightsPage('teach', classId);
  if (access.status === 'unauthenticated') redirect(`/auth?next=${encodeURIComponent(`/teach/${classId}/insights`)}`);
  if (access.status === 'forbidden') redirect('/teach/start');
  if (access.status !== 'authorized') notFound();
  return <ClassInsightsPanel key={`${access.actorId}:${access.classroom.id}:teach`} actorId={access.actorId} classId={access.classroom.id} workspace="teach" />;
}
