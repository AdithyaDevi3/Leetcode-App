import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ session: vi.fn(), query: vi.fn(), close: vi.fn(), create: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
vi.mock('@/lib/auth/session', () => ({ getSession: mocks.session }));
vi.mock('@leetcode-app/database', () => ({ createDatabaseClient: mocks.create, databaseConfigFromEnv: () => ({}) }));
import { enableInstructor } from './actions';

describe('instructor opt-in', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({ user: { id: 'verified-user' } });
    mocks.create.mockReturnValue({ close: mocks.close, transaction: async (callback: (client: { query: typeof mocks.query }) => unknown) => callback({ query: mocks.query }) });
  });
  it('requires authentication before changing any role', async () => {
    mocks.session.mockResolvedValue(null);
    await expect(enableInstructor()).rejects.toThrow('redirect:/auth');
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('only promotes the verified learner to instructor and audits it', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ id: 'verified-user' }] }).mockResolvedValueOnce({ rows: [] });
    await expect(enableInstructor()).rejects.toThrow('redirect:/teach');
    expect(mocks.query).toHaveBeenNthCalledWith(1, "UPDATE users SET role = 'instructor' WHERE id = $1 AND role = 'learner' RETURNING id", ['verified-user']);
    expect(mocks.query).toHaveBeenNthCalledWith(2, expect.stringContaining('instructor.enroll'), ['verified-user']);
    expect(mocks.close).toHaveBeenCalledOnce();
  });
  it('does not replace an existing privileged role or create duplicate audit events', async () => {
    mocks.query.mockResolvedValue({ rows: [] });
    await expect(enableInstructor()).rejects.toThrow('redirect:/teach');
    expect(mocks.query).toHaveBeenCalledOnce();
  });
});
