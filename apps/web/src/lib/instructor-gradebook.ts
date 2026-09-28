import 'server-only';

import {
  createDatabaseClient,
  databaseConfigFromEnv,
  GradebookAccessError,
  GradebookConflictError,
  PostgresGradebookRepository,
} from '@leetcode-app/database';

import { getSession } from '@/lib/auth/session';

export class InstructorGradebookAuthError extends Error {
  constructor(readonly status: 401 | 403) {
    super(status === 401 ? 'Authentication required' : 'Instructor access required');
    this.name = 'InstructorGradebookAuthError';
  }
}

export class InstructorGradebookValidationError extends Error {
  constructor() {
    super('Invalid request');
    this.name = 'InstructorGradebookValidationError';
  }
}

export async function withInstructorGradebook<T>(
  operation: (repository: PostgresGradebookRepository) => Promise<T>,
): Promise<T> {
  const session = await getSession();
  if (!session) throw new InstructorGradebookAuthError(401);
  const db = createDatabaseClient(databaseConfigFromEnv());
  try {
    const result = await db.query<{ role: string }>('SELECT role FROM users WHERE id = $1', [session.user.id]);
    if (!['instructor', 'admin'].includes(result.rows[0]?.role)) throw new InstructorGradebookAuthError(403);
    return await operation(new PostgresGradebookRepository(db, { role: 'instructor', userId: session.user.id }));
  } finally {
    await db.close();
  }
}

export function instructorGradebookError(error: unknown): { status: number; body: { error: string } } {
  if (error instanceof InstructorGradebookAuthError) return { status: error.status, body: { error: error.message } };
  if (error instanceof InstructorGradebookValidationError || error instanceof SyntaxError) return { status: 400, body: { error: 'Invalid request' } };
  if (error instanceof GradebookAccessError) return { status: 404, body: { error: 'Submission not found' } };
  if (error instanceof GradebookConflictError) return { status: 409, body: { error: 'Submission changed; refresh and try again' } };
  if (error instanceof Error && /required|invalid|unsupported|score|criterion|nonempty|uuid/i.test(error.message)) {
    return { status: 400, body: { error: 'Invalid request' } };
  }
  return { status: 500, body: { error: 'Unable to update the gradebook' } };
}

export function exactRecord(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InstructorGradebookValidationError();
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some(key => !fields.includes(key))) throw new InstructorGradebookValidationError();
  return record;
}

export function requiredString(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw new InstructorGradebookValidationError();
  return value.trim();
}

export function optionalUuid(value: unknown): string | null {
  if (value === null) return null;
  const result = requiredString(value, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) throw new InstructorGradebookValidationError();
  return result;
}

