import { AssessmentDraftPage } from '@/components/assessments/assessment-draft-page';
export default async function NewAdministratorQuizDraft({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  return <AssessmentDraftPage workspace="admin" classId={classId} />;
}
