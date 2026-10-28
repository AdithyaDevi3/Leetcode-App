import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { QuizAssignmentAccessError } from '@leetcode-app/database';
import { AdminPageHeader } from '@/components/admin/admin-ui';
import { QuizInstructorReview } from '@/components/assessments/quiz-instructor-review';
import { assessmentUuid } from '@/lib/assessment-draft-input';
import { readInstructorQuizAssignment } from '@/lib/quiz-assignment.server';

export default async function InstructorQuizPage({ params }: { params: Promise<{ classId: string; recipientId: string }> }) {
  const { classId, recipientId } = await params;
  if (!assessmentUuid.test(classId) || !assessmentUuid.test(recipientId)) notFound();
  let access;
  try { access = await readInstructorQuizAssignment(recipientId); }
  catch (cause) { if (cause instanceof QuizAssignmentAccessError) notFound(); throw cause; }
  if (access.status === 'unauthenticated') redirect(`/auth?next=${encodeURIComponent(`/teach/${classId}/assessments/recipients/${recipientId}`)}`);
  if (access.status === 'forbidden') redirect('/teach/start');
  if (access.data.assignment.classId !== classId) notFound();
  return <main><div className="mx-auto max-w-4xl space-y-7"><Link className="inline-flex min-h-11 items-center text-sm font-bold text-[var(--moss)] underline" href={`/teach/${classId}/gradebook`}>← Class gradebook</Link><AdminPageHeader eyebrow="Quiz submission" title={access.data.assignment.title} description="Review the saved response and calculated score, then release the grade to the learner." /><QuizInstructorReview key={`${access.data.instructorId}:${recipientId}`} assignment={access.data.assignment} instructorId={access.data.instructorId} /></div></main>;
}
