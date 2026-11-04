import 'server-only';

import { ClassPortalAccessError, type DatabaseClient, type PostgresClassPortalRepository, type ClassPortalWorkspace } from '@leetcode-app/database';
import { notFound, redirect } from 'next/navigation';
import { assessmentUuid } from './assessment-draft-input';
import { readClassPortalData } from './class-portal-access';

export async function classPortalPageData<T = null>(workspace: ClassPortalWorkspace, classId: string, read?: (
  repository: PostgresClassPortalRepository, actor: { id: string }, db: DatabaseClient,
) => Promise<T>, section: 'home' | 'assignments' | 'announcements' | 'people' = 'home') {
  if (!assessmentUuid.test(classId)) notFound();
  const base = workspace === 'learner' ? `/classes/${classId}` : workspace === 'teach' ? `/teach/${classId}` : `/admin/classes/${classId}`;
  const access = await readClassPortalData(workspace, async (repository, actor, db) => ({
    classroom: await repository.readClass(classId), actorId: actor.id,
    value: read ? await read(repository, actor, db) : null,
  })).catch(error => {
    if (error instanceof ClassPortalAccessError) return { status: 'not_found' as const };
    throw error;
  });
  if (access.status === 'unauthenticated') redirect(`/auth?next=${encodeURIComponent(`${base}${section === 'home' ? '' : `/${section}`}`)}`);
  if (access.status !== 'authorized') notFound();
  return access.data;
}
