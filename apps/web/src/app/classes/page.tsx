import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PostgresClassroomRepository } from '@leetcode-app/database';
import { ClassEntry } from '@/components/class-entry';
import { SiteNavigation } from '@/components/site-navigation';
import { readClassPortalData } from '@/lib/class-portal-access';
import { classEntryDestination } from '@/lib/class-entry-view';
import { joinClassroom } from './actions';

export default async function ClassesPage({ searchParams }: {
  searchParams: Promise<{ view?: string; error?: string; joined?: string }>;
}) {
  const notice = await searchParams;
  const access = await readClassPortalData('learner', (_repository, actor, db) => new PostgresClassroomRepository(db).listStudentClasses(actor.id));
  if (access.status === 'unauthenticated') redirect('/auth?next=%2Fclasses');
  if (access.status === 'forbidden') return <main className="mx-auto max-w-3xl space-y-5 px-5 py-8"><SiteNavigation currentPath="/classes" /><h1 className="text-3xl font-bold">Learner classes</h1><p>This view is for enrolled learner accounts. Class staff can open their teaching workspace.</p><Link className="inline-flex min-h-11 items-center font-bold text-[var(--moss)] underline" href="/teach">Open teaching workspace</Link></main>;
  const destination = classEntryDestination(access.data, notice);
  if (destination) redirect(destination);
  return <main className="min-h-screen px-5 py-6 sm:px-8"><div className="mx-auto max-w-6xl space-y-7">
    <SiteNavigation currentPath="/classes" />
    <header className="max-w-3xl"><p className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--coral)]">Learning together</p><h1 className="text-3xl font-bold sm:text-4xl">My classes</h1><p className="mt-3 leading-7 text-[var(--muted)]">Open a class for its work, announcements and grades. Keep additional study groups here when you need them.</p></header>
    <ClassEntry classes={access.data} error={notice.error} joined={notice.joined} joinAction={joinClassroom} />
  </div></main>;
}
