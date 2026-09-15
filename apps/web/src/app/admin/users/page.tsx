import { redirect } from 'next/navigation';
import { administrationRoles, canPerformAdministrationAction, type AdministrationRole } from '@leetcode-app/domain';
import { AdminAreaDenied } from '@/components/admin/admin-access-denied';
import {
  AdminBadge,
  AdminEmptyState,
  AdminPageHeader,
  AdminSection,
  AdminTable,
  adminTableCellClass,
  adminTableHeadClass,
  formatAdminDate,
} from '@/components/admin/admin-ui';
import { readAdministrationData } from '@/lib/admin/authorization';
import { updateAdministrationRoles } from './actions';

const roleLabel = (role: string) => role.replaceAll('_', ' ');

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ error?: string; updated?: string }> }) {
  const [access, notice] = await Promise.all([
    readAdministrationData('users.read', (repository) => repository.listUsers()),
    searchParams,
  ]);
  if (access.status === 'unauthenticated') redirect('/auth?next=%2Fadmin%2Fusers');
  if (access.status === 'forbidden') return <AdminAreaDenied />;
  const canManage = canPerformAdministrationAction(access.principal.roles, 'administration.manage');

  return <div className="space-y-7">
    <AdminPageHeader eyebrow="Access control" title="People and roles" description="Review learner accounts and assign narrowly scoped operator roles. Role changes require a reason and are written to the audit log." />
    {notice.error ? <p role="alert" className="rounded-lg border border-[var(--coral)] bg-[var(--coral-soft)] px-4 py-3 text-sm text-red-950">{notice.error}</p> : null}
    {notice.updated ? <p role="status" className="rounded-lg border border-[var(--moss)] bg-[var(--moss-soft)] px-4 py-3 text-sm text-[var(--moss)]">{notice.updated}</p> : null}

    <AdminSection title="Recent accounts" description={`Showing the ${Math.min(access.data.length, 50)} most recently created accounts.`}>
      {access.data.length === 0 ? <AdminEmptyState>No learner accounts have been created.</AdminEmptyState> : <AdminTable label="Learner accounts and administration roles">
        <thead><tr><th className={adminTableHeadClass}>Person</th><th className={adminTableHeadClass}>Joined</th><th className={adminTableHeadClass}>Operator roles</th><th className={adminTableHeadClass}>Access change</th></tr></thead>
        <tbody>{access.data.map((user) => <tr key={user.id}>
          <td className={adminTableCellClass}><strong className="block">{user.displayName}</strong><span className="mt-1 block text-xs text-[var(--muted)]">{user.email ?? 'No email'}</span></td>
          <td className={adminTableCellClass}>{formatAdminDate(user.createdAt)}</td>
          <td className={adminTableCellClass}><div className="flex max-w-xs flex-wrap gap-1.5">{user.roles.length ? user.roles.map((role: AdministrationRole) => <AdminBadge key={role} value={role} />) : <span className="text-[var(--muted)]">Learner only</span>}</div></td>
          <td className={adminTableCellClass}>{canManage ? <details className="max-w-md">
            <summary className="cursor-pointer font-bold text-[var(--moss)] underline underline-offset-4">Edit roles</summary>
            <form action={updateAdministrationRoles} className="mt-4 space-y-4 rounded-lg border border-[var(--line)] bg-[#f8f6ef] p-4">
              <input name="targetUserId" type="hidden" value={user.id} />
              <fieldset><legend className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Assignments</legend><div className="grid gap-2 sm:grid-cols-2">{administrationRoles.map((role) => <label className="flex items-start gap-2 text-xs" key={role}><input className="mt-0.5" defaultChecked={user.roles.includes(role)} name="roles" type="checkbox" value={role} /><span className="capitalize">{roleLabel(role)}</span></label>)}</div></fieldset>
              <label className="block text-xs font-bold text-[var(--muted)]">Reason<input className="mt-1 min-h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm font-normal text-[var(--ink)]" maxLength={500} minLength={8} name="reason" placeholder="Why is this access changing?" required /></label>
              <button className="min-h-10 rounded-md bg-[var(--moss)] px-4 text-sm font-bold text-white" type="submit">Save and audit</button>
            </form>
          </details> : <span className="text-xs text-[var(--muted)]">Administrator only</span>}</td>
        </tr>)}</tbody>
      </AdminTable>}
    </AdminSection>
  </div>;
}
