import { notFound, redirect } from 'next/navigation';
import { QuizAssignmentAccessError } from '@leetcode-app/database';
import { QuizAttemptWorkspace } from '@/components/assessments/quiz-attempt-workspace';
import { assessmentUuid } from '@/lib/assessment-draft-input';
import { readLearnerQuizAssignment } from '@/lib/quiz-assignment.server';

export default async function LearnerQuizPage({ params }: { params: Promise<{ classId: string; recipientId: string }> }) {
  const { classId, recipientId } = await params;
  if (!assessmentUuid.test(classId) || !assessmentUuid.test(recipientId)) notFound();
  let access;
  try { access = await readLearnerQuizAssignment(recipientId); }
  catch (cause) { if (cause instanceof QuizAssignmentAccessError) notFound(); throw cause; }
  if (access.status === 'unauthenticated') redirect(`/auth?next=${encodeURIComponent(`/classes/${classId}/assignments/${recipientId}`)}`);
  if (access.status === 'forbidden') notFound();
  if (access.data.assignment.classId !== classId) notFound();
  return <QuizAttemptWorkspace key={`${access.data.learnerId}:${recipientId}:${access.data.assignment.policyVersionId}`} learnerId={access.data.learnerId} assignment={access.data.assignment} />;
}
