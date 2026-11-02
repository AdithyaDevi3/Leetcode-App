import { TemplateDetailPage } from '@/components/assessments/templates/template-pages';
export default async function InstructorTemplate({ params }: { params: Promise<{ templateId: string }> }) {
  return <TemplateDetailPage workspace="teach" templateId={(await params).templateId} />;
}
