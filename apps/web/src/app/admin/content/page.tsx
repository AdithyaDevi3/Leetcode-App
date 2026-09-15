import { redirect } from 'next/navigation';
import { AdminAreaDenied } from '@/components/admin/admin-access-denied';
import { AdminBadge, AdminEmptyState, AdminPageHeader, AdminSection, AdminTable, adminTableCellClass, adminTableHeadClass, formatAdminDate } from '@/components/admin/admin-ui';
import { readAdministrationData } from '@/lib/admin/authorization';

export default async function AdminContentPage() {
  const access = await readAdministrationData('content.read', (repository) => repository.listContent());
  if (access.status === 'unauthenticated') redirect('/auth?next=%2Fadmin%2Fcontent');
  if (access.status === 'forbidden') return <AdminAreaDenied />;

  return <div className="space-y-7">
    <AdminPageHeader eyebrow="Curriculum" title="Content inventory" description="Inspect the versioned content source of record. Publishing and editing controls remain disabled until reviewed workflow actions are implemented." />
    <AdminSection title="Content items" description="Latest version metadata, ordered by most recently updated.">
      {access.data.length === 0 ? <AdminEmptyState>No versioned content is available.</AdminEmptyState> : <AdminTable label="Versioned content inventory">
        <thead><tr><th className={adminTableHeadClass}>Title</th><th className={adminTableHeadClass}>Type</th><th className={adminTableHeadClass}>Difficulty</th><th className={adminTableHeadClass}>Status</th><th className={adminTableHeadClass}>Version</th><th className={adminTableHeadClass}>Updated</th></tr></thead>
        <tbody>{access.data.map((item) => <tr key={item.id}><td className={adminTableCellClass}><strong>{item.title}</strong><span className="mt-1 block font-mono text-xs text-[var(--muted)]">{item.slug}</span></td><td className={`${adminTableCellClass} capitalize`}>{item.type}</td><td className={`${adminTableCellClass} capitalize`}>{item.difficulty}</td><td className={adminTableCellClass}><AdminBadge value={item.status} /></td><td className={adminTableCellClass}>{item.version ?? '—'}</td><td className={adminTableCellClass}>{formatAdminDate(item.updatedAt)}</td></tr>)}</tbody>
      </AdminTable>}
    </AdminSection>
  </div>;
}
