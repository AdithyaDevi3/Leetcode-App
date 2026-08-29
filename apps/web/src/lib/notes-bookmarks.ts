import { createDatabaseClient, type DatabaseClient } from '@leetcode-app/database';

type Timestamp = Date | string;
type NoteRow = { id: string; user_id: string; content_id: string; session_id: string | null; body: string; anchor: string | null; created_at: Timestamp; updated_at: Timestamp };
type BookmarkRow = { id: string; user_id: string; content_id: string; session_id: string | null; label: string | null; created_at: Timestamp };

export type LearnerNote = { id: string; userId: string; contentId: string; sessionId: string | null; body: string; anchor: string | null; createdAt: string; updatedAt: string };
export type LearnerBookmark = { id: string; userId: string; contentId: string; sessionId: string | null; label: string | null; createdAt: string };
export type NoteInput = { contentId: string; sessionId: string | null; body: string; anchor: string | null };
export type BookmarkInput = { contentId: string; sessionId: string | null; label: string | null };

const config = { host: process.env.POSTGRES_HOST ?? 'localhost', port: Number(process.env.POSTGRES_PORT ?? 5432), database: process.env.POSTGRES_DB ?? 'leetcode_app', user: process.env.POSTGRES_USER ?? 'postgres', password: process.env.POSTGRES_PASSWORD ?? 'postgres' };
const toIso = (value: Timestamp) => new Date(value).toISOString();
const mapNote = (row: NoteRow): LearnerNote => ({ id: row.id, userId: row.user_id, contentId: row.content_id, sessionId: row.session_id, body: row.body, anchor: row.anchor, createdAt: toIso(row.created_at), updatedAt: toIso(row.updated_at) });
const mapBookmark = (row: BookmarkRow): LearnerBookmark => ({ id: row.id, userId: row.user_id, contentId: row.content_id, sessionId: row.session_id, label: row.label, createdAt: toIso(row.created_at) });

export function parseNoteInput(value: unknown): NoteInput | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  const contentId = typeof input.contentId === 'string' ? input.contentId.trim() : '';
  const body = typeof input.body === 'string' ? input.body.trim() : '';
  const sessionId = input.sessionId === undefined || input.sessionId === null ? null : typeof input.sessionId === 'string' ? input.sessionId.trim() : undefined;
  const anchor = input.anchor === undefined || input.anchor === null ? null : typeof input.anchor === 'string' ? input.anchor.trim() : undefined;
  if (!contentId || contentId.length > 128 || !body || body.length > 10_000 || sessionId === undefined || (sessionId !== null && !sessionId) || (anchor !== null && (anchor === undefined || anchor.length > 500))) return null;
  return { contentId, sessionId, body, anchor };
}

export function parseBookmarkInput(value: unknown): BookmarkInput | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  const contentId = typeof input.contentId === 'string' ? input.contentId.trim() : '';
  const sessionId = input.sessionId === undefined || input.sessionId === null ? null : typeof input.sessionId === 'string' ? input.sessionId.trim() : undefined;
  const label = input.label === undefined || input.label === null ? null : typeof input.label === 'string' ? input.label.trim() : undefined;
  if (!contentId || contentId.length > 128 || sessionId === undefined || (sessionId !== null && !sessionId) || (label !== null && (label === undefined || label.length > 160))) return null;
  return { contentId, sessionId, label };
}

export function parseNotePatch(value: unknown): Pick<NoteInput, 'body' | 'anchor'> | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  const body = typeof input.body === 'string' ? input.body.trim() : '';
  const anchor = input.anchor === undefined || input.anchor === null ? null : typeof input.anchor === 'string' ? input.anchor.trim() : undefined;
  if (!body || body.length > 10_000 || (anchor !== null && (anchor === undefined || anchor.length > 500))) return null;
  return { body, anchor };
}

export function createNotesBookmarksStore(db: DatabaseClient = createDatabaseClient(config)) {
  return {
    async listNotes(userId: string, filters: { contentId?: string | null; sessionId?: string | null } = {}): Promise<LearnerNote[]> {
      const clauses = ['user_id = $1']; const params: string[] = [userId];
      if (filters.contentId) { params.push(filters.contentId); clauses.push(`content_id = $${params.length}`); }
      if (filters.sessionId) { params.push(filters.sessionId); clauses.push(`session_id = $${params.length}`); }
      const result = await db.query<NoteRow>(`SELECT * FROM learner_notes WHERE ${clauses.join(' AND ')} ORDER BY updated_at DESC, id DESC`, params);
      return result.rows.map(mapNote);
    },
    async createNote(userId: string, input: NoteInput): Promise<LearnerNote | null> {
      const result = await db.query<NoteRow>(`INSERT INTO learner_notes (user_id, content_id, session_id, body, anchor)
        SELECT $1, $2, $3, $4, $5 WHERE $3::uuid IS NULL OR EXISTS (SELECT 1 FROM practice_sessions WHERE id = $3 AND user_id = $1)
        RETURNING *`, [userId, input.contentId, input.sessionId, input.body, input.anchor]);
      return result.rows[0] ? mapNote(result.rows[0]) : null;
    },
    async updateNote(id: string, userId: string, input: Pick<NoteInput, 'body' | 'anchor'>): Promise<LearnerNote | null> {
      const result = await db.query<NoteRow>('UPDATE learner_notes SET body = $3, anchor = $4, updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING *', [id, userId, input.body, input.anchor]);
      return result.rows[0] ? mapNote(result.rows[0]) : null;
    },
    async deleteNote(id: string, userId: string): Promise<boolean> {
      return (await db.query('DELETE FROM learner_notes WHERE id = $1 AND user_id = $2', [id, userId])).rowCount === 1;
    },
    async listBookmarks(userId: string, filters: { contentId?: string | null; sessionId?: string | null } = {}): Promise<LearnerBookmark[]> {
      const clauses = ['user_id = $1']; const params: string[] = [userId];
      if (filters.contentId) { params.push(filters.contentId); clauses.push(`content_id = $${params.length}`); }
      if (filters.sessionId) { params.push(filters.sessionId); clauses.push(`session_id = $${params.length}`); }
      const result = await db.query<BookmarkRow>(`SELECT * FROM learner_bookmarks WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC, id DESC`, params);
      return result.rows.map(mapBookmark);
    },
    async createBookmark(userId: string, input: BookmarkInput): Promise<LearnerBookmark | null> {
      const query = input.sessionId === null
        ? `INSERT INTO learner_bookmarks (user_id, content_id, session_id, label) VALUES ($1, $2, NULL, $3)
           ON CONFLICT (user_id, content_id) WHERE session_id IS NULL DO UPDATE SET label = EXCLUDED.label RETURNING *`
        : `INSERT INTO learner_bookmarks (user_id, content_id, session_id, label)
           SELECT $1, $2, $3, $4 WHERE EXISTS (SELECT 1 FROM practice_sessions WHERE id = $3 AND user_id = $1)
           ON CONFLICT (user_id, content_id, session_id) WHERE session_id IS NOT NULL DO UPDATE SET label = EXCLUDED.label RETURNING *`;
      const result = await db.query<BookmarkRow>(query, [userId, input.contentId, input.sessionId, input.label]);
      return result.rows[0] ? mapBookmark(result.rows[0]) : null;
    },
    async deleteBookmark(id: string, userId: string): Promise<boolean> {
      return (await db.query('DELETE FROM learner_bookmarks WHERE id = $1 AND user_id = $2', [id, userId])).rowCount === 1;
    },
  };
}
