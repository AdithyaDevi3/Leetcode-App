import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GradebookAccessError } from '@leetcode-app/database';
import { AdminPageHeader } from '@/components/admin/admin-ui';
import { withInstructorGradebook } from '@/lib/instructor-gradebook';
import { ManualGradeEditor } from './manual-grade-editor';
import { MissingWorkEditor } from './missing-work-editor';
import { ApplicabilityEditor } from './applicability-editor';

export default async function SubmissionReviewPage({ params }: { params: Promise<{ classId: string; recipientId: string }> }) {
  const { classId, recipientId } = await params;
  let submission;
  try { submission = await withInstructorGradebook(repository => repository.readRecipient(recipientId)); }
  catch (error) { if (error instanceof GradebookAccessError) notFound(); throw error; }
  if (submission.assignment.classId !== classId || submission.policy.scoring.mode !== 'reviewed_rubric') notFound();
  const hasAttempt = submission.attempts.length > 0;
  const isExcused = submission.applicability.applicability === 'excused';
  return <main><div className="mx-auto max-w-6xl space-y-7">
    <Link className="inline-flex text-sm font-bold text-[var(--moss)] underline underline-offset-4" href={`/teach/${classId}/submissions`}>← Submission inbox</Link>
    <AdminPageHeader eyebrow={hasAttempt ? 'Submission review' : 'Missing work'} title={submission.assignment.title} description={`${submission.learner.displayName} · ${hasAttempt ? 'Grade the latest response against the frozen rubric.' : 'Review eligibility before finalizing an unsubmitted assignment.'}`} />
    <ApplicabilityEditor submission={submission} />
    {isExcused ? <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-6"><h2 className="text-xl font-bold">Grading paused</h2><p className="mb-0 mt-2 text-sm leading-6 text-[var(--muted)]">This learner is excused from the assignment. Restore the assignment before creating or publishing a grade.</p></section> : hasAttempt ? <ManualGradeEditor submission={submission} /> : <MissingWorkEditor submission={submission} />}
  </div></main>;
}
