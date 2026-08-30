import { createDatabaseClient, databaseConfigFromEnv } from '@leetcode-app/database';

export type LearnerRequestType = 'question' | 'feature';
export type LearnerRequestStatus = 'submitted' | 'triaged' | 'accepted' | 'rejected' | 'completed';
export type LearnerRequest = {
  id: string; ownerType: 'user' | 'guest'; ownerId: string; type: LearnerRequestType;
  title: string; description: string; sourceUrl: string | null; status: LearnerRequestStatus;
  createdAt: string; updatedAt: string;
};

type Row = { id: string; user_id: string | null; guest_id: string | null; type: LearnerRequestType; title: string; description: string; source_url: string | null; status: LearnerRequestStatus; created_at: Date | string; updated_at: Date | string };
const iso = (value: Date | string) => new Date(value).toISOString();
const mapRow = (row: Row): LearnerRequest => ({
  id: row.id, ownerType: row.user_id ? 'user' : 'guest', ownerId: row.user_id ?? row.guest_id!, type: row.type,
  title: row.title, description: row.description, sourceUrl: row.source_url, status: row.status,
  createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
});

export type LearnerRequestInput = { type: LearnerRequestType; title: string; description: string; sourceUrl: string | null };

export function parseLearnerRequestInput(value: unknown): LearnerRequestInput | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  if (input.type !== 'question' && input.type !== 'feature') return null;
  if (typeof input.title !== 'string' || typeof input.description !== 'string') return null;
  const title = input.title.trim(); const description = input.description.trim();
  if (title.length < 3 || title.length > 160 || description.length < 10 || description.length > 5_000) return null;
  if (input.sourceUrl !== undefined && input.sourceUrl !== null && typeof input.sourceUrl !== 'string') return null;
  const sourceUrl = typeof input.sourceUrl === 'string' ? input.sourceUrl.trim() : null;
  if (sourceUrl && sourceUrl.length > 2_000) return null;
  if (sourceUrl) { try { const url = new URL(sourceUrl); if (!['http:', 'https:'].includes(url.protocol)) return null; } catch { return null; } }
  return { type: input.type, title, description, sourceUrl };
}

export function createLearnerRequestsStore() {
  return {
    async list(owner: { kind: 'user' | 'guest'; id: string }): Promise<LearnerRequest[]> {
      const db = createDatabaseClient(databaseConfigFromEnv());
      try {
        const column = owner.kind === 'user' ? 'user_id' : 'guest_id';
        const result = await db.query<Row>(`SELECT * FROM learner_requests WHERE ${column} = $1 ORDER BY created_at DESC`, [owner.id]);
        return result.rows.map(mapRow);
      } finally { await db.close(); }
    },
    async create(owner: { kind: 'user' | 'guest'; id: string }, input: LearnerRequestInput): Promise<LearnerRequest> {
      const db = createDatabaseClient(databaseConfigFromEnv());
      try {
        const userId = owner.kind === 'user' ? owner.id : null; const guestId = owner.kind === 'guest' ? owner.id : null;
        const result = await db.query<Row>(`INSERT INTO learner_requests (user_id, guest_id, type, title, description, source_url) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`, [userId, guestId, input.type, input.title, input.description, input.sourceUrl]);
        return mapRow(result.rows[0]);
      } finally { await db.close(); }
    },
  };
}
