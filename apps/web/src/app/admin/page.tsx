import { redirect } from 'next/navigation';
import { canPerformAdministrationAction } from '@leetcode-app/domain';
import { AdminAreaDenied } from '@/components/admin/admin-access-denied';
import { AdminMetric, AdminPageHeader, AdminSection } from '@/components/admin/admin-ui';
import { readAdministrationData } from '@/lib/admin/authorization';

export default async function AdminOverviewPage() {
  const access = await readAdministrationData('administration.access', (repository) => repository.getOverview());
  if (access.status === 'unauthenticated') redirect('/auth?next=%2Fadmin');
  if (access.status === 'forbidden') return <AdminAreaDenied />;

  const { data, principal } = access;
  const can = (action: Parameters<typeof canPerformAdministrationAction>[1]) => canPerformAdministrationAction(principal.roles, action);
  const areas = [
    can('users.read') && { href: '/admin/users', label: 'People & roles', description: 'Review accounts and operator assignments.' },
    can('content.read') && { href: '/admin/content', label: 'Content', description: 'Inspect the versioned curriculum inventory.' },
    can('operations.read') && { href: '/admin/operations', label: 'Operations', description: 'Watch evaluation and execution queues.' },
    can('support.read') && { href: '/admin/feedback', label: 'Feedback', description: 'Triage learner questions and requests.' },
    can('privacy.read') && { href: '/admin/privacy', label: 'Privacy', description: 'Track account export and deletion requests.' },
    can('audit.read') && { href: '/admin/audit', label: 'Audit log', description: 'Review attributable privileged changes.' },
  ].filter((area): area is { href: string; label: string; description: string } => Boolean(area));

  return <div className="space-y-7">
    <AdminPageHeader eyebrow="Operator workspace" title="Administration overview" description="A safe, server-authorized view of learner activity and operational queues. Counts are live from the production data model." />

    <section aria-label="Administration metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {can('users.read') ? <AdminMetric label="Learners" value={data.users} note={`${data.usersThisWeek} joined in the last 7 days`} /> : null}
      <AdminMetric label="Active practice" value={data.activePracticeSessions} note="Sessions currently in progress" />
      {can('support.read') ? <AdminMetric label="Open feedback" value={data.openFeedback} note="Submitted through accepted requests" /> : null}
      {can('evaluation.read') ? <AdminMetric label="Evaluation appeals" value={data.pendingAppeals} note="Awaiting or under review" /> : null}
      {can('operations.read') ? <AdminMetric label="Evaluation queue" value={data.queuedEvaluations} note="Jobs waiting for a worker" /> : null}
      {can('operations.read') ? <AdminMetric label="Execution queue" value={data.queuedExecutions} note="Sandbox jobs waiting to run" /> : null}
      {can('privacy.read') ? <AdminMetric label="Privacy queue" value={data.pendingPrivacyRequests} note="Export or deletion requests" /> : null}
    </section>

    <AdminSection title="Your work areas" description="Only areas permitted by your current roles are shown.">
      <div className="grid gap-px bg-[var(--line)] sm:grid-cols-2 xl:grid-cols-3">
        {areas.map((area) => <a className="group min-h-32 bg-[var(--surface)] p-5 no-underline transition hover:bg-[var(--moss-soft)]" href={area.href} key={area.href}>
          <span className="font-bold text-[var(--ink)] group-hover:text-[var(--moss)]">{area.label} →</span>
          <span className="mt-2 block text-sm leading-6 text-[var(--muted)]">{area.description}</span>
        </a>)}
      </div>
    </AdminSection>

    <aside className="rounded-xl border border-[var(--mustard)] bg-[#fff7df] p-5 text-sm leading-6 text-[#5d4315]">
      <strong className="block text-[var(--ink)]">Privacy guardrail</strong>
      This overview intentionally excludes submitted source code, passwords, tokens, and full request text. Open only the work area needed for the task at hand.
    </aside>
  </div>;
}
