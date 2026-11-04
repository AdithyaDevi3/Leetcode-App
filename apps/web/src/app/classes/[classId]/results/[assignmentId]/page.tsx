import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { GradebookAccessError } from '@leetcode-app/database';
import { AdminPageHeader } from '@/components/admin/admin-ui';
import { SharedClassResults } from '@/components/grades/shared-class-results';
import { readLearnerClassResultsData } from '@/lib/class-gradebook-access';
import { assessmentUuid } from '@/lib/assessment-draft-input';

export default async function SharedAssignmentResultsPage({ params }: { params: Promise<{ classId: string; assignmentId: string }> }) {
  const { classId, assignmentId } = await params;
  if (!assessmentUuid.test(classId) || !assessmentUuid.test(assignmentId)) notFound();
  const access = await readLearnerClassResultsData(async (repository, actor) => ({ results: await repository.readSharedAssignment(classId, assignmentId), learnerId: actor.id }))
    .catch(error => { if (error instanceof GradebookAccessError) return { status: 'not_found' as const }; throw error; });
  if (access.status === 'unauthenticated') redirect(`/auth?next=${encodeURIComponent(`/classes/${classId}/results/${assignmentId}`)}`);
  if (access.status !== 'authorized') notFound();
  const { results, learnerId } = access.data;
  return <main><div className="mx-auto max-w-6xl space-y-7">
    <Link className="inline-flex min-h-11 items-center font-bold text-[var(--moss)] underline" href={`/classes/${classId}/results`}>← Shared class results</Link>
    <AdminPageHeader eyebrow={results.classroom.name} title={results.assignment.title} description="Read the published class results and open a submitted answer to learn from it." action={<Link className="inline-flex min-h-11 items-center rounded-md border border-[var(--line)] px-4 font-bold text-[var(--moss)]" href={`/classes/${classId}/grades`}>My grades</Link>} />
    <SharedClassResults key={`${learnerId}:${results.sharing.id}`} results={results} learnerId={learnerId} />
  </div></main>;
}
