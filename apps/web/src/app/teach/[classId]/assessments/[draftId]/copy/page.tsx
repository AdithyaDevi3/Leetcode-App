import { AssessmentCopyPage } from '@/components/assessments/assessment-copy-page';

export default async function CopyInstructorQuizDraft({ params }: { params: Promise<{ classId: string; draftId: string }> }) {
  const { classId, draftId } = await params;
  return <AssessmentCopyPage workspace="teach" classId={classId} draftId={draftId} />;
}
