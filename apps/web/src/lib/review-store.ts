import { createDatabaseClient, databaseConfigFromEnv, type DatabaseClient } from '@leetcode-app/database';
import { scheduleReview, type ReviewState } from '@leetcode-app/domain';

type ReviewDatabase = Pick<DatabaseClient, 'query'> & Partial<Pick<DatabaseClient, 'close'>>;

type ReviewRow = {
  id: string;
  concept_id: string;
  interval_days: number;
  repetitions: number;
  due_at: Date | string;
};

const mapReview = (row: ReviewRow) => ({
  id: row.id,
  conceptId: row.concept_id,
  intervalDays: row.interval_days,
  repetitions: row.repetitions,
  dueAt: new Date(row.due_at).toISOString(),
});

export function createReviewStore(db: ReviewDatabase = createDatabaseClient(databaseConfigFromEnv())) {
  return {
    close: () => db.close?.() ?? Promise.resolve(),
    async list(userId: string) {
      const result = await db.query<ReviewRow>(
        `SELECT id, concept_id, interval_days, repetitions, due_at
         FROM scheduled_reviews
         WHERE user_id = $1 AND completed_at IS NULL
         ORDER BY due_at ASC, concept_id ASC`,
        [userId],
      );
      return result.rows.map(mapReview);
    },

    async schedule(userId: string, conceptIds: string[], score: number, completedAt: string) {
      for (const conceptId of [...new Set(conceptIds)]) {
        const current = await db.query<ReviewRow>(
          `SELECT id, concept_id, interval_days, repetitions, due_at
           FROM scheduled_reviews
           WHERE user_id = $1 AND concept_id = $2 AND completed_at IS NULL
           ORDER BY due_at DESC
           LIMIT 1`,
          [userId, conceptId],
        );
        const previous = current.rows[0];
        const next = scheduleReview(previous ? {
          conceptId: previous.concept_id,
          intervalDays: previous.interval_days,
          repetitions: previous.repetitions,
          dueAt: new Date(previous.due_at).toISOString(),
        } satisfies ReviewState : null, conceptId, score, completedAt);
        if (previous) {
          await db.query(
            `UPDATE scheduled_reviews
             SET interval_days = $3, repetitions = $4, due_at = $5
             WHERE id = $1 AND user_id = $2 AND completed_at IS NULL`,
            [previous.id, userId, next.intervalDays, next.repetitions, next.dueAt],
          );
        } else {
          await db.query(
            `INSERT INTO scheduled_reviews (user_id, concept_id, interval_days, repetitions, due_at)
             VALUES ($1, $2, $3, $4, $5)`,
            [userId, conceptId, next.intervalDays, next.repetitions, next.dueAt],
          );
        }
      }
    },

    async snooze(userId: string, reviewId: string, days: 1 | 3 | 7) {
      const result = await db.query<ReviewRow>(
        `UPDATE scheduled_reviews
         SET due_at = GREATEST(due_at, NOW()) + ($3::integer * INTERVAL '1 day')
         WHERE id = $1 AND user_id = $2 AND completed_at IS NULL
         RETURNING id, concept_id, interval_days, repetitions, due_at`,
        [reviewId, userId, days],
      );
      return result.rows[0] ? mapReview(result.rows[0]) : null;
    },
  };
}
