import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GradebookAccessError } from '@leetcode-app/database';
import { AdminPageHeader } from '@/components/admin/admin-ui';
import { withInstructorGradebook } from '@/lib/instructor-gradebook';
import { ManualGradeEditor } from './manual-grade-editor';
import { MissingWorkEditor } from './missing-work-editor';

export default async function SubmissionReviewPage({ params }: { params: Promise<{ classId: string; recipientId: string }> }) {
  const { classId, recipientId } = await params;
  let submission;
  try { submission = await withInstructorGradebook(repository => repository.readRecipient(recipientId)); }
  catch (error) { if (error instanceof GradebookAccessError) notFound(); throw error; }
  if (submission.assignment.classId !== classId || submission.policy.scoring.mode !== 'reviewed_rubric') notFound();
  const hasAttempt = submission.attempts.length > 0;
  return <main><div className="mx-auto max-w-6xl space-y-7">
    <Link className="inline-flex text-sm font-bold text-[var(--moss)] underline underline-offset-4" href={`/teach/${classId}/submissions`}>← Submission inbox</Link>
    <AdminPageHeader eyebrow={hasAttempt ? 'Submission review' : 'Missing work'} title={submission.assignment.title} description={`${submission.learner.displayName} · ${hasAttempt ? 'Grade the latest response against the frozen rubric.' : 'Review eligibility before finalizing an unsubmitted assignment.'}`} />
    {hasAttempt ? <ManualGradeEditor submission={submission} /> : <MissingWorkEditor submission={submission} />}
  </div></main>;
}
