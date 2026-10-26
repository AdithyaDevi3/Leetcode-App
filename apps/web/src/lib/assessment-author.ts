import 'server-only';
import { PostgresAssessmentDraftRepository, PostgresClassroomRepository } from '@leetcode-app/database';
import { readAdministrationData } from './admin/authorization';
import { readInstructorData } from './instructor-access';

export type AssessmentWorkspace = 'admin' | 'teach';
type AuthorAccess<T> = { status: 'unauthenticated' } | { status: 'forbidden' } | { status: 'authorized'; data: T };
export async function readAssessmentAuthorData<T>(workspace: AssessmentWorkspace, read: (
  repository: PostgresAssessmentDraftRepository, classes: PostgresClassroomRepository, author: { id: string },
) => Promise<T>): Promise<AuthorAccess<T>> {
  if (workspace === 'admin') return readAdministrationData('classes.manage', async (_repository, principal, db) =>
    read(new PostgresAssessmentDraftRepository(db, { role: 'administrator', userId: principal.id }), new PostgresClassroomRepository(db), principal));
  return readInstructorData(async (classes, principal, db) =>
    read(new PostgresAssessmentDraftRepository(db, { role: 'instructor', userId: principal.id }), classes, principal));
}
