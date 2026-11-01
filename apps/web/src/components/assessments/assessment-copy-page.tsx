import { notFound, redirect } from 'next/navigation';
import { AdminAreaDenied } from '@/components/admin/admin-access-denied';
import { readAssessmentCopyPage } from '@/lib/assessment-copy-api';
import { AssessmentCopyPanel } from './assessment-copy-panel';

export async function AssessmentCopyPage({ workspace, classId, draftId }: { workspace: 'teach' | 'admin'; classId: string; draftId: string }) {
  const access = await readAssessmentCopyPage(workspace, classId, draftId);
  const base = workspace === 'admin' ? `/admin/classes/${classId}` : `/teach/${classId}`;
  if (access.status === 'unauthenticated') redirect(`/auth?next=${encodeURIComponent(`${base}/assessments/${draftId}/copy`)}`);
  if (access.status === 'forbidden') return workspace === 'admin' ? <AdminAreaDenied /> : redirect('/teach/start');
  if (access.status !== 'authorized') notFound();
  return <AssessmentCopyPanel key={`${access.data.actorId}:${workspace}:${access.data.source.classId}:${access.data.source.id}`} actorId={access.data.actorId} workspace={workspace} classId={access.data.source.classId} draftId={access.data.source.id} />;
}
