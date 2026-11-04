import 'server-only';

import {
  createDatabaseClient, databaseConfigFromEnv, PostgresAdministrationRepository,
  PostgresClassGradeReleaseRepository, PostgresGradebookRepository, type DatabaseClient, type GradebookPrincipal,
} from '@leetcode-app/database';
import { canPerformAdministrationAction } from '@leetcode-app/domain';
import { getSession } from '@/lib/auth/session';
import { ClassGradebookInputError, classGradebookId, type ClassGradebookWorkspace } from './class-gradebook-input';

export type ClassGradebookAccess<T> = { status: 'unauthenticated' } | { status: 'forbidden' } | { status: 'authorized'; data: T };
export type ClassGradebookActor = { id: string };

async function readData<T>(workspace: ClassGradebookWorkspace | 'learner', read: (
  db: DatabaseClient, principal: GradebookPrincipal, actor: ClassGradebookActor,
) => Promise<T>): Promise<ClassGradebookAccess<T>> {
  if (!['admin', 'teach', 'learner'].includes(workspace)) throw new ClassGradebookInputError();
  const session = await getSession({ failOnAuthError: true });
  if (!session) return { status: 'unauthenticated' };
  const actorId = classGradebookId(session.user.id);
  const db = createDatabaseClient(databaseConfigFromEnv());
  try {
    if (workspace === 'admin') {
      const roles = await new PostgresAdministrationRepository(db).listActiveRoles(actorId);
      if (!canPerformAdministrationAction(roles, 'classes.manage')) return { status: 'forbidden' };
    } else {
      const user = await db.query<{ role: string }>('SELECT role FROM users WHERE id=$1', [actorId]);
      if (workspace === 'learner' ? user.rows[0]?.role !== 'learner' : !['instructor', 'admin'].includes(user.rows[0]?.role)) {
        return { status: 'forbidden' };
      }
    }
    return { status: 'authorized', data: await read(db, { userId: actorId,
      role: workspace === 'admin' ? 'administrator' : workspace === 'teach' ? 'instructor' : 'learner' }, { id: actorId }) };
  } finally { await db.close(); }
}

/** Session and current role checks; class ownership/membership is checked again inside each repository operation. */
export function readClassGradebookData<T>(workspace: ClassGradebookWorkspace, read: (
  repository: PostgresGradebookRepository, actor: ClassGradebookActor, db: DatabaseClient,
) => Promise<T>): Promise<ClassGradebookAccess<T>> {
  return readData(workspace, (db, principal, actor) => read(new PostgresGradebookRepository(db, principal), actor, db));
}
export function readClassGradeReleaseData<T>(workspace: ClassGradebookWorkspace, read: (
  repository: PostgresClassGradeReleaseRepository, actor: ClassGradebookActor,
) => Promise<T>): Promise<ClassGradebookAccess<T>> {
  return readData(workspace, (db, principal, actor) => read(new PostgresClassGradeReleaseRepository(db, principal), actor));
}
export function readSharedClassGradeData<T>(read: (
  repository: PostgresClassGradeReleaseRepository, actor: ClassGradebookActor,
) => Promise<T>): Promise<ClassGradebookAccess<T>> {
  return readData('learner', (db, principal, actor) => read(new PostgresClassGradeReleaseRepository(db, principal), actor));
}
export const readLearnerClassResultsData = readSharedClassGradeData;
