import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { GradebookAccessError } from '@leetcode-app/database';
import { AdminEmptyState, AdminPageHeader, AdminSection } from '@/components/admin/admin-ui';
import { readLearnerClassResultsData } from '@/lib/class-gradebook-access';
import { assessmentUuid } from '@/lib/assessment-draft-input';

export default async function ClassResultsPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  if (!assessmentUuid.test(classId)) notFound();
  const access = await readLearnerClassResultsData(repository => repository.listSharedAssignments(classId))
    .catch(error => { if (error instanceof GradebookAccessError) return { status: 'not_found' as const }; throw error; });
  if (access.status === 'unauthenticated') redirect(`/auth?next=${encodeURIComponent(`/classes/${classId}/results`)}`);
  if (access.status !== 'authorized') notFound();
  const { classroom, assignments } = access.data;
  return <main><div className="mx-auto max-w-6xl space-y-7">
    <Link className="inline-flex min-h-11 items-center font-bold text-[var(--moss)] underline" href="/classes">← My classes</Link>
    <AdminPageHeader eyebrow={classroom.name} title="Shared class results" description="Questions, submitted answers and released scores explicitly shared with your class." action={<Link className="inline-flex min-h-11 items-center rounded-md border border-[var(--line)] px-4 font-bold text-[var(--moss)]" href={`/classes/${classId}/grades`}>My grades</Link>} />
    <AdminSection title="Assignments" description="Sharing is controlled separately for each assignment.">
      {!assignments.length ? <AdminEmptyState>No assignment results are shared with this class yet. Your own released grades are available in My grades.</AdminEmptyState> : <ul className="divide-y divide-[var(--line)]">{assignments.map(assignment => <li key={assignment.id} className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6"><div><h2 className="font-bold">{assignment.title}</h2><p className="mb-0 mt-2 text-sm text-[var(--muted)]">{assignment.recipientCount} shared records · {new Date(assignment.sharedAt).toLocaleDateString('en-US', { dateStyle: 'medium' })}</p></div><Link className="inline-flex min-h-11 items-center rounded-md border border-[var(--moss)] px-4 text-sm font-bold text-[var(--moss)]" href={`/classes/${classId}/results/${assignment.id}`}>View class results</Link></li>)}</ul>}
    </AdminSection>
  </div></main>;
}
