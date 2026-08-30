import { createDatabaseClient, databaseConfigFromEnv, type DatabaseClient } from '@leetcode-app/database';
import type { AccountLifecycleRequest, AccountLifecycleRequestType } from '@leetcode-app/domain';

type Row = { id: string; user_id: string; type: AccountLifecycleRequestType; status: AccountLifecycleRequest['status']; requested_at: Date | string; completed_at: Date | string | null; reason: string | null };
const iso = (value: Date | string | null) => value === null ? null : new Date(value).toISOString();
const mapRequest = (row: Row): AccountLifecycleRequest => ({ id: row.id, userId: row.user_id, type: row.type, status: row.status, requestedAt: iso(row.requested_at)!, completedAt: iso(row.completed_at), reason: row.reason });

export function createAccountLifecycleStore(db: DatabaseClient = createDatabaseClient(databaseConfigFromEnv())) {
  return {
    async listOwned(userId: string): Promise<AccountLifecycleRequest[]> {
      const result = await db.query<Row>('SELECT * FROM account_lifecycle_requests WHERE user_id = $1 ORDER BY requested_at DESC', [userId]);
      return result.rows.map(mapRequest);
    },
    async request(userId: string, type: AccountLifecycleRequestType, reason: string | null): Promise<AccountLifecycleRequest> {
      const result = await db.query<Row>(
        `INSERT INTO account_lifecycle_requests (user_id, type, reason) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, type) WHERE status IN ('requested', 'processing')
         DO UPDATE SET user_id = EXCLUDED.user_id
         RETURNING *`,
        [userId, type, reason],
      );
      return mapRequest(result.rows[0]);
    },
  };
}
