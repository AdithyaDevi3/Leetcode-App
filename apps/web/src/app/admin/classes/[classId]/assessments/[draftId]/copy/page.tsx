import { AssessmentCopyPage } from '@/components/assessments/assessment-copy-page';

export default async function CopyAdminQuizDraft({ params }: { params: Promise<{ classId: string; draftId: string }> }) {
  const { classId, draftId } = await params;
  return <AssessmentCopyPage workspace="admin" classId={classId} draftId={draftId} />;
}
