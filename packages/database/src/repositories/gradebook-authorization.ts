import type { PoolClient } from 'pg';
import { canPerformAdministrationAction, type AdministrationRole } from '@leetcode-app/domain';
import { GradebookAccessError, type GradebookPrincipal } from './gradebook.repository.js';

/** Recheck current server-owned authority; a principal label is never a grant. */
export async function authorizeGradebookActor(client: PoolClient, principal: GradebookPrincipal, lock = false): Promise<void> {
  const actor = (await client.query<{ role: string }>(`SELECT role FROM users WHERE id=$1 ${lock ? 'FOR SHARE' : ''}`, [principal.userId])).rows[0];
  if (!actor) throw new GradebookAccessError();
  if (principal.role === 'administrator') {
    const roles = await client.query<{ role: AdministrationRole }>(`SELECT role FROM administration_role_assignments WHERE user_id=$1 AND revoked_at IS NULL ${lock ? 'FOR SHARE' : ''}`, [principal.userId]);
    if (!canPerformAdministrationAction(roles.rows.map(row => row.role), 'classes.manage')) throw new GradebookAccessError();
  } else if (principal.role === 'learner' ? actor.role !== 'learner' : !['instructor', 'admin'].includes(actor.role)) {
    throw new GradebookAccessError();
  }
}
