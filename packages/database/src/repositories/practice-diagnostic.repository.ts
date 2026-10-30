import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import {
  buildDiagnosticSnapshot, DIAGNOSTIC_SELECTION_VERSION, freezeMultipleChoiceAnswers,
  scoreMultipleChoiceQuiz, toLearnerQuestion,
  type LearnerQuestion, type MultipleChoiceQuizScore, type MultipleChoiceQuizSnapshot, type QuestionVersion, type QuizAnswers,
} from '@leetcode-app/domain';
import type { DatabaseClient } from '../client.js';

export class DiagnosticAccessError extends Error {}
export class DiagnosticConflictError extends Error { constructor(readonly code = 'revision_changed') { super('The saved diagnostic changed. Compare your choices before trying again.'); } }
export class DiagnosticValidationError extends Error {}
export type DiagnosticAnswerDraft = { revision: number; answers: QuizAnswers; updatedAt: string };
export type DiagnosticSubmissionReceipt = { diagnosticId: string; requestKey: string; answerRevision: number; submittedAt: string };
export type DiagnosticFeedback = {
  answeredCount: number; correctCount: number; totalQuestions: number;
  items: { questionVersionId: string; selectedOptionId: string | null; correct: boolean; correctOptionId: string; explanation: string }[];
};
export type DiagnosticView = {
  id: string; selectionVersion: string; createdAt: string;
  questions: readonly LearnerQuestion[]; answerDraft: DiagnosticAnswerDraft;
  submission: DiagnosticSubmissionReceipt | null; feedback: DiagnosticFeedback | null;
};
export type DiagnosticHistory = { id: string; selectionVersion: string; submittedAt: string; answeredCount: number; correctCount: number; totalQuestions: number };
export type DiagnosticSaveReceipt = { diagnosticId: string; requestKey: string; answerDraft: DiagnosticAnswerDraft; currentRevision: number };
type Row = {
  id: string; user_id: string; selection_version: string; snapshot: MultipleChoiceQuizSnapshot; answers: QuizAnswers;
  answer_revision: number; created_at: Date; updated_at: Date; result: MultipleChoiceQuizScore | null;
  submit_request_key: string | null; submitted_at: Date | null;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const id = (value: string) => { if (typeof value !== 'string' || !uuid.test(value)) throw new DiagnosticAccessError(); return value.toLowerCase(); };
const key = (value: string) => { if (typeof value !== 'string' || !uuid.test(value)) throw new DiagnosticValidationError('Use a valid request key.'); return value.toLowerCase(); };
const revision = (value: number) => { if (!Number.isSafeInteger(value) || value < 0) throw new DiagnosticValidationError('Use a valid saved revision.'); return value; };
const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const iso = (value: Date | string) => new Date(value).toISOString();
const draft = (row: Row): DiagnosticAnswerDraft => ({ revision: row.answer_revision, answers: row.answers, updatedAt: iso(row.updated_at) });

/** Private practice work. No class publication, academic grade or browser role can write these rows. */
export class PostgresPracticeDiagnosticRepository {
  private readonly userId: string;
  constructor(private readonly db: DatabaseClient, userId: string, private readonly blueprint: {
    questions: readonly QuestionVersion[]; activityIds: readonly string[]; version?: string;
  }) { this.userId = id(userId); }

  private async lock(client: PoolClient) {
    if (!(await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [this.userId])).rowCount) throw new DiagnosticAccessError();
  }
  private async row(client: PoolClient, diagnosticId: string): Promise<Row> {
    const result = await client.query<Row>('SELECT * FROM practice_diagnostics WHERE user_id=$1 AND id=$2 FOR UPDATE', [this.userId, id(diagnosticId)]);
    if (!result.rows[0]) throw new DiagnosticAccessError();
    return result.rows[0];
  }
  private view(row: Row): DiagnosticView {
    const submission = row.submitted_at && row.submit_request_key ? { diagnosticId: row.id, requestKey: row.submit_request_key, answerRevision: row.answer_revision, submittedAt: iso(row.submitted_at) } : null;
    return {
      id: row.id, selectionVersion: row.selection_version, createdAt: iso(row.created_at),
      questions: row.snapshot.questions.map(item => toLearnerQuestion(item.question)), answerDraft: draft(row), submission,
      feedback: submission && row.result ? {
        answeredCount: row.result.answeredCount, correctCount: row.result.correctCount, totalQuestions: row.result.totalQuestions,
        items: row.result.items.map(item => {
          const question = row.snapshot.questions.find(selected => selected.question.versionId === item.questionVersionId)!.question;
          return { questionVersionId: item.questionVersionId, selectedOptionId: item.selectedOptionId, correct: item.correct,
            correctOptionId: question.correctOptionId, explanation: question.explanation };
        }),
      } : null,
    };
  }
  private async prior<T>(client: PoolClient, requestKey: string, expected: string): Promise<T | null> {
    const row = (await client.query<{ input_fingerprint: string; response: T }>('SELECT input_fingerprint,response FROM practice_diagnostic_requests WHERE user_id=$1 AND request_key=$2', [this.userId, requestKey])).rows[0];
    if (!row) return null;
    if (row.input_fingerprint !== expected) throw new DiagnosticConflictError('request_reused');
    return row.response;
  }
  private async receipt(client: PoolClient, row: Row, operation: 'save' | 'submit', requestKey: string, input: string, response: unknown) {
    const count = await client.query<{ count: string }>('SELECT count(*)::text AS count FROM practice_diagnostic_requests WHERE diagnostic_id=$1', [row.id]);
    if (operation === 'save' && Number(count.rows[0].count) >= 500) throw new DiagnosticValidationError('This diagnostic has reached its save limit. Your last saved answers are preserved. You can still submit them.');
    await client.query('INSERT INTO practice_diagnostic_requests(user_id,request_key,diagnostic_id,operation,input_fingerprint,response) VALUES($1,$2,$3,$4,$5,$6)', [this.userId, requestKey, row.id, operation, input, JSON.stringify(response)]);
  }

  async list(): Promise<{ current: DiagnosticView | null; history: DiagnosticHistory[] }> {
    return this.db.transaction(async client => {
      await this.lock(client);
      const current = (await client.query<Row>('SELECT * FROM practice_diagnostics WHERE user_id=$1 AND selection_version=$2', [this.userId, this.blueprint.version ?? DIAGNOSTIC_SELECTION_VERSION])).rows[0];
      const history = await client.query<Row>('SELECT * FROM practice_diagnostics WHERE user_id=$1 AND submitted_at IS NOT NULL ORDER BY submitted_at DESC,id LIMIT 10', [this.userId]);
      return { current: current ? this.view(current) : null, history: history.rows.map(row => ({ id: row.id, selectionVersion: row.selection_version,
        submittedAt: iso(row.submitted_at!), answeredCount: row.result!.answeredCount, correctCount: row.result!.correctCount, totalQuestions: row.result!.totalQuestions })) };
    });
  }
  async read(diagnosticId: string): Promise<DiagnosticView> {
    return this.db.transaction(async client => { await this.lock(client); return this.view(await this.row(client, diagnosticId)); });
  }
  async start(): Promise<DiagnosticView> {
    return this.db.transaction(async client => {
      await this.lock(client);
      const version = this.blueprint.version ?? DIAGNOSTIC_SELECTION_VERSION;
      const previous = (await client.query<Row>('SELECT * FROM practice_diagnostics WHERE user_id=$1 AND selection_version=$2 FOR UPDATE', [this.userId, version])).rows[0];
      if (previous) return this.view(previous);
      const snapshot = buildDiagnosticSnapshot(this.blueprint.questions, this.blueprint.activityIds);
      const answers = freezeMultipleChoiceAnswers(snapshot, {});
      const created = await client.query<Row>(`INSERT INTO practice_diagnostics(user_id,selection_version,snapshot,snapshot_hash,answers)
        VALUES($1,$2,$3::jsonb,encode(sha256(convert_to(($3::jsonb)::text,'UTF8')),'hex'),$4) RETURNING *`, [this.userId, version, JSON.stringify(snapshot), JSON.stringify(answers)]);
      return this.view(created.rows[0]);
    });
  }
  async save(diagnosticId: string, input: { expectedRevision: number; answers: unknown; requestKey: string }): Promise<DiagnosticSaveReceipt> {
    const requestKey = key(input.requestKey); revision(input.expectedRevision);
    return this.db.transaction(async client => {
      await this.lock(client);
      const row = await this.row(client, diagnosticId);
      let answers: QuizAnswers;
      try { answers = freezeMultipleChoiceAnswers(row.snapshot, input.answers); } catch { throw new DiagnosticValidationError('Use valid answers for this diagnostic.'); }
      const expected = fingerprint(['save', row.id, input.expectedRevision, answers]);
      const previous = await this.prior<DiagnosticSaveReceipt>(client, requestKey, expected);
      if (previous) return { ...previous, currentRevision: row.answer_revision };
      if (row.result) throw new DiagnosticConflictError('submitted');
      if (row.answer_revision !== input.expectedRevision) throw new DiagnosticConflictError();
      const updated = (await client.query<Row>('UPDATE practice_diagnostics SET answers=$3,answer_revision=answer_revision+1,updated_at=clock_timestamp() WHERE user_id=$1 AND id=$2 RETURNING *', [this.userId, row.id, JSON.stringify(answers)])).rows[0];
      const receipt: DiagnosticSaveReceipt = { diagnosticId: row.id, requestKey, answerDraft: draft(updated), currentRevision: updated.answer_revision };
      await this.receipt(client, row, 'save', requestKey, expected, receipt);
      return receipt;
    });
  }
  async submit(diagnosticId: string, input: { expectedRevision: number; requestKey: string }): Promise<DiagnosticSubmissionReceipt> {
    const requestKey = key(input.requestKey); revision(input.expectedRevision);
    return this.db.transaction(async client => {
      await this.lock(client);
      const row = await this.row(client, diagnosticId);
      const expected = fingerprint(['submit', row.id, input.expectedRevision]);
      const previous = await this.prior<DiagnosticSubmissionReceipt>(client, requestKey, expected);
      if (previous) return previous;
      if (row.result) throw new DiagnosticConflictError('submitted');
      if (row.answer_revision !== input.expectedRevision) throw new DiagnosticConflictError();
      const result = scoreMultipleChoiceQuiz(row.snapshot, row.answers);
      const saved = (await client.query<Row>('UPDATE practice_diagnostics SET result=$3,submit_request_key=$4,submitted_at=clock_timestamp(),updated_at=clock_timestamp() WHERE user_id=$1 AND id=$2 RETURNING *', [this.userId, row.id, JSON.stringify(result), requestKey])).rows[0];
      const receipt: DiagnosticSubmissionReceipt = { diagnosticId: row.id, requestKey, answerRevision: saved.answer_revision, submittedAt: iso(saved.submitted_at!) };
      await this.receipt(client, row, 'submit', requestKey, expected, receipt);
      return receipt;
    });
  }
}
