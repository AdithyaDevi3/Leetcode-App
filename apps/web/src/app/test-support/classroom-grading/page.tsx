import type { GradebookRecipientHistory, LearnerClassGrades } from '@leetcode-app/database';
import { GRADEBOOK_CALCULATION_VERSION } from '@leetcode-app/domain';
import { notFound } from 'next/navigation';

import { LearnerClassGradesView } from '@/app/classes/[classId]/grades/learner-class-grades-view';
import { ManualGradeEditor } from '@/app/teach/[classId]/submissions/[recipientId]/manual-grade-editor';

export const dynamic = 'force-dynamic';

const recipientId = '11111111-1111-4111-8111-111111111111';
const attemptId = '22222222-2222-4222-8222-222222222222';
const gradeRevisionId = '33333333-3333-4333-8333-333333333333';

const submission: GradebookRecipientHistory = {
  recipientId,
  learnerId: '44444444-4444-4444-8444-444444444444',
  learner: { id: '44444444-4444-4444-8444-444444444444', displayName: 'Sample Learner', email: 'learner@example.invalid' },
  assignment: { id: '55555555-5555-4555-8555-555555555555', classId: '66666666-6666-4666-8666-666666666666', title: 'Pair With Target', instructions: 'Explain the linear-time approach.', dueOn: '2026-10-05', closesAt: null, isClosed: false },
  policy: { assignmentId: '55555555-5555-4555-8555-555555555555', versionId: 'policy-v1', contentVersionId: 'content-v1', maxUnits: 1000, attemptPolicy: 'latest', scoring: { mode: 'reviewed_rubric', rubricVersionId: 'rubric-v1', criteria: [{ id: 'reasoning', label: 'Reasoning', maxUnits: 600 }, { id: 'complexity', label: 'Complexity', maxUnits: 400 }] } },
  applicability: { id: '77777777-7777-4777-8777-777777777777', sequence: 1, applicability: 'assigned', createdAt: '2026-10-01T12:00:00.000Z' },
  attempts: [{ id: attemptId, responseRevisionId: '88888888-8888-4888-8888-888888888888', sequence: 1, response: { text: 'Scan once while storing each value in a map. Return when the complement has already been seen.' }, submittedAt: '2026-10-01T13:00:00.000Z' }],
  grades: [], publications: [], disputes: [],
};

const grades: LearnerClassGrades = {
  classroom: { id: '66666666-6666-4666-8666-666666666666', name: 'Algorithms Studio' },
  assignments: [{
    id: '55555555-5555-4555-8555-555555555555', title: 'Pair With Target', dueOn: '2026-10-05', maxUnits: 1000, recipientId,
    state: 'published', publishedGrade: { gradeRevisionId, earnedUnits: 850, criterionScores: { reasoning: 500, complexity: 350 }, learnerFeedback: 'Clear map-based reasoning. Make the space tradeoff explicit.', publishedAt: '2026-10-01T14:00:00.000Z' }, dispute: null,
  }],
  summary: { publishedTotal: { earnedUnits: 850, possibleUnits: 1000, percentage: '85.00' }, coverage: { published: 1, applicable: 1, comparison: 1 } },
  calculationVersion: GRADEBOOK_CALCULATION_VERSION,
};

export default async function ClassroomGradingFixturePage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  if (process.env.METHOD_E2E_FIXTURES !== '1') notFound();
  const { view } = await searchParams;
  return view === 'learner'
    ? <LearnerClassGradesView grades={grades} />
    : <main className="min-h-screen px-5 py-6 sm:px-8"><div className="mx-auto max-w-6xl space-y-7"><header><p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[var(--coral)]">Submission review</p><h1 className="text-3xl font-bold">Pair With Target</h1><p className="text-[var(--muted)]">Sample Learner · Grade the latest response against the frozen rubric.</p></header><ManualGradeEditor submission={submission} /></div></main>;
}
