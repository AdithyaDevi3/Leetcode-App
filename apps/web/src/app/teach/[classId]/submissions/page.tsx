import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { GradebookAccessError } from '@leetcode-app/database';
import { AdminBadge, AdminEmptyState, AdminPageHeader, AdminSection, AdminTable, adminTableCellClass, adminTableHeadClass, formatAdminDate } from '@/components/admin/admin-ui';
import { withInstructorGradebook } from '@/lib/instructor-gradebook';

export default async function SubmissionInboxPage({ params, searchParams }: {
  params: Promise<{ classId: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const [{ classId }, query] = await Promise.all([params, searchParams]);
  const status = ['awaiting_review', 'draft', 'published'].includes(query.status ?? '')
    ? query.status as 'awaiting_review' | 'draft' | 'published' : undefined;
  let page;
  try { page = await withInstructorGradebook(repository => repository.listManualReviewInbox({ classId, limit: 100 })); }
  catch (error) {
    if (error instanceof GradebookAccessError) notFound();
    if (error instanceof Error && 'status' in error && error.status === 401) redirect(`/auth?next=${encodeURIComponent(`/teach/${classId}/submissions`)}`);
    throw error;
  }
  const counts = page.items.reduce((result, item) => ({ ...result, [item.status]: result[item.status] + 1 }), { awaiting_review: 0, draft: 0, published: 0 });
  const items = status ? page.items.filter(item => item.status === status) : page.items;
  return <main><div className="mx-auto max-w-6xl space-y-7">
    <Link className="inline-flex text-sm font-bold text-[var(--moss)] underline underline-offset-4" href={`/teach/${classId}`}>← Class workspace</Link>
    <AdminPageHeader eyebrow="Manual grading" title="Submission inbox" description="Review the latest learner response, save rubric scores privately, then publish when the grade and feedback are ready." />
    <nav aria-label="Submission filters" className="flex flex-wrap gap-2">
      {[['', 'All'], ['awaiting_review', 'Awaiting review'], ['draft', 'Drafts'], ['published', 'Published']].map(([value, label]) =>
        <Link key={value} href={value ? `?status=${value}` : `?`} className={`rounded-full border px-3 py-2 text-sm font-bold no-underline ${status === (value || undefined) ? 'border-[var(--moss)] bg-[var(--moss-soft)] text-[var(--moss)]' : 'border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]'}`}>{label}{value ? ` (${counts[value as keyof typeof counts]})` : ''}</Link>)}
    </nav>
    <AdminSection title="Latest submissions" description="A new learner submission supersedes any unfinished review of an older response.">
      {items.length === 0 ? <AdminEmptyState>No submissions match this view.</AdminEmptyState> : <AdminTable label="Learner submissions">
        <thead><tr><th className={adminTableHeadClass}>Learner</th><th className={adminTableHeadClass}>Assignment</th><th className={adminTableHeadClass}>Submitted</th><th className={adminTableHeadClass}>Status</th><th className={adminTableHeadClass}>Action</th></tr></thead>
        <tbody>{items.map(item => <tr key={item.recipientId}>
          <td className={adminTableCellClass}><strong>{item.learner.displayName}</strong></td>
          <td className={adminTableCellClass}>{item.assignment.title}<span className="mt-1 block text-xs text-[var(--muted)]">Attempt {item.latestAttempt.sequence}</span></td>
          <td className={adminTableCellClass}>{formatAdminDate(item.latestAttempt.submittedAt)}</td>
          <td className={adminTableCellClass}><AdminBadge value={item.status} /></td>
          <td className={adminTableCellClass}><Link className="font-bold text-[var(--moss)] underline underline-offset-4" href={`/teach/${classId}/submissions/${item.recipientId}`}>{item.status === 'published' ? 'Review grade' : 'Grade submission'}</Link></td>
        </tr>)}</tbody>
      </AdminTable>}
    </AdminSection>
  </div></main>;
}
