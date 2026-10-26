import { notFound } from 'next/navigation';
import { toLearnerQuestion } from '@leetcode-app/domain';
import { AssessmentDraftEditor } from '@/components/assessments/assessment-draft-editor';
import { getReviewedQuestionVersions } from '@/lib/question-bank.server';

export const dynamic = 'force-dynamic';
export default async function AssessmentDraftFixture({ searchParams }: { searchParams: Promise<{ workspace?: string; edit?: string; revision?: string }> }) {
  if (process.env.METHOD_E2E_FIXTURES !== '1') notFound();
  const { workspace, edit, revision: requestedRevision } = await searchParams;
  const revision = requestedRevision && /^[1-9]\d{0,3}$/.test(requestedRevision) ? Number(requestedRevision) : 1;
  const questions = getReviewedQuestionVersions().map(toLearnerQuestion);
  const classId = '11111111-1111-4111-8111-111111111111';
  return <main className="px-5 py-6 sm:px-8"><div className="mx-auto max-w-6xl space-y-6"><h1 className="text-3xl font-bold">Class quiz draft</h1><AssessmentDraftEditor
    classId={classId} authorId="22222222-2222-4222-8222-222222222222" workspace={workspace === 'admin' ? 'admin' : 'teach'} questions={questions}
    initialDraft={edit === '1' ? { id: '33333333-3333-4333-8333-333333333333', classId, title: 'Week one checkpoint', instructions: 'Choose the best answer.', questions: [{ questionVersionId: questions[0].versionId, maxUnits: 500 }], availableAt: null, dueAt: null, closesAt: null, status: 'draft', revision, maxUnits: 500, createdBy: '22222222-2222-4222-8222-222222222222', createdAt: '2026-10-26T00:00:00.000Z', updatedAt: '2026-10-26T00:00:00.000Z' } : null}
  /></div></main>;
}
