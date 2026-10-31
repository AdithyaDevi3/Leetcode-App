import { AssessmentDraftPage } from '@/components/assessments/assessment-draft-page';
export default async function NewAdministratorQuizDraft({ params, searchParams }: { params: Promise<{ classId: string }>; searchParams: Promise<{ focus?: string | string[] }> }) {
  const [{ classId }, { focus }] = await Promise.all([params, searchParams]);
  return <AssessmentDraftPage workspace="admin" classId={classId} focus={focus} />;
}
