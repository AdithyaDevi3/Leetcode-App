import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/session', () => ({ getSession }));
vi.mock('@/lib/supabase/config', () => ({ isSupabaseConfigured: () => false }));
vi.mock('@leetcode-app/database', () => ({
  createDatabaseClient: vi.fn(),
  databaseConfigFromEnv: vi.fn(),
  PostgresAdministrationRepository: vi.fn(),
}));

import { getAdministrationAccess } from './authorization';

describe('administration authorization boundary', () => {
  beforeEach(() => getSession.mockReset());

  it('fails closed as signed out when Supabase is not configured', async () => {
    await expect(getAdministrationAccess()).resolves.toEqual({ status: 'unauthenticated' });
    expect(getSession).not.toHaveBeenCalled();
  });
});
