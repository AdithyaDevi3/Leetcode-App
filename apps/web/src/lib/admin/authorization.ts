import 'server-only';

import {
  PostgresAdministrationRepository,
  type DatabaseClient,
  createDatabaseClient,
  databaseConfigFromEnv,
} from '@leetcode-app/database';
import {
  canPerformAdministrationAction,
  type AdministrationAction,
  type AdministrationRole,
} from '@leetcode-app/domain';
import { getSession } from '@/lib/auth/session';
import { isSupabaseConfigured } from '@/lib/supabase/config';

export type AdministrationPrincipal = {
  id: string;
  email: string | null;
  displayName: string | null;
  roles: AdministrationRole[];
};

export type AdministrationAccess<T> =
  | { status: 'unauthenticated' }
  | { status: 'forbidden' }
  | { status: 'authorized'; principal: AdministrationPrincipal; data: T };

/**
 * Authorize and read in one server-only boundary. Every admin page and action
 * uses this helper so hiding a navigation link is never the access control.
 */
export async function readAdministrationData<T>(
  action: AdministrationAction,
  read: (repository: PostgresAdministrationRepository, principal: AdministrationPrincipal, db: DatabaseClient) => Promise<T>,
): Promise<AdministrationAccess<T>> {
  if (!isSupabaseConfigured()) return { status: 'unauthenticated' };
  const session = await getSession();
  if (!session) return { status: 'unauthenticated' };

  const db = createDatabaseClient(databaseConfigFromEnv());
  try {
    const repository = new PostgresAdministrationRepository(db);
    const roles = await repository.listActiveRoles(session.user.id);
    if (!canPerformAdministrationAction(roles, action)) return { status: 'forbidden' };

    const principal: AdministrationPrincipal = {
      id: session.user.id,
      email: session.user.email,
      displayName: session.user.displayName,
      roles,
    };
    return { status: 'authorized', principal, data: await read(repository, principal, db) };
  } finally {
    await db.close();
  }
}

export async function getAdministrationAccess(
  action: AdministrationAction = 'administration.access',
): Promise<AdministrationAccess<null>> {
  return readAdministrationData(action, async () => null);
}
