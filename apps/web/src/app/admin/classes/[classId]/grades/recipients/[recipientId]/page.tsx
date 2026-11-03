import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { GradebookAccessError, PostgresClassGradeReleaseRepository } from '@leetcode-app/database';
import { AdminAreaDenied } from '@/components/admin/admin-access-denied';
import { AdminPageHeader } from '@/components/admin/admin-ui';
import { GradeResponseView } from '@/components/grades/grade-response-view';
import { IndividualGradeRelease } from '@/components/grades/individual-grade-release';
import { ManualGradeEditor } from '@/app/teach/[classId]/submissions/[recipientId]/manual-grade-editor';
import { readClassGradebookData } from '@/lib/class-gradebook-access';
import { assessmentUuid } from '@/lib/assessment-draft-input';

export default async function AdminGradeReviewPage({ params }: { params: Promise<{ classId: string; recipientId: string }> }) {
  const { classId, recipientId } = await params;
  if (!assessmentUuid.test(classId) || !assessmentUuid.test(recipientId)) notFound();
  const access = await readClassGradebookData('admin', async (repository, actor, db) => {
    const detail = await new PostgresClassGradeReleaseRepository(db, { role: 'administrator', userId: actor.id }).readResponseDetail(classId, recipientId);
    const submission = await repository.readRecipient(recipientId);
    if (submission.assignment.classId !== classId) throw new GradebookAccessError();
    return { detail, submission, actorId: actor.id };
  }).catch(error => { if (error instanceof GradebookAccessError) return { status: 'not_found' as const }; throw error; });
  if (access.status === 'unauthenticated') redirect(`/auth?next=${encodeURIComponent(`/admin/classes/${classId}/grades/recipients/${recipientId}`)}`);
  if (access.status === 'forbidden') return <AdminAreaDenied />;
  if (access.status !== 'authorized') notFound();
  const { detail, submission, actorId } = access.data;
  const canReviewRubric = submission.policy.scoring.mode === 'reviewed_rubric' && submission.attempts.length > 0 && submission.applicability.applicability === 'assigned';
  return <div className="mx-auto max-w-6xl space-y-7">
    <Link className="inline-flex min-h-11 items-center font-bold text-[var(--moss)] underline" href={`/admin/classes/${classId}/grades`}>← Class grades</Link>
    <AdminPageHeader eyebrow={detail.classroom.name} title={detail.assignment.title} description={`${detail.learner.displayName} · Review the frozen assignment, submitted response and saved score.`} />
    {canReviewRubric ? <>
      {detail.content.prompt ? <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6"><h2 className="text-lg font-bold">Frozen assignment question</h2><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7">{detail.content.prompt}</p></section> : null}
      <ManualGradeEditor key={`${actorId}:${recipientId}`} submission={submission} gradebookAccess={{ actorId, classId, workspace: 'admin' }} />
    </> : <>
      <IndividualGradeRelease key={`${actorId}:${recipientId}:${detail.grade?.id ?? 'none'}`} detail={detail} actorId={actorId} workspace="admin" />
      <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6"><GradeResponseView content={detail.content} response={detail.response} /></section>
    </>}
  </div>;
}
