import { classPortalPageData } from '@/lib/class-portal-page';

export default async function ClassPeoplePage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  const { classroom } = await classPortalPageData('learner', classId, undefined, 'people');
  return <main className="px-5 py-6 sm:px-8"><div className="mx-auto max-w-6xl space-y-6"><header><p className="mb-2 text-sm text-[var(--muted)]">{classroom.name}</p><h1 className="text-3xl font-bold">Class people</h1></header><dl className="grid gap-4 sm:grid-cols-2"><div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-6"><dt className="text-sm text-[var(--muted)]">Instructor</dt><dd className="mt-3 break-words text-xl font-bold">{classroom.instructorName}</dd></div><div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-6"><dt className="text-sm text-[var(--muted)]">Enrolled learners</dt><dd className="mt-3 text-2xl font-bold">{classroom.learnerCount}</dd></div></dl><p className="text-sm leading-6 text-[var(--muted)]">Class staff manage enrollment. Names and answers in class results are visible when staff explicitly share those results.</p></div></main>;
}
