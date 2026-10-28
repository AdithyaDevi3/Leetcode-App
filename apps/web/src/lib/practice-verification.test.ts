import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CodeGrade } from './code-grading';
const mocks = vi.hoisted(() => ({ query: vi.fn(), close: vi.fn(), database: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@leetcode-app/database', () => ({ createDatabaseClient: mocks.database, databaseConfigFromEnv: () => ({}) }));
vi.mock('./review-store', () => ({ createReviewStore: vi.fn() }));
import { beginPracticeVerification, finishPracticeVerification } from './practice-verification';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.database.mockReturnValue({ close: mocks.close, transaction: async (operation: (client: unknown) => unknown) => operation({ query: mocks.query }) });
  mocks.query.mockImplementation(async (sql: string) => sql.includes('FROM users') ? { rows: [{ id: 'owner' }], rowCount: 1 } : { rows: [], rowCount: 0 });
});
describe('practice learning capture lock ordering', () => {
  it.each(['begin', 'finish'] as const)('locks the user parent before the %s session to avoid user-delete cycles', async operation => {
    const input = { owner: { kind: 'user' as const, id: 'owner' }, sessionId: 'session' };
    const result = operation === 'begin' ? beginPracticeVerification({ ...input, source: 'code', language: 'python' })
      : finishPracticeVerification({ ...input, requestId: 'reserved', grade: {} as CodeGrade });
    await expect(result).rejects.toThrow('Practice session not found');
    expect(mocks.query.mock.calls[0][0]).toMatch(/FROM users.*FOR UPDATE/);
    expect(mocks.query.mock.calls[0][1]).toEqual(['owner']);
    expect(mocks.query.mock.calls[1][0]).toMatch(/FROM practice_sessions/); expect(mocks.close).toHaveBeenCalledOnce();
  });
  it('does not acquire an account lock for guest sessions', async () => {
    await expect(beginPracticeVerification({ owner: { kind: 'guest', id: 'guest' }, sessionId: 'session', source: 'code', language: 'python' })).rejects.toThrow();
    expect(mocks.query.mock.calls[0][0]).toMatch(/FROM practice_sessions/); expect(mocks.query.mock.calls[0][0]).toContain('guest_id');
  });
  it('stops before the child session if its account parent was deleted', async () => {
    mocks.query.mockResolvedValue({ rows: [], rowCount: 0 });
    await expect(beginPracticeVerification({ owner: { kind: 'user', id: 'deleted' }, sessionId: 'session', source: 'code', language: 'python' })).rejects.toThrow('Practice session not found');
    expect(mocks.query).toHaveBeenCalledOnce();
  });
});
