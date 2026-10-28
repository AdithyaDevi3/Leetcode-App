import { notFound } from 'next/navigation';
import type { InstructorQuizAssignment, LearnerClassGrades, ClassGradebook } from '@leetcode-app/database';
import { GRADEBOOK_CALCULATION_VERSION, toLearnerQuestion } from '@leetcode-app/domain';
import { AssessmentDraftEditor } from '@/components/assessments/assessment-draft-editor';
import { QuizInstructorReview } from '@/components/assessments/quiz-instructor-review';
import { AssignedTaskCards } from '@/components/assessments/assigned-task-cards';
import { LearnerClassGradesView } from '@/app/classes/[classId]/grades/learner-class-grades-view';
import { ClassGradebookTable } from '@/app/teach/[classId]/gradebook/class-gradebook-table';
import { getReviewedQuestionVersions } from '@/lib/question-bank.server';
import { QuizLearnerFixture } from './learner-fixture';

export const dynamic = 'force-dynamic';
const classId = '11111111-1111-4111-8111-111111111111';
const authorId = '22222222-2222-4222-8222-222222222222';
const draftId = '33333333-3333-4333-8333-333333333333';
const learnerId = '44444444-4444-4444-8444-444444444444';
const assignmentId = '77777777-7777-4777-8777-777777777777';
const policyVersionId = '88888888-8888-4888-8888-888888888888';
const recipientId = '99999999-9999-4999-8999-999999999999';
const gradeId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

export default async function ClassQuizFixture({ searchParams }: { searchParams: Promise<{ view?: string; workspace?: string }> }) {
  if (process.env.METHOD_E2E_FIXTURES !== '1') notFound();
  const { view, workspace } = await searchParams;
  const questions = getReviewedQuestionVersions().slice(0, 2).map(question => ({ ...toLearnerQuestion(question), maxUnits: 500 }));
  const title = 'Class reasoning checkpoint';
  if (view === 'learner') return <QuizLearnerFixture recipientId={recipientId} learnerId={learnerId} />;
  const submitted: InstructorQuizAssignment = {
    recipientId, classId, assignmentId, policyVersionId, title, instructions: 'Choose the best answer for each question.',
    maxUnits: 1000, availableAt: null, dueAt: null, closesAt: null, questions, questionCount: 2, isOpen: true, isClosed: false,
    answerDraft: { revision: 1, answers: { [questions[0].versionId]: questions[0].options[1].id, [questions[1].versionId]: null }, updatedAt: '2026-10-27T12:00:00.000Z' },
    submission: { attemptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', responseRevisionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', answerRevision: 1, submittedAt: '2026-10-27T12:01:00.000Z', isLate: false },
    releasedGrade: null, learner: { id: learnerId, displayName: 'Sample Learner', email: null },
    grade: { id: gradeId, sequence: 1, earnedUnits: 500, kind: 'scored', attemptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', criterionScores: {}, learnerFeedback: '', createdAt: '2026-10-27T12:01:00.000Z' }, publication: null,
  };
  if (view === 'instructor') return <main className="px-5 py-6 sm:px-8"><div className="mx-auto max-w-4xl space-y-6"><h1 className="text-3xl font-bold">{title}</h1><QuizInstructorReview assignment={submitted} instructorId={authorId} /></div></main>;
  if (view === 'cards') return <main className="p-5"><h1 className="mb-6 text-3xl font-bold">Assigned tasks</h1><AssignedTaskCards assignments={[
    { id: assignmentId, classId, className: 'Algorithms Studio', title, instructions: '', activitySlug: '', dueOn: null, completed: true, recipientId, policyVersionId, assignmentKind: 'quiz', quizStatus: 'submitted' },
    { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', classId, className: 'Algorithms Studio', title: 'Coding practice', instructions: '', activitySlug: 'pair-with-target', dueOn: null, completed: false, recipientId: null, policyVersionId: null },
  ]} /></main>;
  const assignmentGrade = { id: assignmentId, assignmentKind: 'quiz' as const, title, dueOn: null, maxUnits: 1000, recipientId, state: 'published' as const, publishedGrade: { gradeRevisionId: gradeId, earnedUnits: 500, criterionScores: {}, learnerFeedback: '', publishedAt: '2026-10-27T12:02:00.000Z' }, dispute: null };
  const row = { learnerId, publishedTotal: { earnedUnits: 500, possibleUnits: 1000, percentage: '50.00' }, finalizedTotal: { earnedUnits: 500, possibleUnits: 1000, percentage: '50.00' }, coverage: { published: 1, applicable: 1, comparison: 1 }, exclusions: [], rank: 1 };
  if (view === 'grades') {
    const grades: LearnerClassGrades = { classroom: { id: classId, name: 'Algorithms Studio' }, assignments: [assignmentGrade], summary: row, calculationVersion: GRADEBOOK_CALCULATION_VERSION };
    return <LearnerClassGradesView grades={grades} />;
  }
  if (view === 'gradebook') {
    const gradebook: ClassGradebook = { classroom: { id: classId, name: 'Algorithms Studio' }, assignments: [{ id: assignmentId, title, dueOn: null, maxUnits: 1000, policyVersionId, assignmentKind: 'quiz' }], learners: [{ id: learnerId, displayName: 'Sample Learner', email: null, membership: 'included', cells: [{ assignmentId, recipientId, state: 'published', earnedUnits: 500, maxUnits: 1000 }] }], rows: [row], calculationVersion: GRADEBOOK_CALCULATION_VERSION };
    return <main className="p-5"><ClassGradebookTable gradebook={gradebook} /></main>;
  }
  return <main className="px-5 py-6 sm:px-8"><div className="mx-auto max-w-6xl space-y-6"><h1 className="text-3xl font-bold">Class quiz draft</h1><AssessmentDraftEditor classId={classId} authorId={authorId} workspace={workspace === 'admin' ? 'admin' : 'teach'} questions={questions} initialDraft={{ id: draftId, classId, title, instructions: 'Choose the best answer for each question.', questions: questions.map(question => ({ questionVersionId: question.versionId, maxUnits: question.maxUnits })), availableAt: null, dueAt: null, closesAt: null, status: 'draft', revision: 1, maxUnits: 1000, createdBy: authorId, createdAt: '2026-10-27T12:00:00.000Z', updatedAt: '2026-10-27T12:00:00.000Z' }} /></div></main>;
}
