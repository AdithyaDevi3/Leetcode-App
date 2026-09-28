import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GradebookAccessError, GradebookConflictError } from '@leetcode-app/database';

const getSession = vi.fn();
const query = vi.fn();
const close = vi.fn();
const listManualReviewInbox = vi.fn();

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/session', () => ({ getSession }));
vi.mock('@leetcode-app/database', async (importOriginal) => {
  const original = await importOriginal<typeof import('@leetcode-app/database')>();
  return {
    ...original,
    databaseConfigFromEnv: vi.fn(() => ({})),
    createDatabaseClient: vi.fn(() => ({ query, close })),
    PostgresGradebookRepository: class { listManualReviewInbox = listManualReviewInbox; },
  };
});

describe('instructor gradebook access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({ user: { id: '11111111-1111-4111-8111-111111111111' } });
    query.mockResolvedValue({ rows: [{ role: 'instructor' }] });
  });

  it('uses the authenticated durable instructor role and always closes the database', async () => {
    listManualReviewInbox.mockResolvedValue({ items: [], nextCursor: null });
    const { withInstructorGradebook } = await import('./instructor-gradebook');
    await expect(withInstructorGradebook(repository => repository.listManualReviewInbox({ classId: '22222222-2222-4222-8222-222222222222' })))
      .resolves.toEqual({ items: [], nextCursor: null });
    expect(query).toHaveBeenCalledWith('SELECT role FROM users WHERE id = $1', ['11111111-1111-4111-8111-111111111111']);
    expect(close).toHaveBeenCalledOnce();
  });

  it('rejects learners before invoking a gradebook operation', async () => {
    query.mockResolvedValue({ rows: [{ role: 'learner' }] });
    const { withInstructorGradebook } = await import('./instructor-gradebook');
    await expect(withInstructorGradebook(repository => repository.listManualReviewInbox({ classId: '22222222-2222-4222-8222-222222222222' })))
      .rejects.toMatchObject({ status: 403 });
    expect(listManualReviewInbox).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });

  it('maps resource and concurrency failures without exposing internal details', async () => {
    const { instructorGradebookError } = await import('./instructor-gradebook');
    expect(instructorGradebookError(new GradebookAccessError())).toEqual({ status: 404, body: { error: 'Submission not found' } });
    expect(instructorGradebookError(new GradebookConflictError())).toEqual({ status: 409, body: { error: 'Submission changed; refresh and try again' } });
    expect(instructorGradebookError(new Error('database details'))).toEqual({ status: 500, body: { error: 'Unable to update the gradebook' } });
  });
});
