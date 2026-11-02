import { notFound, redirect } from 'next/navigation';
import { WrittenAssessmentAccessError } from '@leetcode-app/database';
import { AdminAreaDenied } from '@/components/admin/admin-access-denied';
import { readWrittenAuthorPage, readWrittenLearnerPage } from '@/lib/written-assessment-api';
import type { WrittenWorkspace } from '@/lib/written-assessment-api-types';
import { uuid } from './written-contract';
import { WrittenAuthor } from './written-author';
import { WrittenAttempt } from './written-attempt';
import { WrittenLibrary } from './written-library';
import { authorPath } from './written-ui';

export async function WrittenAuthorPage({ workspace, classId, draftId, create = false }: { workspace: WrittenWorkspace; classId: string; draftId?: string; create?: boolean }) {
  if (!uuid(classId) || draftId !== undefined && !uuid(draftId)) notFound();
  let access;
  try { access = await readWrittenAuthorPage(workspace, classId, draftId); }
  catch (cause) { if (cause instanceof WrittenAssessmentAccessError) notFound(); throw cause; }
  const path = `${authorPath(workspace, classId)}${draftId ? `/${draftId}` : create ? '/new' : ''}`;
  if (access.status === 'unauthenticated') redirect(`/auth?next=${encodeURIComponent(path)}`);
  if (access.status !== 'authorized') return workspace === 'admin' ? <AdminAreaDenied /> : redirect('/teach/start');
  const actorId = access.data.actorId;
  if ('author' in access.data && (access.data.author.draft.classId !== classId || access.data.author.draft.id !== draftId)) notFound();
  if ('classId' in access.data && access.data.classId !== classId) notFound();
  return draftId || create ? <WrittenAuthor key={`${actorId}:${workspace}:${classId}:${draftId ?? 'new'}`} actorId={actorId} workspace={workspace} classId={classId} draftId={draftId} />
    : <WrittenLibrary key={`${actorId}:${workspace}:${classId}`} actorId={actorId} workspace={workspace} classId={classId} />;
}
export async function WrittenLearnerPage({ classId, recipientId }: { classId: string; recipientId: string }) {
  if (!uuid(classId) || !uuid(recipientId)) notFound();
  let access;
  try { access = await readWrittenLearnerPage(recipientId); }
  catch (cause) { if (cause instanceof WrittenAssessmentAccessError) notFound(); throw cause; }
  if (access.status === 'unauthenticated') redirect(`/auth?next=${encodeURIComponent(`/classes/${classId}/written/${recipientId}`)}`);
  if (access.status !== 'authorized') notFound();
  if (access.data.assignment.classId !== classId || access.data.assignment.recipientId !== recipientId) notFound();
  return <WrittenAttempt key={`${access.data.actorId}:${recipientId}:${access.data.assignment.policyVersionId}`} actorId={access.data.actorId} classId={classId} recipientId={recipientId} policyVersionId={access.data.assignment.policyVersionId} />;
}
