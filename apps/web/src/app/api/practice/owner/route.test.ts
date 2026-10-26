import { beforeEach, describe, expect, it, vi } from 'vitest';
const getPracticeOwner = vi.fn();
vi.mock('@/lib/auth/session', () => ({ getPracticeOwner }));
beforeEach(() => { getPracticeOwner.mockReset(); });
describe('practice identity', () => {
  it('returns only the verified public owner key and prevents caching', async () => {
    getPracticeOwner.mockResolvedValue({ kind: 'guest', id: 'guest-1' });
    const { GET } = await import('./route');
    const response = await GET();
    expect(await response.json()).toEqual({ owner: { kind: 'guest', id: 'guest-1' } });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
  it('does not mistake unavailable authentication for a guest identity', async () => {
    getPracticeOwner.mockRejectedValue(new Error('unavailable'));
    const { GET } = await import('./route');
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).not.toHaveProperty('owner');
  });
});
