import { redirect } from 'next/navigation';
import { PostgresClassroomRepository } from '@leetcode-app/database';
import { AdminAreaDenied } from '@/components/admin/admin-access-denied';
import { AdminEmptyState, AdminPageHeader, AdminSection } from '@/components/admin/admin-ui';
import { readAdministrationData } from '@/lib/admin/authorization';
import { createClassroom } from './actions';

export default async function AdminClassesPage({ searchParams }: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [access, notice] = await Promise.all([
    readAdministrationData('classes.read', async (_repository, _principal, db) =>
      new PostgresClassroomRepository(db).listClasses()),
    searchParams,
  ]);
  if (access.status === 'unauthenticated') redirect('/auth?next=%2Fadmin%2Fclasses');
  if (access.status === 'forbidden') return <AdminAreaDenied />;

  return <div className="space-y-7">
    <AdminPageHeader eyebrow="Learning groups" title="Classes" description="Create a class, share its join code, and assign practice activities to enrolled learners." />
    {notice.error ? <p role="alert" className="rounded-lg border border-[var(--coral)] bg-[var(--coral-soft)] px-4 py-3 text-sm text-red-950">{notice.error}</p> : null}

    <AdminSection title="Create a class" description="The code appears after creation. Learners need a signed-in account to join.">
      <form action={createClassroom} className="grid gap-4 p-5 sm:p-6">
        <label className="grid gap-1.5 text-sm font-bold text-[var(--ink)]">Class name
          <input autoComplete="off" className="min-h-11 rounded-md border border-[var(--line)] bg-white px-3 font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)]" maxLength={120} minLength={3} name="name" placeholder="Algorithms, Fall term" required />
        </label>
        <label className="grid gap-1.5 text-sm font-bold text-[var(--ink)]">Description <span className="font-normal text-[var(--muted)]">Optional</span>
          <textarea className="min-h-24 rounded-md border border-[var(--line)] bg-white p-3 font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)]" maxLength={1000} name="description" placeholder="Who this class is for and what learners will practice" />
        </label>
        <label className="grid gap-1.5 text-sm font-bold text-[var(--ink)]">Reason for creating this class
          <input className="min-h-11 rounded-md border border-[var(--line)] bg-white px-3 font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)]" maxLength={500} minLength={8} name="reason" placeholder="For the Fall algorithms cohort" required />
        </label>
        <button className="min-h-11 justify-self-start rounded-md bg-[var(--moss)] px-5 font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)]" type="submit">Create class and code</button>
      </form>
    </AdminSection>

    <AdminSection title="Your classes" description="Open a class to view its code, learners, assignments, and completion counts.">
      {access.data.length === 0 ? <AdminEmptyState>No classes have been created.</AdminEmptyState> : <div className="grid gap-px bg-[var(--line)] sm:grid-cols-2">
        {access.data.map((classroom) => <a className="block bg-[var(--surface)] p-5 no-underline hover:bg-[var(--moss-soft)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--moss)]" href={`/admin/classes/${classroom.id}`} key={classroom.id}>
          <strong className="block text-lg text-[var(--ink)]">{classroom.name} →</strong>
          {classroom.description ? <span className="mt-2 block text-sm leading-6 text-[var(--muted)]">{classroom.description}</span> : null}
          <span className="mt-4 block text-xs font-bold uppercase tracking-wide text-[var(--muted)]">{classroom.learnerCount} learners · {classroom.assignmentCount} tasks</span>
        </a>)}
      </div>}
    </AdminSection>
  </div>;
}
