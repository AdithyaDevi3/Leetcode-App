import { AssessmentDraftPage } from '@/components/assessments/assessment-draft-page';
export default async function EditInstructorQuizDraft({ params }: { params: Promise<{ classId: string; draftId: string }> }) {
  const { classId, draftId } = await params;
  return <AssessmentDraftPage workspace="teach" classId={classId} draftId={draftId} />;
}
