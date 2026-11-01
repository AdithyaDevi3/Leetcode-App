import Link from 'next/link';
import { AdminBadge, AdminEmptyState, AdminSection, formatAdminDate } from '@/components/admin/admin-ui';
import { readAssessmentAuthorData, type AssessmentWorkspace } from '@/lib/assessment-author';

export async function AssessmentDraftList({ workspace, classId }: { workspace: AssessmentWorkspace; classId: string }) {
  const basePath = workspace === 'admin' ? `/admin/classes/${classId}` : `/teach/${classId}`;
    const access = await readAssessmentAuthorData(workspace, repository => repository.listDrafts(classId)).catch(() => null);
    if (!access) return <AdminSection title="Quiz drafts"><p role="alert" className="p-5 text-sm">Quiz drafts are temporarily unavailable. Reload to try again.</p></AdminSection>;
    if (access.status !== 'authorized') return null;
    return <AdminSection title="Quiz drafts" description="Build, save, and resume multiple-choice quizzes for this class. Learners cannot see drafts.">
      <div className="p-5"><Link className="inline-flex min-h-11 items-center rounded-md bg-[var(--moss)] px-4 font-bold text-white no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)]" href={`${basePath}/assessments/new`}>Create a quiz draft</Link></div>
      {access.data.length === 0 ? <AdminEmptyState>No quiz drafts yet. Start with questions from the reviewed bank.</AdminEmptyState> : <ul className="divide-y divide-[var(--line)] px-5 pb-5">{access.data.map(draft => <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between" key={draft.id}><div><h3 className="mb-2 text-base font-bold">{draft.title}</h3><p className="mb-2 text-sm text-[var(--muted)]">{draft.questions.length} questions · {(draft.maxUnits / 100).toFixed(2).replace(/\.00$/, '')} points · Updated {formatAdminDate(draft.updatedAt)}</p><AdminBadge value="draft" /></div><div className="flex flex-wrap gap-2">{[['Edit draft', `${basePath}/assessments/${draft.id}`], ['Copy draft', `${basePath}/assessments/${draft.id}/copy`]].map(([label, href]) => <Link key={href} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md border border-[var(--line)] px-4 text-sm font-bold text-[var(--moss)] no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)]" href={href}>{label}</Link>)}</div></li>)}</ul>}
    </AdminSection>;
}
