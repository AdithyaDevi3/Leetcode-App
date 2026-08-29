import { createDatabaseClient, type DatabaseClient } from '@leetcode-app/database';
import type { NotificationChannel, NotificationPreference } from '@leetcode-app/domain';

type PreferenceRow = {
  channel: NotificationChannel;
  enabled: boolean;
  quiet_hours_start: number | null;
  quiet_hours_end: number | null;
};

const mapPreference = (row: PreferenceRow): NotificationPreference => ({
  channel: row.channel,
  enabled: row.enabled,
  quietHoursStart: row.quiet_hours_start ?? undefined,
  quietHoursEnd: row.quiet_hours_end ?? undefined,
});

const defaultDatabase = () => createDatabaseClient({
  host: process.env.POSTGRES_HOST ?? 'localhost',
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  database: process.env.POSTGRES_DB ?? 'leetcode_app',
  user: process.env.POSTGRES_USER ?? 'postgres',
  password: process.env.POSTGRES_PASSWORD ?? 'postgres',
});

export function createNotificationPreferencesStore(db: DatabaseClient = defaultDatabase()) {
  return {
    async listOwned(userId: string): Promise<NotificationPreference[]> {
      const result = await db.query<PreferenceRow>(
        'SELECT channel, enabled, quiet_hours_start, quiet_hours_end FROM notification_preferences WHERE user_id = $1 ORDER BY channel',
        [userId],
      );
      return result.rows.map(mapPreference);
    },
    async upsertOwned(userId: string, preference: NotificationPreference): Promise<NotificationPreference> {
      const result = await db.query<PreferenceRow>(
        `INSERT INTO notification_preferences (user_id, channel, enabled, quiet_hours_start, quiet_hours_end)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, channel) DO UPDATE SET enabled = EXCLUDED.enabled,
           quiet_hours_start = EXCLUDED.quiet_hours_start, quiet_hours_end = EXCLUDED.quiet_hours_end, updated_at = NOW()
         RETURNING channel, enabled, quiet_hours_start, quiet_hours_end`,
        [userId, preference.channel, preference.enabled, preference.quietHoursStart ?? null, preference.quietHoursEnd ?? null],
      );
      return mapPreference(result.rows[0]);
    },
  };
}
