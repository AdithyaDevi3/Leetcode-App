import { AssessmentDraftPage } from '@/components/assessments/assessment-draft-page';
export default async function NewInstructorQuizDraft({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  return <AssessmentDraftPage workspace="teach" classId={classId} />;
}
