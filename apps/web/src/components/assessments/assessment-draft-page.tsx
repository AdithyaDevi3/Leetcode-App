import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AssessmentDraftAccessError, ClassroomNotFoundError } from '@leetcode-app/database';
import { toLearnerQuestion } from '@leetcode-app/domain';
import { AdminAreaDenied } from '@/components/admin/admin-access-denied';
import { AdminPageHeader } from '@/components/admin/admin-ui';
import { readAssessmentAuthorData, type AssessmentWorkspace } from '@/lib/assessment-author';
import { assessmentUuid } from '@/lib/assessment-draft-input';
import { getReviewedQuestionVersions } from '@/lib/question-bank.server';
import { AssessmentDraftEditor } from './assessment-draft-editor';

export async function AssessmentDraftPage({ workspace, classId, draftId = null }: { workspace: AssessmentWorkspace; classId: string; draftId?: string | null }) {
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
  const questions = getReviewedQuestionVersions().map(toLearnerQuestion);
  return <main><div className="mx-auto max-w-6xl space-y-7">
    <Link className="inline-flex min-h-11 items-center text-sm font-bold text-[var(--moss)] underline underline-offset-4" href={basePath}>← {access.data.className}</Link>
    <AdminPageHeader eyebrow={access.data.className} title={draftId ? 'Edit quiz draft' : 'Create a quiz draft'} description="Build a multiple-choice quiz from reviewed questions. Save your selection, points, instructions, and planned dates for this class." />
    <AssessmentDraftEditor key={`${access.data.authorId}:${classId}:${draftId ?? 'new'}`} workspace={workspace} classId={classId} authorId={access.data.authorId} initialDraft={access.data.draft} questions={questions} />
  </div></main>;
}
