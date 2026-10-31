import { notFound, redirect } from 'next/navigation';
import { AdminAreaDenied } from '@/components/admin/admin-access-denied';
import { ClassInsightsPanel } from '@/components/class-insights/class-insights-panel';
import { readClassInsightsPage } from '@/lib/class-insights-api';

export default async function AdminClassInsightsPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  const access = await readClassInsightsPage('admin', classId);
  if (access.status === 'unauthenticated') redirect(`/auth?next=${encodeURIComponent(`/admin/classes/${classId}/insights`)}`);
  if (access.status === 'forbidden') return <AdminAreaDenied />;
  if (access.status !== 'authorized') notFound();
  return <ClassInsightsPanel key={`${access.actorId}:${access.classroom.id}:admin`} actorId={access.actorId} classId={access.classroom.id} workspace="admin" />;
}
