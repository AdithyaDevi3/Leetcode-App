import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ signUp: vi.fn(), signIn: vi.fn(), ensure: vi.fn(), merge: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { signUp: mocks.signUp, signInWithPassword: mocks.signIn } }) }));
vi.mock('@/lib/auth/session', () => ({ ensureApplicationUser: mocks.ensure, mergeGuestProgressIntoUser: mocks.merge }));
vi.mock('@/lib/app-url', () => ({ applicationUrl: () => 'https://example.test', safeAppDestination: () => '/practice' }));
import { signUpWithPassword, signInWithPassword } from './actions';

function signup(accountType: string) {
  const form = new FormData();
  form.set('email', 'instructor@example.test');
  form.set('password', 'test-password');
  form.set('accountType', accountType);
  return form;
}

describe('instructor signup routing', () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.signUp.mockResolvedValue({ data: { session: null }, error: null }); });
  it('keeps the instructor destination across email confirmation without granting a role', async () => {
    await expect(signUpWithPassword(signup('instructor'))).rejects.toThrow('account=instructor');
    expect(mocks.signUp).toHaveBeenCalledWith(expect.objectContaining({ options: { emailRedirectTo: 'https://example.test/auth/confirm?next=%2Fteach%2Fstart' } }));
    expect(mocks.ensure).not.toHaveBeenCalled();
  });
  it('routes immediate sessions to instructor activation', async () => {
    mocks.signUp.mockResolvedValue({ data: { session: {} }, error: null });
    await expect(signUpWithPassword(signup('instructor'))).rejects.toThrow('redirect:/teach/start');
  });
  it('does not accept administrator as a public account type', async () => {
    await expect(signUpWithPassword(signup('administrator'))).rejects.toThrow('account=learner');
    expect(mocks.signUp).toHaveBeenCalledWith(expect.objectContaining({ options: { emailRedirectTo: 'https://example.test/auth/confirm?next=%2Fpractice' } }));
  });
  it('takes a signed-in instructor to their workspace', async () => {
    mocks.signIn.mockResolvedValue({ data: { user: { id: 'user', user_metadata: {} } }, error: null });
    await expect(signInWithPassword(signup('instructor'))).rejects.toThrow('redirect:/teach');
    expect(mocks.merge).toHaveBeenCalledWith('user');
  });
  it('preserves instructor selection when signin fails', async () => {
    mocks.signIn.mockResolvedValue({ data: { user: null }, error: new Error('Invalid credentials') });
    await expect(signInWithPassword(signup('instructor'))).rejects.toThrow('redirect:/auth?next=%2Fteach&account=instructor&error=');
    expect(mocks.ensure).not.toHaveBeenCalled();
  });
  it('preserves instructor selection after password validation fails', async () => {
    const form = signup('instructor');
    form.set('password', 'short');
    await expect(signUpWithPassword(form)).rejects.toThrow('redirect:/auth?next=%2Fteach&account=instructor&error=');
    expect(mocks.signUp).not.toHaveBeenCalled();
  });
});
