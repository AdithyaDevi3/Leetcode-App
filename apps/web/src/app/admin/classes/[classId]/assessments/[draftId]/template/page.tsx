import { TemplateCreatePage } from '@/components/assessments/templates/template-pages';
export default async function AdministratorCreateTemplate({ params }: { params: Promise<{ classId: string; draftId: string }> }) {
  const { classId, draftId } = await params;
  return <TemplateCreatePage workspace="admin" classId={classId} draftId={draftId} />;
}
