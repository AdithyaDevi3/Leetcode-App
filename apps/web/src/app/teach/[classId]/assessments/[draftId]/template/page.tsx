import { TemplateCreatePage } from '@/components/assessments/templates/template-pages';
export default async function InstructorCreateTemplate({ params }: { params: Promise<{ classId: string; draftId: string }> }) {
  const { classId, draftId } = await params;
  return <TemplateCreatePage workspace="teach" classId={classId} draftId={draftId} />;
}
