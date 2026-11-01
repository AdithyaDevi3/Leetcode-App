import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AssessmentDraftAccessError, ClassroomNotFoundError } from '@leetcode-app/database';
import { toLearnerQuestion } from '@leetcode-app/domain';
import { AdminAreaDenied } from '@/components/admin/admin-access-denied';
import { AdminPageHeader } from '@/components/admin/admin-ui';
import { readAssessmentAuthorData, type AssessmentWorkspace } from '@/lib/assessment-author';
import { assessmentUuid } from '@/lib/assessment-draft-input';
import { getReviewedQuestionVersions } from '@/lib/question-bank.server';
import { readClassFollowUpSeed, ClassInsightsApiError } from '@/lib/class-insights-api';
import { ClassInsightsInputError } from '@/lib/class-insights-input';
import { classFollowUpDraftSeed } from '@/lib/class-follow-up-seed';
import { ClassInsightsAccessError } from '@leetcode-app/database';
import { AssessmentDraftEditor } from './assessment-draft-editor';

export async function AssessmentDraftPage({ workspace, classId, draftId = null, focus }: { workspace: AssessmentWorkspace; classId: string; draftId?: string | null; focus?: unknown }) {
  if (!assessmentUuid.test(classId) || (draftId && !assessmentUuid.test(draftId))) notFound();
  const basePath = workspace === 'admin' ? `/admin/classes/${classId}` : `/teach/${classId}`;
  const access = await readAssessmentAuthorData(workspace, async (repository, classes, author) => {
    try {
      const detail = await classes.getClassDetail(classId);
      const draft = draftId ? await repository.getDraft(draftId) : null;
      if (draft && draft.classId !== classId) return null;
      return { className: detail.classroom.name, draft, authorId: author.id };
    } catch (error) {
      if (error instanceof AssessmentDraftAccessError || error instanceof ClassroomNotFoundError) return null;
      throw error;
    }
  });
  if (access.status === 'unauthenticated') redirect(`/auth?next=${encodeURIComponent(basePath)}`);
  if (access.status === 'forbidden') return workspace === 'admin' ? <AdminAreaDenied /> : redirect('/teach/start');
  if (!access.data) notFound();
  let followUp = null;
  if (!draftId && focus !== undefined) {
    try {
      followUp = await readClassFollowUpSeed(workspace, classId, focus);
      if (followUp.actorId !== access.data.authorId) notFound();
    } catch (error) {
      if (error instanceof ClassInsightsAccessError || error instanceof ClassInsightsInputError) notFound();
      if (error instanceof ClassInsightsApiError && error.status === 401) redirect(`/auth?next=${encodeURIComponent(basePath)}`);
      if (error instanceof ClassInsightsApiError && error.status === 403) return workspace === 'admin' ? <AdminAreaDenied /> : redirect('/teach/start');
      throw error;
    }
  }
  const seed = followUp ? classFollowUpDraftSeed(followUp.suggestion, followUp.seedKey) : null;
  const questions = getReviewedQuestionVersions().map(toLearnerQuestion);
  return <main><div className="mx-auto max-w-6xl space-y-7">
    <Link className="inline-flex min-h-11 items-center text-sm font-bold text-[var(--moss)] underline underline-offset-4" href={basePath}>← {access.data.className}</Link>
    <AdminPageHeader eyebrow={access.data.className} title={draftId ? 'Edit quiz draft' : 'Create a quiz draft'} description="Build a multiple-choice quiz from reviewed questions. Save your selection, points, instructions, and planned dates for this class." />
    {draftId ? <p className="text-sm"><Link className="inline-flex min-h-11 items-center font-bold text-[var(--moss)] underline underline-offset-4" href={`${basePath}/assessments/${draftId}/copy`}>Copy saved draft to a class</Link><span className="ml-2 text-[var(--muted)]">Copies the saved revision; save your latest edits first if you want to include them.</span></p> : null}
    {followUp ? <section aria-label="Suggested follow-up quiz" className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5"><h2 className="text-xl font-bold">Review your follow-up quiz</h2><p className="text-sm">Suggestions start with questions not already assigned to this class. Edits and restored browser work can contain earlier selections; review the questions, points, instructions and dates before saving. Your saved draft still needs an audience preview and explicit assignment.</p>{followUp.suggestion.emptyReason ? <p className="text-sm" role="status">{followUp.suggestion.emptyReason}</p> : null}{followUp.suggestion.unavailableConceptIds.length ? <p className="text-sm text-[var(--muted)]">No unused questions remain for: {followUp.suggestion.unavailableConceptIds.map(id => id.replaceAll('-', ' ')).join(', ')}. You can add other reviewed questions below.</p> : null}<Link className="inline-flex min-h-11 items-center text-sm font-bold text-[var(--moss)] underline" href={`${basePath}/insights`}>Return to class insights</Link></section> : null}
    <AssessmentDraftEditor key={`${access.data.authorId}:${classId}:${draftId ?? (seed ? `new:${seed.key}` : 'new')}`} workspace={workspace} classId={classId} authorId={access.data.authorId} initialDraft={access.data.draft} initialSeed={seed} questions={questions} />
  </div></main>;
}
