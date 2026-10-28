import 'server-only';

import { createDatabaseClient, databaseConfigFromEnv, PostgresQuizAssignmentRepository } from '@leetcode-app/database';
import { getSession } from '@/lib/auth/session';
import { readAdministrationData } from '@/lib/admin/authorization';
import { readInstructorData } from '@/lib/instructor-access';
import type { AssessmentWorkspace } from '@/lib/assessment-author';

export type QuizReadAccess<T> = { status: 'unauthenticated' } | { status: 'forbidden' } | { status: 'authorized'; data: T };
type QuizOperation<T> = (repository: PostgresQuizAssignmentRepository, actor: { id: string }) => Promise<T>;

export async function readQuizAuthorData<T>(workspace: AssessmentWorkspace, operation: QuizOperation<T>): Promise<QuizReadAccess<T>> {
  if (workspace === 'admin') return readAdministrationData('classes.manage', async (_repository, principal, db) =>
    operation(new PostgresQuizAssignmentRepository(db, { role: 'administrator', userId: principal.id }), principal));
  return readInstructorData(async (_repository, principal, db) =>
    operation(new PostgresQuizAssignmentRepository(db, { role: 'instructor', userId: principal.id }), principal));
}

export async function readQuizLearnerData<T>(operation: QuizOperation<T>): Promise<QuizReadAccess<T>> {
  const session = await getSession({ failOnAuthError: true });
  if (!session) return { status: 'unauthenticated' };
  const db = createDatabaseClient(databaseConfigFromEnv());
  try {
    return { status: 'authorized', data: await operation(new PostgresQuizAssignmentRepository(db, { role: 'learner', userId: session.user.id }), session.user) };
  } finally { await db.close(); }
}

export async function readQuizInstructorData<T>(operation: QuizOperation<T>): Promise<QuizReadAccess<T>> {
  return readInstructorData(async (_repository, principal, db) =>
    operation(new PostgresQuizAssignmentRepository(db, { role: 'instructor', userId: principal.id }), principal));
}

export function readLearnerQuizAssignment(recipientId: string) {
  return readQuizLearnerData(async (repository, learner) => ({ learnerId: learner.id, assignment: await repository.readLearnerQuiz(recipientId) }));
}

export function readInstructorQuizAssignment(recipientId: string) {
  return readQuizInstructorData(async (repository, instructor) => ({ instructorId: instructor.id, assignment: await repository.readInstructorQuiz(recipientId) }));
}
