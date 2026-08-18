import type { PoolClient } from 'pg';
import type { ContentItem, ContentVersion, RubricVersion } from '@leetcode-app/domain';
import { DatabaseClient } from '../client.js';
import { Repository, EntityNotFoundError, OptimisticConcurrencyError } from './base.js';

export interface ContentRepository extends Repository<ContentItem> {
  findBySlug(slug: string, client?: PoolClient): Promise<ContentItem | null>;
  getLatestVersion(contentId: string, client?: PoolClient): Promise<ContentVersion | null>;
  getVersion(contentId: string, version: number, client?: PoolClient): Promise<ContentVersion | null>;
  createVersion(contentId: string, version: ContentVersion, client?: PoolClient): Promise<ContentVersion>;
  getLatestRubric(contentId: string, client?: PoolClient): Promise<RubricVersion | null>;
  getRubric(contentId: string, version: number, client?: PoolClient): Promise<RubricVersion | null>;
  createRubric(contentId: string, rubric: RubricVersion, client?: PoolClient): Promise<RubricVersion>;
}

export class PostgresContentRepository implements ContentRepository {
  constructor(private db: DatabaseClient) {}

  async findById(id: string, client?: PoolClient): Promise<ContentItem | null> {
    const executor = client || this.db.getPool();
    const result = await executor.query<ContentItem>(
      'SELECT * FROM content_items WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  async findBySlug(slug: string, client?: PoolClient): Promise<ContentItem | null> {
    const executor = client || this.db.getPool();
    const result = await executor.query<ContentItem>(
      'SELECT * FROM content_items WHERE slug = $1',
      [slug]
    );
    return result.rows[0] || null;
  }

  async findAll(client?: PoolClient): Promise<ContentItem[]> {
    const executor = client || this.db.getPool();
    const result = await executor.query<ContentItem>(
      'SELECT * FROM content_items ORDER BY created_at DESC'
    );
    return result.rows;
  }

  async create(content: Omit<ContentItem, 'id' | 'createdAt' | 'updatedAt'>, client?: PoolClient): Promise<ContentItem> {
    const executor = client || this.db.getPool();
    const result = await executor.query<ContentItem>(
      `INSERT INTO content_items (slug, type, status, difficulty, estimated_minutes, tags)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [content.slug, content.type, content.status, content.difficulty, content.estimatedMinutes, content.tags]
    );
    return result.rows[0];
  }

  async update(id: string, content: Partial<ContentItem>, revision: number, client?: PoolClient): Promise<ContentItem> {
    const executor = client || this.db.getPool();
    
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (content.status !== undefined) {
      updates.push(`status = $${paramCount++}`);
      values.push(content.status);
    }
    if (content.difficulty !== undefined) {
      updates.push(`difficulty = $${paramCount++}`);
      values.push(content.difficulty);
    }
    if (content.estimatedMinutes !== undefined) {
      updates.push(`estimated_minutes = $${paramCount++}`);
      values.push(content.estimatedMinutes);
    }
    if (content.tags !== undefined) {
      updates.push(`tags = $${paramCount++}`);
      values.push(content.tags);
    }

    if (updates.length === 0) {
      const existing = await this.findById(id, client);
      if (!existing) throw new EntityNotFoundError('ContentItem', id);
      return existing;
    }

    updates.push(`revision = revision + 1`);
    values.push(id, revision);

    const result = await executor.query<ContentItem>(
      `UPDATE content_items
       SET ${updates.join(', ')}
       WHERE id = $${paramCount++} AND revision = $${paramCount++}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new OptimisticConcurrencyError('ContentItem was modified by another transaction');
    }

    return result.rows[0];
  }

  async delete(id: string, client?: PoolClient): Promise<void> {
    const executor = client || this.db.getPool();
    await executor.query('DELETE FROM content_items WHERE id = $1', [id]);
  }

  async getLatestVersion(contentId: string, client?: PoolClient): Promise<ContentVersion | null> {
    const executor = client || this.db.getPool();
    const result = await executor.query<ContentVersion>(
      `SELECT * FROM content_versions
       WHERE content_id = $1
       ORDER BY version DESC
       LIMIT 1`,
      [contentId]
    );
    return result.rows[0] || null;
  }

  async getVersion(contentId: string, version: number, client?: PoolClient): Promise<ContentVersion | null> {
    const executor = client || this.db.getPool();
    const result = await executor.query<ContentVersion>(
      'SELECT * FROM content_versions WHERE content_id = $1 AND version = $2',
      [contentId, version]
    );
    return result.rows[0] || null;
  }

  async createVersion(contentId: string, version: ContentVersion, client?: PoolClient): Promise<ContentVersion> {
    const executor = client || this.db.getPool();
    const result = await executor.query<ContentVersion>(
      `INSERT INTO content_versions 
       (content_id, version, title, description, markdown_content, starter_code, solution_code, test_cases)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        contentId,
        version.version,
        version.title,
        version.description,
        version.markdownContent,
        version.starterCode,
        version.solutionCode,
        JSON.stringify(version.testCases),
      ]
    );
    return result.rows[0];
  }

  async getLatestRubric(contentId: string, client?: PoolClient): Promise<RubricVersion | null> {
    const executor = client || this.db.getPool();
    const result = await executor.query<RubricVersion>(
      `SELECT * FROM rubric_versions
       WHERE content_id = $1
       ORDER BY version DESC
       LIMIT 1`,
      [contentId]
    );
    return result.rows[0] || null;
  }

  async getRubric(contentId: string, version: number, client?: PoolClient): Promise<RubricVersion | null> {
    const executor = client || this.db.getPool();
    const result = await executor.query<RubricVersion>(
      'SELECT * FROM rubric_versions WHERE content_id = $1 AND version = $2',
      [contentId, version]
    );
    return result.rows[0] || null;
  }

  async createRubric(contentId: string, rubric: RubricVersion, client?: PoolClient): Promise<RubricVersion> {
    const executor = client || this.db.getPool();
    const result = await executor.query<RubricVersion>(
      `INSERT INTO rubric_versions (content_id, version, criteria)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [contentId, rubric.version, JSON.stringify(rubric.criteria)]
    );
    return result.rows[0];
  }
}
