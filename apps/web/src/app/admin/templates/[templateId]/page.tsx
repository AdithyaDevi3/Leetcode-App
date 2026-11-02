import { TemplateDetailPage } from '@/components/assessments/templates/template-pages';
export default async function AdministratorTemplate({ params }: { params: Promise<{ templateId: string }> }) {
  return <TemplateDetailPage workspace="admin" templateId={(await params).templateId} />;
}
