import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StudentClassroom } from '@leetcode-app/database';

const state = vi.hoisted(() => ({
  status: 'authorized' as 'authorized' | 'forbidden' | 'unauthenticated',
  classes: [] as StudentClassroom[], list: vi.fn(), allAssignments: vi.fn(),
}));
vi.mock('@leetcode-app/database', () => ({ PostgresClassroomRepository: class {
  listStudentClasses = state.list;
  listStudentAssignments = state.allAssignments;
} }));
vi.mock('@/lib/class-portal-access', () => ({ readClassPortalData: async (_workspace: string, read: (repository: unknown, actor: { id: string }, db: unknown) => Promise<unknown>) => state.status === 'authorized'
  ? { status: 'authorized', data: await read(null, { id: '11111111-1111-4111-8111-111111111111' }, {}) } : { status: state.status } }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
vi.mock('next/link', () => ({ default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => createElement('a', { href, ...props }, children) }));
vi.mock('@/components/site-navigation', () => ({ SiteNavigation: () => null }));
vi.mock('./actions', () => ({ joinClassroom: async () => {} }));
import ClassesPage from './page';

const first: StudentClassroom = { id: '22222222-2222-4222-8222-222222222222', name: 'Synthetic algorithms class', description: '', joinedAt: '2026-11-04T00:00:00.000Z', assignmentCount: 2, completedCount: 0 };

beforeEach(() => {
  state.status = 'authorized'; state.classes = []; vi.clearAllMocks();
  state.list.mockImplementation(async () => state.classes);
  state.allAssignments.mockRejectedValue(new Error('The class index must not fetch mixed class assignments'));
});

describe('class entry routing and isolation', () => {
  it('opens a single class directly without fetching assignments from other classes', async () => {
    state.classes = [first];
    await expect(ClassesPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(`redirect:/classes/${first.id}`);
    expect(state.list).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
    expect(state.allAssignments).not.toHaveBeenCalled();
  });
  it('keeps switching and joining reachable for a single class', async () => {
    state.classes = [first];
    const html = renderToStaticMarkup(await ClassesPage({ searchParams: Promise.resolve({ view: 'all' }) }));
    expect(html).toContain('Join another class'); expect(html).toContain(`/classes/${first.id}`);
    expect(state.allAssignments).not.toHaveBeenCalled();
  });
  it('offers each class separately and keeps mixed class work out of the index', async () => {
    state.classes = [first, { ...first, id: '33333333-3333-4333-8333-333333333333', name: 'Synthetic study group' }];
    const html = renderToStaticMarkup(await ClassesPage({ searchParams: Promise.resolve({}) }));
    for (const item of state.classes) expect(html).toContain(`/classes/${item.id}`);
    expect(state.allAssignments).not.toHaveBeenCalled();
  });
  it('shows the join form for a new learner', async () => {
    const html = renderToStaticMarkup(await ClassesPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('No classes yet.'); expect(html).toContain('Class code'); expect(html).toContain('<details');
    expect(html).toContain('open=""');
  });
  it.each([{ error: 'Synthetic invalid class code.' }, { joined: 'Synthetic enrollment confirmed.' }])('preserves join feedback instead of hiding it behind a redirect', async notice => {
    state.classes = [first];
    const html = renderToStaticMarkup(await ClassesPage({ searchParams: Promise.resolve(notice) }));
    expect(html).toContain('error' in notice ? notice.error : notice.joined);
  });
  it('escapes query notices and class content', async () => {
    state.classes = [{ ...first, name: '<script>synthetic()</script>' }];
    const html = renderToStaticMarkup(await ClassesPage({ searchParams: Promise.resolve({ error: '<img src=x onerror=synthetic()>' }) }));
    expect(html).not.toContain('<script>synthetic'); expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;'); expect(html).toContain('&lt;img');
  });
  it('redirects anonymous viewers before querying classroom data', async () => {
    state.status = 'unauthenticated';
    await expect(ClassesPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('redirect:/auth?next=%2Fclasses');
    expect(state.list).not.toHaveBeenCalled();
  });
  it('does not query learner class data for a revoked or non-learner account', async () => {
    state.status = 'forbidden'; state.classes = [first];
    const html = renderToStaticMarkup(await ClassesPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('Open teaching workspace'); expect(html).not.toContain(first.name);
    expect(state.list).not.toHaveBeenCalled();
  });
});
