import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ exchange: vi.fn(), ensure: vi.fn(), merge: vi.fn() }));
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { exchangeCodeForSession: mocks.exchange } }) }));
vi.mock('@/lib/auth/session', () => ({ ensureApplicationUser: mocks.ensure, mergeGuestProgressIntoUser: mocks.merge }));
import { GET } from './route';

describe('email confirmation routing', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.exchange.mockResolvedValue({ data: { user: { id: 'verified-user', user_metadata: {} } }, error: null });
  });

  it('keeps the instructor activation destination after a successful exchange', async () => {
    const response = await GET(new NextRequest('https://example.test/auth/confirm?code=test-code&next=%2Fteach%2Fstart'));
    expect(response.headers.get('location')).toBe('https://example.test/teach/start');
    expect(mocks.exchange).toHaveBeenCalledWith('test-code');
    expect(mocks.ensure).toHaveBeenCalledWith({ id: 'verified-user', email: undefined, displayName: null });
    expect(mocks.merge).toHaveBeenCalledWith('verified-user');
  });

  it.each(['', '&next=https://attacker.example', '&next=%2F%5Cattacker.example'])('uses a safe default destination for %s', async (query) => {
    const response = await GET(new NextRequest(`https://example.test/auth/confirm?code=test-code${query}`));
    expect(response.headers.get('location')).toBe('https://example.test/practice');
  });

  it.each([null, 'expired-code'])('shows a recoverable error for a missing or expired code: %s', async (code) => {
    mocks.exchange.mockResolvedValue({ data: { user: null }, error: new Error('Expired') });
    const response = await GET(new NextRequest(`https://example.test/auth/confirm?next=%2Fteach%2Fstart${code ? `&code=${code}` : ''}`));
    const location = new URL(response.headers.get('location')!);
    expect(location.pathname).toBe('/auth');
    expect(location.searchParams.get('next')).toBe('/teach/start');
    expect(location.searchParams.get('error')).toContain('invalid or expired');
    expect(mocks.ensure).not.toHaveBeenCalled();
    expect(mocks.merge).not.toHaveBeenCalled();
  });
});
