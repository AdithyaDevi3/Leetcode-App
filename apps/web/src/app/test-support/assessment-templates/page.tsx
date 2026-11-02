import { notFound } from 'next/navigation';
import { TemplateCreate } from '@/components/assessments/templates/template-create';
import { TemplateDetail } from '@/components/assessments/templates/template-detail';
import { TemplateLibrary } from '@/components/assessments/templates/template-library';
export const dynamic = 'force-dynamic';
export default async function TemplateFixture({ searchParams }: { searchParams: Promise<{ mode?: string; workspace?: string }> }) {
  if (process.env.METHOD_E2E_FIXTURES !== '1') notFound();
  const query = await searchParams, workspace = query.workspace === 'admin' ? 'admin' : 'teach';
  const actorId = '11111111-1111-4111-8111-111111111111';
  return query.mode === 'create' ? <TemplateCreate key={`${workspace}:create`} actorId={actorId} workspace={workspace} classId="33333333-3333-4333-8333-333333333333" draftId="55555555-5555-4555-8555-555555555555" />
    : query.mode === 'detail' ? <TemplateDetail key={`${workspace}:detail`} actorId={actorId} workspace={workspace} templateId="66666666-6666-4666-8666-666666666666" />
      : <TemplateLibrary key={`${workspace}:library`} actorId={actorId} workspace={workspace} />;
}
