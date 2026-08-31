import { describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const query = vi.fn();
const close = vi.fn();

vi.mock('@leetcode-app/database', () => ({
  createDatabaseClient: () => ({ query, close }),
  databaseConfigFromEnv: () => ({}),
}));

vi.mock('@/lib/supabase/config', () => ({
  isSupabaseConfigured: vi.fn(() => true),
}));

describe('GET /api/health/ready', () => {
  it('reports readiness when configuration and database are available', async () => {
    query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'ready',
      checks: { supabase: 'configured', database: 'reachable' },
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it('returns 503 when the database cannot be reached', async () => {
    query.mockRejectedValueOnce(new Error('connection refused'));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: 'not_ready',
      checks: { supabase: 'configured', database: 'unreachable' },
    });
    expect(close).toHaveBeenCalled();
  });
});
