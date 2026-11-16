import { createDatabaseClient, databaseConfigFromEnv, type DatabaseClient } from '@leetcode-app/database';
import { maxPersonalStudyDocumentBytes, personalStudyDocumentBucket, personalStudyDocumentContentTypes } from './study-documents-config';

const supportedTypes = new Set<string>(personalStudyDocumentContentTypes);
export { maxPersonalStudyDocumentBytes, personalStudyDocumentBucket } from './study-documents-config';

export type PersonalStudyDocument = { id: string; filename: string; contentType: string; byteSize: number; storagePath: string; createdAt: string };
type StoredDocument = { id: string; filename: string; content_type: string; byte_size: number; storage_path: string; created_at: Date };

function mapDocument(row: StoredDocument): PersonalStudyDocument {
  return { id: row.id, filename: row.filename, contentType: row.content_type, byteSize: row.byte_size, storagePath: row.storage_path, createdAt: row.created_at.toISOString() };
}

export function parseStudyDocumentInput(value: unknown, userId: string): { filename: string; contentType: string; byteSize: number; storagePath: string } | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (typeof item.filename !== 'string' || typeof item.contentType !== 'string' || typeof item.byteSize !== 'number' || typeof item.storagePath !== 'string') return null;
  const filename = item.filename.trim();
  if (!filename || filename.length > 180 || !supportedTypes.has(item.contentType) || !Number.isInteger(item.byteSize) || item.byteSize < 1 || item.byteSize > maxPersonalStudyDocumentBytes) return null;
  const filenamePart = item.storagePath.slice(userId.length + 1);
  if (!item.storagePath.startsWith(`${userId}/`) || !/^[0-9a-f-]{36}$/.test(filenamePart)) return null;
  return { filename, contentType: item.contentType, byteSize: item.byteSize, storagePath: item.storagePath };
}

export function createStudyDocumentStore(db: DatabaseClient = createDatabaseClient(databaseConfigFromEnv())) {
  return {
    async list(userId: string): Promise<PersonalStudyDocument[]> {
      const result = await db.query<StoredDocument>('SELECT id, filename, content_type, byte_size, storage_path, created_at FROM personal_study_documents WHERE user_id = $1 ORDER BY created_at DESC, id DESC', [userId]);
      return result.rows.map(mapDocument);
    },
    async create(userId: string, input: { filename: string; contentType: string; byteSize: number; storagePath: string }): Promise<PersonalStudyDocument> {
      const result = await db.query<StoredDocument>('INSERT INTO personal_study_documents (user_id, filename, content_type, byte_size, storage_path) VALUES ($1, $2, $3, $4, $5) RETURNING id, filename, content_type, byte_size, storage_path, created_at', [userId, input.filename, input.contentType, input.byteSize, input.storagePath]);
      return mapDocument(result.rows[0]);
    },
    async remove(userId: string, documentId: string): Promise<PersonalStudyDocument | null> {
      const result = await db.query<StoredDocument>('DELETE FROM personal_study_documents WHERE id = $1 AND user_id = $2 RETURNING id, filename, content_type, byte_size, storage_path, created_at', [documentId, userId]);
      return result.rows[0] ? mapDocument(result.rows[0]) : null;
    },
  };
}
