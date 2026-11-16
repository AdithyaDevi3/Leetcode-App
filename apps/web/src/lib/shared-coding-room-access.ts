import 'server-only';

import { canPerformAdministrationAction } from '@leetcode-app/domain';
import { createDatabaseClient, databaseConfigFromEnv, PostgresAdministrationRepository, PostgresSharedCodingRoomRepository, type DatabaseClient, type GradebookPrincipal } from '@leetcode-app/database';
import { getSession } from '@/lib/auth/session';

export type SharedCodingRoomAccess<T> = { status: 'unauthenticated' } | { status: 'forbidden' } | { status: 'authorized'; data: T };

function validId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function readSharedCodingRoomData<T>(read: (repository: PostgresSharedCodingRoomRepository, actorId: string, db: DatabaseClient) => Promise<T>): Promise<SharedCodingRoomAccess<T>> {
  const session = await getSession({ failOnAuthError: true });
  if (!session) return { status: 'unauthenticated' };
  const actorId = session.user.id;
  if (!validId(actorId)) return { status: 'forbidden' };
  const db = createDatabaseClient(databaseConfigFromEnv());
  try {
    const user = (await db.query<{ role: string }>('SELECT role FROM users WHERE id=$1', [actorId])).rows[0];
    if (!user) return { status: 'forbidden' };
    let principal: GradebookPrincipal;
    if (user.role === 'learner') principal = { userId: actorId, role: 'learner' };
    else {
      const roles = await new PostgresAdministrationRepository(db).listActiveRoles(actorId);
      principal = canPerformAdministrationAction(roles, 'classes.manage') ? { userId: actorId, role: 'administrator' } : { userId: actorId, role: 'instructor' };
    }
    return { status: 'authorized', data: await read(new PostgresSharedCodingRoomRepository(db, principal), actorId, db) };
  } finally { await db.close(); }
}
