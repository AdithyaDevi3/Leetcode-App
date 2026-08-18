import type { PoolClient } from 'pg';
import type { Evaluation, EvaluationFinding } from '@leetcode-app/domain';
import { DatabaseClient } from '../client.js';
import { Repository, EntityNotFoundError } from './base.js';

export interface EvaluationRepository extends Repository<Evaluation> {
  findByAttempt(attemptId: string, client?: PoolClient): Promise<Evaluation | null>;
  getFindings(evaluationId: string, client?: PoolClient): Promise<EvaluationFinding[]>;
  createFinding(evaluationId: string, finding: EvaluationFinding, client?: PoolClient): Promise<EvaluationFinding>;
}

export class PostgresEvaluationRepository implements EvaluationRepository {
  constructor(private db: DatabaseClient) {}

  async findById(id: string, client?: PoolClient): Promise<Evaluation | null> {
    const executor = client || this.db.getPool();
    const result = await executor.query<Evaluation>(
      'SELECT * FROM evaluations WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  async findByAttempt(attemptId: string, client?: PoolClient): Promise<Evaluation | null> {
    const executor = client || this.db.getPool();
    const result = await executor.query<Evaluation>(
      'SELECT * FROM evaluations WHERE attempt_id = $1',
      [attemptId]
    );
    return result.rows[0] || null;
  }

  async findAll(client?: PoolClient): Promise<Evaluation[]> {
    const executor = client || this.db.getPool();
    const result = await executor.query<Evaluation>(
      'SELECT * FROM evaluations ORDER BY created_at DESC'
    );
    return result.rows;
  }

  async create(evaluation: Omit<Evaluation, 'id' | 'createdAt'>, client?: PoolClient): Promise<Evaluation> {
    const executor = client || this.db.getPool();
    const result = await executor.query<Evaluation>(
      `INSERT INTO evaluations 
       (attempt_id, rubric_version, status, overall_score, overall_feedback, evaluated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        evaluation.attemptId,
        evaluation.rubricVersion,
        evaluation.status,
        evaluation.overallScore,
        evaluation.overallFeedback,
        evaluation.evaluatedAt,
      ]
    );
    return result.rows[0];
  }

  async update(id: string, evaluation: Partial<Evaluation>, _revision: number, client?: PoolClient): Promise<Evaluation> {
    const executor = client || this.db.getPool();
    
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (evaluation.status !== undefined) {
      updates.push(`status = $${paramCount++}`);
      values.push(evaluation.status);
    }
    if (evaluation.overallScore !== undefined) {
      updates.push(`overall_score = $${paramCount++}`);
      values.push(evaluation.overallScore);
    }
    if (evaluation.overallFeedback !== undefined) {
      updates.push(`overall_feedback = $${paramCount++}`);
      values.push(evaluation.overallFeedback);
    }
    if (evaluation.evaluatedAt !== undefined) {
      updates.push(`evaluated_at = $${paramCount++}`);
      values.push(evaluation.evaluatedAt);
    }

    if (updates.length === 0) {
      const existing = await this.findById(id, client);
      if (!existing) throw new EntityNotFoundError('Evaluation', id);
      return existing;
    }

    values.push(id);

    const result = await executor.query<Evaluation>(
      `UPDATE evaluations
       SET ${updates.join(', ')}
       WHERE id = $${paramCount++}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new EntityNotFoundError('Evaluation', id);
    }

    return result.rows[0];
  }

  async delete(id: string, client?: PoolClient): Promise<void> {
    const executor = client || this.db.getPool();
    await executor.query('DELETE FROM evaluations WHERE id = $1', [id]);
  }

  async getFindings(evaluationId: string, client?: PoolClient): Promise<EvaluationFinding[]> {
    const executor = client || this.db.getPool();
    const result = await executor.query<EvaluationFinding>(
      'SELECT * FROM evaluation_findings WHERE evaluation_id = $1',
      [evaluationId]
    );
    return result.rows;
  }

  async createFinding(evaluationId: string, finding: EvaluationFinding, client?: PoolClient): Promise<EvaluationFinding> {
    const executor = client || this.db.getPool();
    const result = await executor.query<EvaluationFinding>(
      `INSERT INTO evaluation_findings 
       (evaluation_id, criterion_id, score, feedback, code_snippet, line_range_start, line_range_end)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        evaluationId,
        finding.criterionId,
        finding.score,
        finding.feedback,
        finding.codeSnippet,
        finding.lineRange?.start,
        finding.lineRange?.end,
      ]
    );
    return result.rows[0];
  }
}
