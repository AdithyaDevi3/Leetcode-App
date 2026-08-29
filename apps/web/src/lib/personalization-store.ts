import { createDatabaseClient, type DatabaseClient } from '@leetcode-app/database';
import type { LearnerProfile } from '@leetcode-app/domain';

type ProfileRow = { goal: LearnerProfile['goal']; target_date: Date | string | null; experience: LearnerProfile['experience']; preferred_language: LearnerProfile['preferredLanguage']; weekly_minutes: number; timezone: string; accessibility_notes: string | null; diagnostic_opt_in: boolean; personalization_opt_out: boolean };
const mapProfile = (row: ProfileRow): LearnerProfile & { personalizationOptOut: boolean } => ({ goal: row.goal, targetDate: row.target_date ? new Date(row.target_date).toISOString() : undefined, experience: row.experience, preferredLanguage: row.preferred_language, weeklyMinutes: row.weekly_minutes, timezone: row.timezone, accessibilityNotes: row.accessibility_notes ?? undefined, diagnosticOptIn: row.diagnostic_opt_in, personalizationOptOut: row.personalization_opt_out });

export function createPersonalizationStore(db: DatabaseClient = createDatabaseClient({ host: process.env.POSTGRES_HOST ?? 'localhost', port: Number(process.env.POSTGRES_PORT ?? 5432), database: process.env.POSTGRES_DB ?? 'leetcode_app', user: process.env.POSTGRES_USER ?? 'postgres', password: process.env.POSTGRES_PASSWORD ?? 'postgres' })) {
  return {
    async getProfile(userId: string) {
      const result = await db.query<ProfileRow>('SELECT goal, target_date, experience, preferred_language, weekly_minutes, timezone, accessibility_notes, diagnostic_opt_in, personalization_opt_out FROM learner_profiles WHERE user_id = $1', [userId]);
      return result.rows[0] ? mapProfile(result.rows[0]) : null;
    },
    async upsertProfile(userId: string, profile: LearnerProfile & { personalizationOptOut?: boolean }) {
      const result = await db.query<ProfileRow>(`INSERT INTO learner_profiles (user_id, goal, target_date, experience, preferred_language, weekly_minutes, timezone, accessibility_notes, diagnostic_opt_in, personalization_opt_out)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (user_id) DO UPDATE SET goal = EXCLUDED.goal, target_date = EXCLUDED.target_date, experience = EXCLUDED.experience, preferred_language = EXCLUDED.preferred_language, weekly_minutes = EXCLUDED.weekly_minutes, timezone = EXCLUDED.timezone, accessibility_notes = EXCLUDED.accessibility_notes, diagnostic_opt_in = EXCLUDED.diagnostic_opt_in, personalization_opt_out = EXCLUDED.personalization_opt_out, updated_at = NOW()
        RETURNING goal, target_date, experience, preferred_language, weekly_minutes, timezone, accessibility_notes, diagnostic_opt_in, personalization_opt_out`, [userId, profile.goal, profile.targetDate ?? null, profile.experience, profile.preferredLanguage, profile.weeklyMinutes, profile.timezone, profile.accessibilityNotes ?? null, profile.diagnosticOptIn, profile.personalizationOptOut ?? false]);
      return mapProfile(result.rows[0]);
    },
  };
}
