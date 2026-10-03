import { GradebookAccessError } from '@leetcode-app/database';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AdminBadge, AdminEmptyState, AdminPageHeader, AdminSection, AdminTable, adminTableCellClass, adminTableHeadClass, formatAdminDate } from '@/components/admin/admin-ui';
import { withInstructorGradebook } from '@/lib/instructor-gradebook';

const points = (units: number) => (units / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });

export default async function GradeDisputesPage({ params, searchParams }: {
  params: Promise<{ classId: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const [{ classId }, query] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(classId)) notFound();
  const status = query.status === 'submitted' || query.status === 'in_review' ? query.status : undefined;
  let disputes;
  try { disputes = await withInstructorGradebook(repository => repository.listOpenGradeDisputes(classId)); }
  catch (error) {
    if (error instanceof GradebookAccessError) notFound();
    if (error instanceof Error && 'status' in error && error.status === 401) redirect(`/auth?next=${encodeURIComponent(`/teach/${classId}/disputes`)}`);
    throw error;
  }
  const counts = disputes.reduce((result, item) => ({ ...result, [item.dispute.status]: result[item.dispute.status] + 1 }), { submitted: 0, in_review: 0 });
  const items = status ? disputes.filter(item => item.dispute.status === status) : disputes;
  return <main><div className="mx-auto max-w-6xl space-y-7">
    <Link className="inline-flex text-sm font-bold text-[var(--moss)] underline underline-offset-4" href={`/teach/${classId}`}>← Class workspace</Link>
    <AdminPageHeader eyebrow="Grade reviews" title="Open learner requests" description="Review questions about published grades, record your decision, and give each learner a clear written response." action={<Link className="inline-flex min-h-11 items-center rounded-md border border-[var(--line)] bg-[var(--surface)] px-4 font-bold text-[var(--ink)] no-underline" href={`/teach/${classId}/gradebook`}>View gradebook</Link>} />
    <nav aria-label="Grade review filters" className="flex flex-wrap gap-2">
      {[['', 'All open', disputes.length], ['submitted', 'New', counts.submitted], ['in_review', 'In review', counts.in_review]].map(([value, label, count]) => <Link key={String(value)} href={value ? `?status=${value}` : '?'} className={`rounded-full border px-3 py-2 text-sm font-bold no-underline ${status === (value || undefined) ? 'border-[var(--moss)] bg-[var(--moss-soft)] text-[var(--moss)]' : 'border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]'}`}>{label} ({count})</Link>)}
    </nav>
    <AdminSection title="Requests requiring action" description="New requests can be acknowledged as in review. Resolve a request after checking the published grade and feedback.">
      {items.length === 0 ? <AdminEmptyState>{status ? 'No requests match this view.' : 'No open grade review requests.'}</AdminEmptyState> : <AdminTable label="Open grade review requests">
        <thead><tr><th className={adminTableHeadClass}>Learner</th><th className={adminTableHeadClass}>Assignment</th><th className={adminTableHeadClass}>Published grade</th><th className={adminTableHeadClass}>Request</th><th className={adminTableHeadClass}>Status</th><th className={adminTableHeadClass}>Action</th></tr></thead>
        <tbody>{items.map(item => <tr key={item.recipientId}>
          <td className={adminTableCellClass}><strong className="block">{item.learner.displayName}</strong><span className="mt-1 block text-xs text-[var(--muted)]">{item.learner.email ?? 'No email'}</span></td>
          <td className={adminTableCellClass}><strong className="block">{item.assignment.title}</strong><span className="mt-1 block text-xs text-[var(--muted)]">Opened {formatAdminDate(item.dispute.openedAt)}</span></td>
          <td className={`${adminTableCellClass} font-mono font-bold tabular-nums`}>{points(item.publishedGrade.earnedUnits)}</td>
          <td className={`${adminTableCellClass} max-w-sm`}><p className="mb-0 line-clamp-3 whitespace-pre-wrap text-sm leading-6">{item.dispute.requestMessage}</p></td>
          <td className={adminTableCellClass}><AdminBadge value={item.dispute.status.replaceAll('_', ' ')} /></td>
          <td className={adminTableCellClass}><Link className="font-bold text-[var(--moss)] underline underline-offset-4" href={`/teach/${classId}/submissions/${item.recipientId}`}>{item.dispute.status === 'submitted' ? 'Start review' : 'Continue review'}</Link></td>
        </tr>)}</tbody>
      </AdminTable>}
    </AdminSection>
  </div></main>;
}
