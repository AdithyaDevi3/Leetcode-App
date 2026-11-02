import { notFound, redirect } from 'next/navigation';
import { AdminAreaDenied } from '@/components/admin/admin-access-denied';
import { readAssessmentCopyPage } from '@/lib/assessment-copy-api';
import { readTemplateDetailPage, readTemplateLibraryPage } from '@/lib/assessment-template-api';
import type { TemplateWorkspace } from '@/lib/assessment-template-api-types';
import { TemplateCreate } from './template-create';
import { TemplateDetail } from './template-detail';
import { TemplateLibrary } from './template-library';
import { classPath, libraryPath } from './template-ui';

export async function TemplateLibraryPage({ workspace }: { workspace: TemplateWorkspace }) {
  const access = await readTemplateLibraryPage(workspace);
  if (access.status === 'unauthenticated') redirect(`/auth?next=${encodeURIComponent(libraryPath(workspace))}`);
  if (access.status !== 'authorized') return workspace === 'admin' ? <AdminAreaDenied /> : redirect('/teach/start');
  return <TemplateLibrary key={`${access.actorId}:${workspace}`} actorId={access.actorId} workspace={workspace} />;
}
export async function TemplateDetailPage({ workspace, templateId }: { workspace: TemplateWorkspace; templateId: string }) {
  const access = await readTemplateDetailPage(workspace, templateId);
  if (access.status === 'unauthenticated') redirect(`/auth?next=${encodeURIComponent(`${libraryPath(workspace)}/${templateId}`)}`);
  if (access.status === 'forbidden') return workspace === 'admin' ? <AdminAreaDenied /> : redirect('/teach/start');
  if (access.status !== 'authorized') notFound();
  return <TemplateDetail key={`${access.actorId}:${workspace}:${access.templateId}`} actorId={access.actorId} workspace={workspace} templateId={access.templateId} />;
}
export async function TemplateCreatePage({ workspace, classId, draftId }: { workspace: TemplateWorkspace; classId: string; draftId: string }) {
  const access = await readAssessmentCopyPage(workspace, classId, draftId);
  if (access.status === 'unauthenticated') redirect(`/auth?next=${encodeURIComponent(`${classPath(workspace, classId)}/assessments/${draftId}/template`)}`);
  if (access.status === 'forbidden') return workspace === 'admin' ? <AdminAreaDenied /> : redirect('/teach/start');
  if (access.status !== 'authorized') notFound();
  return <TemplateCreate key={`${access.data.actorId}:${workspace}:${access.data.source.id}`} workspace={workspace} actorId={access.data.actorId} classId={access.data.source.classId} draftId={access.data.source.id} />;
}
