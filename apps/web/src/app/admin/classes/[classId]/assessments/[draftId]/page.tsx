import { AssessmentDraftPage } from '@/components/assessments/assessment-draft-page';
export default async function EditAdministratorQuizDraft({ params }: { params: Promise<{ classId: string; draftId: string }> }) {
  const { classId, draftId } = await params;
  return <AssessmentDraftPage workspace="admin" classId={classId} draftId={draftId} />;
}
