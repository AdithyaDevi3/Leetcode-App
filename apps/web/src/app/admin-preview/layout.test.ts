import { afterEach, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('not-found'); } }));
vi.mock('@/components/admin/admin-shell', () => ({ AdminShell: () => null }));
import AdminPreviewLayout from './layout';

afterEach(() => vi.unstubAllEnvs());
it.each(['production', 'test'])('hides the preview in %s', environment => {
  vi.stubEnv('NODE_ENV', environment);
  expect(() => AdminPreviewLayout({ children: null })).toThrow('not-found');
});
