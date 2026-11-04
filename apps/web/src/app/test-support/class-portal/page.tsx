import { notFound } from 'next/navigation';
import { ClassEntry } from '@/components/class-entry';
import { AnnouncementManager } from '@/components/classes/announcement-manager';
import { AnnouncementReader } from '@/components/classes/announcement-reader';
import { ClassNavigation } from '@/components/classes/class-navigation';

export const dynamic = 'force-dynamic';
const actorId = '11111111-1111-4111-8111-111111111111';
const classId = '22222222-2222-4222-8222-222222222222';
const classes = [
  { id: classId, name: 'Synthetic algorithms class', description: 'A focused class for practice and announcements.', joinedAt: '2026-11-04T14:00:00.000Z', assignmentCount: 3, completedCount: 1 },
  { id: '66666666-6666-4666-8666-666666666666', name: 'Synthetic interview study group', description: 'Separate work for a small group.', joinedAt: '2026-11-04T14:00:00.000Z', assignmentCount: 1, completedCount: 0 },
];
async function fixtureJoin() {
  'use server';
  if (process.env.METHOD_E2E_FIXTURES !== '1') throw new Error('Fixture unavailable');
}

export default async function ClassPortalFixture({ searchParams }: {
  searchParams: Promise<{ workspace?: string; mode?: string; notice?: string }>;
}) {
  if (process.env.METHOD_E2E_FIXTURES !== '1') notFound();
  const query = await searchParams;
  const workspace = query.workspace === 'learner' ? 'learner' : query.workspace === 'admin' ? 'admin' : 'teach';
  const entry = ['empty', 'single', 'multiple'].includes(query.mode ?? '');
  return <main className="min-h-screen px-4 py-6 sm:px-8"><div className="mx-auto max-w-6xl space-y-6">
    <header><p className="text-xs font-bold text-[var(--muted)]">Synthetic class fixture</p><h1 className="text-3xl font-bold">{entry ? 'Your classes' : 'Class announcements'}</h1></header>
    {entry ? <ClassEntry classes={query.mode === 'empty' ? [] : query.mode === 'single' ? classes.slice(0, 1) : classes} error={query.notice} joinAction={fixtureJoin} /> : <>
      <ClassNavigation classId={classId} workspace={workspace} />
      {workspace === 'learner' ? <AnnouncementReader classId={classId} actorId={actorId} /> : <AnnouncementManager classId={classId} actorId={actorId} workspace={workspace} />}
    </>}
  </div></main>;
}
