import { redirect } from 'next/navigation';
import { AdminAreaDenied } from '@/components/admin/admin-access-denied';
import { AdminEmptyState, AdminPageHeader, AdminSection, AdminTable, adminTableCellClass, adminTableHeadClass, formatAdminDate } from '@/components/admin/admin-ui';
import { readAdministrationData } from '@/lib/admin/authorization';

export default async function AdminAuditPage() {
  const access = await readAdministrationData('audit.read', (repository) => repository.listAuditEvents());
  if (access.status === 'unauthenticated') redirect('/auth?next=%2Fadmin%2Faudit');
  if (access.status === 'forbidden') return <AdminAreaDenied />;

  return <div className="space-y-7">
    <AdminPageHeader eyebrow="Accountability" title="Audit log" description="An immutable application trail of privileged changes. Payloads contain identifiers and change summaries, never learner submissions or credentials." />
    <AdminSection title="Privileged events" description="Newest events first, limited to the most recent 100 entries.">
      {access.data.length === 0 ? <AdminEmptyState>No privileged changes have been recorded.</AdminEmptyState> : <AdminTable label="Administration audit events">
        <thead><tr><th className={adminTableHeadClass}>When</th><th className={adminTableHeadClass}>Actor</th><th className={adminTableHeadClass}>Action</th><th className={adminTableHeadClass}>Target</th><th className={adminTableHeadClass}>Reason</th><th className={adminTableHeadClass}>Request</th></tr></thead>
        <tbody>{access.data.map((event) => <tr key={event.id}><td className={adminTableCellClass}>{formatAdminDate(event.createdAt)}</td><td className={adminTableCellClass}>{event.actor}</td><td className={`${adminTableCellClass} font-mono text-xs`}>{event.action}</td><td className={adminTableCellClass}><span className="block">{event.targetType}</span><span className="font-mono text-xs text-[var(--muted)]">{event.targetId.slice(0, 12)}</span></td><td className={`${adminTableCellClass} max-w-sm`}>{event.reason}</td><td className={`${adminTableCellClass} font-mono text-xs`}>{event.requestId?.slice(0, 12) ?? '—'}</td></tr>)}</tbody>
      </AdminTable>}
    </AdminSection>
  </div>;
}
