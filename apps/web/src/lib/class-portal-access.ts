import 'server-only';

import {
  createDatabaseClient, databaseConfigFromEnv, PostgresAdministrationRepository,
  PostgresClassPortalRepository, type ClassPortalWorkspace, type DatabaseClient,
} from '@leetcode-app/database';
import { canPerformAdministrationAction } from '@leetcode-app/domain';
import { getSession } from '@/lib/auth/session';
import { classPortalId, classPortalWorkspace } from './class-portal-input';

export type ClassPortalAccess<T> = { status: 'unauthenticated' } | { status: 'forbidden' } | { status: 'authorized'; data: T };
export type ClassPortalActor = { id: string };

/** Current server-owned role checks; each repository call rechecks class ownership/membership. */
export async function readClassPortalData<T>(workspace: ClassPortalWorkspace, read: (
  repository: PostgresClassPortalRepository, actor: ClassPortalActor, db: DatabaseClient,
) => Promise<T>): Promise<ClassPortalAccess<T>> {
  classPortalWorkspace(workspace);
  const session = await getSession({ failOnAuthError: true });
  if (!session) return { status: 'unauthenticated' };
  const actorId = classPortalId(session.user.id);
  const db = createDatabaseClient(databaseConfigFromEnv());
  try {
    if (workspace === 'admin') {
      const roles = await new PostgresAdministrationRepository(db).listActiveRoles(actorId);
      if (!canPerformAdministrationAction(roles, 'classes.manage')) return { status: 'forbidden' };
    } else {
      const user = await db.query<{ role: string }>('SELECT role FROM users WHERE id=$1', [actorId]);
      if (workspace === 'learner' ? user.rows[0]?.role !== 'learner' : !['instructor', 'admin'].includes(user.rows[0]?.role)) return { status: 'forbidden' };
    }
    const repository = new PostgresClassPortalRepository(db, { userId: actorId,
      role: workspace === 'admin' ? 'administrator' : workspace === 'teach' ? 'instructor' : 'learner' });
    return { status: 'authorized', data: await read(repository, { id: actorId }, db) };
  } finally { await db.close(); }
}
