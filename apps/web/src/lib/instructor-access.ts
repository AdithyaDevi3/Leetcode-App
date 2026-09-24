import 'server-only';
import { createDatabaseClient, databaseConfigFromEnv, PostgresClassroomRepository } from '@leetcode-app/database';
import { getSession } from '@/lib/auth/session';

export async function readInstructorData<T>(read: (repository: PostgresClassroomRepository, user: { id: string }) => Promise<T>): Promise<
  { status: 'unauthenticated' } | { status: 'forbidden' } | { status: 'authorized'; data: T }
> {
  const session = await getSession();
  if (!session) return { status: 'unauthenticated' };
  const db = createDatabaseClient(databaseConfigFromEnv());
  try {
    const result = await db.query<{ role: string }>('SELECT role FROM users WHERE id = $1', [session.user.id]);
    if (!['instructor', 'admin'].includes(result.rows[0]?.role)) return { status: 'forbidden' };
    return { status: 'authorized', data: await read(new PostgresClassroomRepository(db, session.user.id), session.user) };
  } finally {
    await db.close();
  }
}
