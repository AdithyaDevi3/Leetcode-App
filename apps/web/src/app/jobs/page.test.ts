import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  classes: [] as { id: string; name: string; description: string; joinedAt: string; assignmentCount: number; completedCount: number }[],
  status: 'authorized' as 'authorized' | 'forbidden' | 'unauthenticated',
}));

vi.mock('@leetcode-app/database', () => ({ PostgresClassroomRepository: class {
  listStudentClasses = async () => state.classes;
} }));
vi.mock('@/lib/class-portal-access', () => ({ readClassPortalData: async (_workspace: string, read: (repository: unknown, actor: { id: string }, db: unknown) => Promise<unknown>) => state.status === 'authorized'
  ? { status: 'authorized', data: await read(null, { id: '11111111-1111-4111-8111-111111111111' }, {}) } : { status: state.status } }));
vi.mock('@/lib/job-sources', () => ({ readJobSources: async () => [{ id: 'source', name: 'Synthetic source', kind: 'internship', href: 'https://example.test/jobs', description: 'Synthetic source description.', note: 'Confirm the employer listing.', updatedAt: '2026-11-17T12:00:00.000Z' }] }));
vi.mock('next/link', () => ({ default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => createElement('a', { href, ...props }, children) }));
vi.mock('@/components/site-navigation', () => ({ SiteNavigation: () => null }));

import JobPostingsPage from './page';

beforeEach(() => { state.status = 'authorized'; state.classes = []; });

describe('JobPostingsPage', () => {
  it('requires group enrollment before it shows sources', async () => {
    const html = renderToStaticMarkup(await JobPostingsPage());
    expect(html).toContain('Join a group to open job postings');
    expect(html).not.toContain('Synthetic source');
  });

  it('shows approved sources to an enrolled learner', async () => {
    state.classes = [{ id: '22222222-2222-4222-8222-222222222222', name: '2026 cohort', description: '', joinedAt: '2026-11-17T12:00:00.000Z', assignmentCount: 0, completedCount: 0 }];
    const html = renderToStaticMarkup(await JobPostingsPage());
    expect(html).toContain('Synthetic source');
    expect(html).toContain('2026 cohort');
    expect(html).toContain('https://example.test/jobs');
  });

  it('keeps sources hidden from unauthenticated visitors', async () => {
    state.status = 'unauthenticated';
    const html = renderToStaticMarkup(await JobPostingsPage());
    expect(html).toContain('Sign in, then join a group');
    expect(html).not.toContain('Synthetic source');
  });
});
