import { redirect } from 'next/navigation';
import { AdminAreaDenied } from '@/components/admin/admin-access-denied';
import { AdminBadge, AdminEmptyState, AdminPageHeader, AdminSection, AdminTable, adminTableCellClass, adminTableHeadClass, formatAdminDate } from '@/components/admin/admin-ui';
import { readAdministrationData } from '@/lib/admin/authorization';

export default async function AdminFeedbackPage() {
  const access = await readAdministrationData('support.read', (repository) => repository.listFeedback());
  if (access.status === 'unauthenticated') redirect('/auth?next=%2Fadmin%2Ffeedback');
  if (access.status === 'forbidden') return <AdminAreaDenied />;

  return <div className="space-y-7">
    <AdminPageHeader eyebrow="Learner voice" title="Feedback queue" description="Review question and feature-request metadata. Full request text is intentionally excluded from this overview." />
    <AdminSection title="Recent submissions" description="Newest submissions first; status changes remain read-only in this release.">
      {access.data.length === 0 ? <AdminEmptyState>No learner feedback has been submitted.</AdminEmptyState> : <AdminTable label="Learner feedback queue">
        <thead><tr><th className={adminTableHeadClass}>Request</th><th className={adminTableHeadClass}>Type</th><th className={adminTableHeadClass}>Submitted by</th><th className={adminTableHeadClass}>Status</th><th className={adminTableHeadClass}>Created</th></tr></thead>
        <tbody>{access.data.map((request) => <tr key={request.id}><td className={adminTableCellClass}><strong>{request.title}</strong><span className="mt-1 block font-mono text-xs text-[var(--muted)]">{request.id.slice(0, 8)}</span></td><td className={`${adminTableCellClass} capitalize`}>{request.type}</td><td className={adminTableCellClass}>{request.submittedBy}</td><td className={adminTableCellClass}><AdminBadge value={request.status} /></td><td className={adminTableCellClass}>{formatAdminDate(request.createdAt)}</td></tr>)}</tbody>
      </AdminTable>}
    </AdminSection>
  </div>;
}
