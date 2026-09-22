import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), query: vi.fn(), close: vi.fn(), constructor: vi.fn(), create: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/session', () => ({ getSession: mocks.getSession }));
vi.mock('@leetcode-app/database', () => ({
  databaseConfigFromEnv: () => ({}),
  createDatabaseClient: mocks.create,
  PostgresClassroomRepository: class { constructor(...args: unknown[]) { mocks.constructor(...args); } },
}));
import { readInstructorData } from './instructor-access';

describe('instructor authorization', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.create.mockReturnValue({ query: mocks.query, close: mocks.close });
    mocks.getSession.mockResolvedValue({ user: { id: 'verified-user' } });
  });
  it('rejects signed-out requests before connecting to the database', async () => {
    mocks.getSession.mockResolvedValue(null);
    const read = vi.fn();
    expect(await readInstructorData(read)).toEqual({ status: 'unauthenticated' });
    expect(read).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each(['learner', 'guest', 'administrator', undefined])('rejects a database role of %s', async role => {
    mocks.query.mockResolvedValue({ rows: role ? [{ role }] : [] });
    const read = vi.fn();
    expect(await readInstructorData(read)).toEqual({ status: 'forbidden' });
    expect(read).not.toHaveBeenCalled();
    expect(mocks.constructor).not.toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalledOnce();
  });
  it.each(['instructor', 'admin'])('scopes even %s reads to the verified owner', async role => {
    mocks.query.mockResolvedValue({ rows: [{ role }] });
    expect(await readInstructorData(async () => ['class'])).toEqual({ status: 'authorized', data: ['class'] });
    expect(mocks.query).toHaveBeenCalledWith('SELECT role FROM users WHERE id = $1', ['verified-user']);
    expect(mocks.constructor).toHaveBeenCalledWith(expect.any(Object), 'verified-user');
    expect(mocks.close).toHaveBeenCalledOnce();
  });
  it('closes the connection when a class operation fails', async () => {
    mocks.query.mockResolvedValue({ rows: [{ role: 'instructor' }] });
    await expect(readInstructorData(async () => { throw new Error('unavailable'); })).rejects.toThrow('unavailable');
    expect(mocks.close).toHaveBeenCalledOnce();
  });
});
