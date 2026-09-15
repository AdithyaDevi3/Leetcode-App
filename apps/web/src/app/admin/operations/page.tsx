import { redirect } from 'next/navigation';
import { AdminAreaDenied } from '@/components/admin/admin-access-denied';
import { AdminBadge, AdminEmptyState, AdminMetric, AdminPageHeader, AdminSection, AdminTable, adminTableCellClass, adminTableHeadClass, formatAdminDate } from '@/components/admin/admin-ui';
import { readAdministrationData } from '@/lib/admin/authorization';

export default async function AdminOperationsPage() {
  const access = await readAdministrationData('operations.read', async (repository) => {
    const [operations, appeals] = await Promise.all([repository.getOperations(), repository.listAppeals()]);
    return { operations, appeals };
  });
  if (access.status === 'unauthenticated') redirect('/auth?next=%2Fadmin%2Foperations');
  if (access.status === 'forbidden') return <AdminAreaDenied />;
  const { operations, appeals } = access.data;

  return <div className="space-y-7">
    <AdminPageHeader eyebrow="Runtime" title="Operations" description="Monitor evaluation and sandbox execution queues without exposing submitted source code or worker credentials." />
    <section aria-label="Queue status" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <AdminMetric label="Evaluations queued" value={operations.evaluations.queued ?? 0} note={`Oldest: ${formatAdminDate(operations.oldestEvaluationQueuedAt)}`} />
      <AdminMetric label="Evaluations running" value={operations.evaluations.running ?? 0} note={`${operations.evaluations.failed ?? 0} failed`} />
      <AdminMetric label="Executions queued" value={operations.executions.queued ?? 0} note={`Oldest: ${formatAdminDate(operations.oldestExecutionQueuedAt)}`} />
      <AdminMetric label="Executions running" value={operations.executions.running ?? 0} note={`${operations.executions.failed ?? 0} failed · ${operations.executions.timed_out ?? 0} timed out`} />
    </section>
    <AdminSection title="Evaluation appeals" description="Read-only appeal metadata. Resolution actions arrive in the reviewed-actions phase.">
      {appeals.length === 0 ? <AdminEmptyState>No evaluation appeals have been submitted.</AdminEmptyState> : <AdminTable label="Evaluation appeals">
        <thead><tr><th className={adminTableHeadClass}>Appeal</th><th className={adminTableHeadClass}>Learner</th><th className={adminTableHeadClass}>Finding</th><th className={adminTableHeadClass}>Status</th><th className={adminTableHeadClass}>Submitted</th></tr></thead>
        <tbody>{appeals.map((appeal) => <tr key={appeal.id}><td className={`${adminTableCellClass} font-mono text-xs`}>{appeal.id.slice(0, 8)}</td><td className={adminTableCellClass}>{appeal.submittedBy}</td><td className={`${adminTableCellClass} font-mono text-xs`}>{appeal.findingId}</td><td className={adminTableCellClass}><AdminBadge value={appeal.status} /></td><td className={adminTableCellClass}>{formatAdminDate(appeal.createdAt)}</td></tr>)}</tbody>
      </AdminTable>}
    </AdminSection>
  </div>;
}
