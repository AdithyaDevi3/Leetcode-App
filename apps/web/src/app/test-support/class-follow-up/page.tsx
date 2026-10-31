import { notFound } from 'next/navigation';
import { buildClassFollowUp, buildClassInsights, toLearnerQuestion } from '@leetcode-app/domain';
import { AssessmentDraftEditor } from '@/components/assessments/assessment-draft-editor';
import { getReviewedQuestionVersions } from '@/lib/question-bank.server';
import { classInsightsFocus } from '@/lib/class-insights-input';
import { classFollowUpDraftSeed } from '@/lib/class-follow-up-seed';

export const dynamic = 'force-dynamic';
const actorId = '11111111-1111-4111-8111-111111111111';
const classId = '33333333-3333-4333-8333-333333333333';
export default async function ClassFollowUpFixture({ searchParams }: { searchParams: Promise<{ focus?: string; workspace?: string; changed?: string }> }) {
  if (process.env.METHOD_E2E_FIXTURES !== '1') notFound();
  const query = await searchParams;
  const workspace = query.workspace === 'admin' ? 'admin' : 'teach';
  const pool = getReviewedQuestionVersions();
  const conceptIds = [...new Set(pool.flatMap(question => [...question.conceptIds]))].sort();
  const focus = classInsightsFocus(query.focus, conceptIds);
  const report = buildClassInsights({ classroom: { id: classId, name: 'Synthetic follow-up class' }, generatedAt: '2026-10-30T12:00:00.000Z', view: workspace === 'admin' ? 'administrator' : 'owner', rosterCount: 6, conceptIds, observations: [] });
  const earlier = buildClassFollowUp(report, pool, [], focus);
  const assigned = query.changed ? [pool.find(question => question.versionId === earlier.items[0]?.questionVersionId)!.questionId] : [];
  const selection = buildClassFollowUp(report, pool, assigned, focus);
  const suggestion = { focusConceptIds: selection.focusConceptIds, questions: selection.items.map(item => toLearnerQuestion(pool.find(question => question.versionId === item.questionVersionId)!)), reason: 'Synthetic suggestion', emptyReason: null, unavailableConceptIds: selection.unavailableConceptIds };
  const seed = focus ? classFollowUpDraftSeed(suggestion, `focus:${focus.join(':')}`) : null;
  return <main className="px-5 py-6 sm:px-8"><div className="mx-auto max-w-6xl space-y-6"><h1 className="text-3xl font-bold">Synthetic follow-up quiz</h1><AssessmentDraftEditor key={`${workspace}:${seed?.key ?? 'new'}`} authorId={actorId} classId={classId} workspace={workspace} initialSeed={seed} questions={pool.map(toLearnerQuestion)} /></div></main>;
}
