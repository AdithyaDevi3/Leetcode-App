import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ session: vi.fn(), administration: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ getSession: mocks.session }));
vi.mock('@/lib/admin/authorization', () => ({ getAdministrationAccess: mocks.administration }));
import { GET } from './route';

beforeEach(() => { vi.resetAllMocks(); mocks.administration.mockResolvedValue({ status: 'forbidden' }); });
describe('verified viewer identity', () => {
  it('returns a real guest state with private/no-store headers', async () => {
    mocks.session.mockResolvedValue(null); const response = await GET();
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ viewer: null });
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(mocks.session).toHaveBeenCalledWith({ failOnAuthError: true }); expect(mocks.administration).not.toHaveBeenCalled();
  });
  it('returns 503 on auth outage instead of disguising it as a guest', async () => {
    mocks.session.mockRejectedValue(new Error('SECRET auth cookie')); const response = await GET();
    expect(response.status).toBe(503); expect(response.headers.get('cache-control')).toContain('no-store');
    const body = await response.json(); expect(body).not.toHaveProperty('viewer'); expect(JSON.stringify(body)).not.toContain('SECRET');
  });
  it('preserves verified identity if admin checks fail and excludes internal metadata', async () => {
    mocks.session.mockResolvedValue({ user: { id: 'owner', email: 'owner@example.test', displayName: 'Owner', app_metadata: { secret: 'SECRET' } } });
    mocks.administration.mockRejectedValue(new Error('Administration unavailable'));
    expect(await (await GET()).json()).toEqual({ viewer: { id: 'owner', email: 'owner@example.test', displayName: 'Owner', canAccessAdministration: false } });
  });
});
