import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ configured: vi.fn(), create: vi.fn(), user: vi.fn(), database: vi.fn(), query: vi.fn(), close: vi.fn() }));
vi.mock('@/lib/supabase/config', () => ({ isSupabaseConfigured: mocks.configured }));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: mocks.create }));
vi.mock('@leetcode-app/database', () => ({ createDatabaseClient: mocks.database, databaseConfigFromEnv: () => ({}) }));
import { getSession } from './session';

describe('verified application sessions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.configured.mockReturnValue(true);
    mocks.create.mockResolvedValue({ auth: { getUser: mocks.user } });
    mocks.database.mockReturnValue({ query: mocks.query, close: mocks.close });
  });
  it('keeps unconfigured local and CI environments signed out', async () => {
    mocks.configured.mockReturnValue(false);
    expect(await getSession()).toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.database).not.toHaveBeenCalled();
  });
  it('requires a verified Supabase user before accessing application data', async () => {
    mocks.user.mockResolvedValue({ data: { user: null } });
    expect(await getSession()).toBeNull();
    expect(mocks.database).not.toHaveBeenCalled();
  });
  it('creates the application identity from the verified user without trusting a metadata role', async () => {
    mocks.user.mockResolvedValue({ data: { user: { id: 'verified-user', email: 'learner@example.test', user_metadata: { role: 'admin', display_name: 'Learner' } } } });
    expect(await getSession()).toEqual({ user: { id: 'verified-user', email: 'learner@example.test', displayName: 'Learner', role: 'learner' } });
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("VALUES ($1, $2, $3, 'learner')"), ['verified-user', 'learner@example.test', 'Learner']);
    expect(mocks.close).toHaveBeenCalledOnce();
  });
});
