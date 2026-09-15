import { redirect } from 'next/navigation';
import { AdminAreaDenied } from '@/components/admin/admin-access-denied';
import { AdminBadge, AdminEmptyState, AdminPageHeader, AdminSection, AdminTable, adminTableCellClass, adminTableHeadClass, formatAdminDate } from '@/components/admin/admin-ui';
import { readAdministrationData } from '@/lib/admin/authorization';

export default async function AdminPrivacyPage() {
  const access = await readAdministrationData('privacy.read', (repository) => repository.listPrivacyRequests());
  if (access.status === 'unauthenticated') redirect('/auth?next=%2Fadmin%2Fprivacy');
  if (access.status === 'forbidden') return <AdminAreaDenied />;

  return <div className="space-y-7">
    <AdminPageHeader eyebrow="Data rights" title="Privacy requests" description="Track account exports and deletions without exposing generated archives or personal request details." />
    <AdminSection title="Account lifecycle queue" description="Operational status only. Export and deletion execution remains outside this release.">
      {access.data.length === 0 ? <AdminEmptyState>No privacy requests are waiting.</AdminEmptyState> : <AdminTable label="Account privacy requests">
        <thead><tr><th className={adminTableHeadClass}>Request</th><th className={adminTableHeadClass}>Learner</th><th className={adminTableHeadClass}>Type</th><th className={adminTableHeadClass}>Status</th><th className={adminTableHeadClass}>Requested</th></tr></thead>
        <tbody>{access.data.map((request) => <tr key={request.id}><td className={`${adminTableCellClass} font-mono text-xs`}>{request.id.slice(0, 8)}</td><td className={adminTableCellClass}>{request.submittedBy}</td><td className={`${adminTableCellClass} capitalize`}>{request.type}</td><td className={adminTableCellClass}><AdminBadge value={request.status} /></td><td className={adminTableCellClass}>{formatAdminDate(request.requestedAt)}</td></tr>)}</tbody>
      </AdminTable>}
    </AdminSection>
  </div>;
}
