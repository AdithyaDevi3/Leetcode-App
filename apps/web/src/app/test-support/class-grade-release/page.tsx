import type { ClassGradebook, GradebookRecipientHistory, GradeReleaseResponseDetail, SharedAssignmentResults } from '@leetcode-app/database';
import { notFound } from 'next/navigation';
import { ManualGradeEditor } from '@/app/teach/[classId]/submissions/[recipientId]/manual-grade-editor';
import { AssignmentReleaseCenter } from '@/components/grades/assignment-release-center';
import { IndividualGradeRelease } from '@/components/grades/individual-grade-release';
import { SharedClassResults } from '@/components/grades/shared-class-results';

export const dynamic = 'force-dynamic';

const actorId = '11111111-1111-4111-8111-111111111111';
const classId = '22222222-2222-4222-8222-222222222222';
const stamp = '2026-11-02T18:00:00.000Z';
const uid = (prefix: string, value: number) => `${prefix}${value.toString(16).padStart(7, '0')}-0000-4000-8000-${value.toString(16).padStart(12, '0')}`;
const assignments: ClassGradebook['assignments'] = [
  { id: '33333333-3333-4333-8333-333333333333', title: 'Week one practice', dueOn: null, maxUnits: 10000, policyVersionId: '66666666-6666-4666-8666-666666666666', assignmentKind: 'problem' },
  { id: '44444444-4444-4444-8444-444444444444', title: 'Map lookup quiz', dueOn: null, maxUnits: 10000, policyVersionId: '77777777-7777-4777-8777-777777777777', assignmentKind: 'quiz' },
  { id: '55555555-5555-4555-8555-555555555555', title: 'Written invariant explanation', dueOn: null, maxUnits: 10000, policyVersionId: '88888888-8888-4888-8888-888888888888', assignmentKind: 'written' },
];

const shared: SharedAssignmentResults = {
  classroom: { id: classId, name: 'Synthetic algorithms class' },
  assignment: { id: assignments[0].id, title: assignments[0].title, kind: 'problem', instructions: 'Review the frozen submitted work.', dueOn: null, closesAt: null, maxUnits: 10000, policyVersionId: uid('f', 1) },
  content: { prompt: 'Find two distinct positions whose values sum to a target.', questions: [] },
  sharing: { id: uid('6', 1), sequence: 1, classId, assignmentId: assignments[0].id, shared: true, recipientCount: 3, createdAt: stamp },
  learners: [
    { learner: { id: uid('a', 1), displayName: 'Ada Ready' }, recipientId: uid('b', 1), earnedUnits: 9500, maxUnits: 10000, response: null },
    { learner: { id: uid('a', 2), displayName: 'Bea Ready' }, recipientId: uid('b', 2), earnedUnits: 8000, maxUnits: 10000, response: null },
    { learner: { id: uid('a', 3), displayName: 'Cam Released' }, recipientId: uid('b', 3), earnedUnits: 9000, maxUnits: 10000, response: null },
  ],
};
const submission: GradebookRecipientHistory = {
  recipientId: uid('b', 1), learnerId: uid('a', 1), learner: { id: uid('a', 1), displayName: 'Ada Ready', email: null },
  assignment: { id: assignments[0].id, classId, title: assignments[0].title, instructions: 'Review the frozen submitted work.', prompt: shared.content.prompt, dueOn: null, closesAt: null, isClosed: false },
  policy: { assignmentId: assignments[0].id, versionId: uid('f', 1), contentVersionId: uid('f', 2), maxUnits: 10000, attemptPolicy: 'latest',
    scoring: { mode: 'reviewed_rubric', rubricVersionId: 'synthetic-reviewed-v1', criteria: [{ id: 'reasoning', label: 'Reasoning', maxUnits: 6000 }, { id: 'complexity', label: 'Complexity', maxUnits: 4000 }] } },
  applicability: { id: uid('7', 1), sequence: 1, applicability: 'assigned', createdAt: stamp },
  attempts: [{ id: uid('e', 1), responseRevisionId: uid('8', 1), sequence: 1, response: { text: 'Record previously seen values in a map and check each complement before storing the current value.', language: 'text' }, submittedAt: stamp }],
  grades: [], publications: [], disputes: [],
};
const quizDetail: GradeReleaseResponseDetail = {
  classroom: shared.classroom, assignment: { ...shared.assignment, id: assignments[1].id, title: assignments[1].title, kind: 'quiz', policyVersionId: uid('f', 2) },
  content: { prompt: 'Choose the data structure used for lookup.', questions: [] }, learner: submission.learner, recipientId: uid('b', 21), state: 'draft', response: null,
  grade: { id: uid('c', 21), earnedUnits: 9500, maxUnits: 10000, criterionScores: {}, learnerFeedback: '', published: false, publicationSequence: 0 },
  releaseTarget: { recipientId: uid('b', 21), gradeRevisionId: uid('c', 21), expectedPublicationSequence: 0 },
};

export default async function ClassGradeReleaseFixturePage({ searchParams }: { searchParams: Promise<{ workspace?: string; view?: string }> }) {
  if (process.env.METHOD_E2E_FIXTURES !== '1') notFound();
  const { workspace: selectedWorkspace, view } = await searchParams;
  const workspace = selectedWorkspace === 'teach' ? 'teach' : 'admin';
  return <main className="min-h-screen px-5 py-6 sm:px-8"><div className="mx-auto max-w-[96rem] space-y-6">
    <header><p className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Synthetic class fixture</p><h1 className="text-3xl font-bold">Class scores</h1></header>
    {view === 'shared' ? <SharedClassResults results={shared} learnerId={uid('a', 1)} />
      : view === 'admin-review' ? <ManualGradeEditor submission={submission} gradebookAccess={{ classId, actorId, workspace: 'admin' }} />
        : view === 'individual-quiz' ? <IndividualGradeRelease detail={quizDetail} actorId={actorId} workspace={workspace} />
          : <AssignmentReleaseCenter actorId={actorId} classId={classId} assignments={assignments} workspace={workspace} />}
  </div></main>;
}
