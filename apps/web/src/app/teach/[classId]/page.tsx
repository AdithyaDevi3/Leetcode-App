import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ClassroomNotFoundError } from '@leetcode-app/database';
import {
  AdminBadge, AdminEmptyState, AdminPageHeader, AdminSection, AdminTable,
  adminTableCellClass, adminTableHeadClass, formatAdminDate,
} from '@/components/admin/admin-ui';
import { practiceItems } from '@/lib/content';
import { readInstructorData } from '@/lib/instructor-access';
import { createClassAssignment } from '../actions';

const formatDueDate = (value: string | null) => value
  ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
  : 'No due date';

export default async function InstructorClassDetailPage({ params, searchParams }: {
  params: Promise<{ classId: string }>;
  searchParams: Promise<{ error?: string; created?: string }>;
}) {
  const [{ classId }, notice] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(classId)) notFound();
  const access = await readInstructorData(async (repository) => {
    try { return await repository.getClassDetail(classId); }
    catch (error) { if (error instanceof ClassroomNotFoundError) return null; throw error; }
  });
  if (access.status === 'unauthenticated') redirect('/auth?next=%2Fteach');
  if (access.status === 'forbidden') redirect('/teach/start');
  if (!access.data) notFound();
  const { classroom, assignments, learners } = access.data;
  const displayCode = `${classroom.joinCode.slice(0, 6)}-${classroom.joinCode.slice(6)}`;

  return <main><div className="mx-auto max-w-6xl space-y-7">
    <Link className="inline-flex text-sm font-bold text-[var(--moss)] underline underline-offset-4" href="/teach">← All classes</Link>
    <AdminPageHeader eyebrow="Class workspace" title={classroom.name} description={classroom.description || 'Share the code, assign activities, and follow learner progress.'} />
    {notice.error ? <p role="alert" className="rounded-lg border border-[var(--coral)] bg-[var(--coral-soft)] px-4 py-3 text-sm text-red-950">{notice.error}</p> : null}
    {notice.created ? <p role="status" className="rounded-lg border border-[var(--moss)] bg-[var(--moss-soft)] px-4 py-3 text-sm text-[var(--moss)]">{notice.created}</p> : null}

    <section aria-label="Class summary" className="grid gap-4 md:grid-cols-3">
      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 md:col-span-1">
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Learner join code</p>
        <p className="mt-3 select-all font-mono text-2xl font-bold tracking-wider text-[var(--ink)]">{displayCode}</p>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">Share this code privately. Learners sign in and enter it on the Classes page.</p>
      </div>
      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Learners</p>
        <p className="mt-3 font-mono text-3xl font-bold">{classroom.learnerCount}</p>
      </div>
      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Tasks</p>
        <p className="mt-3 font-mono text-3xl font-bold">{classroom.assignmentCount}</p>
      </div>
    </section>

    <AdminSection title="Assign a practice task" description="Choose an existing activity. Completion is based on passing its verified code tests.">
      <form action={createClassAssignment} className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
        <input name="classId" type="hidden" value={classId} />
        <label className="grid gap-1.5 text-sm font-bold">Task title
          <input className="min-h-11 rounded-md border border-[var(--line)] bg-white px-3 font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)]" maxLength={160} minLength={3} name="title" placeholder="Complete Pair With Target" required />
        </label>
        <label className="grid gap-1.5 text-sm font-bold">Practice activity
          <select className="min-h-11 rounded-md border border-[var(--line)] bg-white px-3 font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)]" defaultValue="" name="activitySlug" required>
            <option disabled value="">Select an activity</option>
            {practiceItems.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-bold">Due date <span className="font-normal text-[var(--muted)]">Optional</span>
          <input className="min-h-11 rounded-md border border-[var(--line)] bg-white px-3 font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)]" name="dueOn" type="date" />
        </label>

        <label className="grid gap-1.5 text-sm font-bold sm:col-span-2">Instructions <span className="font-normal text-[var(--muted)]">Optional</span>
          <textarea className="min-h-24 rounded-md border border-[var(--line)] bg-white p-3 font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)]" maxLength={2000} name="instructions" placeholder="What should learners focus on?" />
        </label>
        <button className="min-h-11 justify-self-start rounded-md bg-[var(--moss)] px-5 font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)] sm:col-span-2" type="submit">Assign task</button>
      </form>
    </AdminSection>

    <AdminSection title="Assigned tasks" description="Learners see these tasks as soon as they join the class.">
      {assignments.length === 0 ? <AdminEmptyState>No tasks have been assigned yet.</AdminEmptyState> : <AdminTable label="Class assignments">
        <thead><tr><th className={adminTableHeadClass}>Task</th><th className={adminTableHeadClass}>Activity</th><th className={adminTableHeadClass}>Due</th><th className={adminTableHeadClass}>Completed</th></tr></thead>
        <tbody>{assignments.map((item) => <tr key={item.id}>
          <td className={adminTableCellClass}><strong className="block">{item.title}</strong>{item.instructions ? <span className="mt-1 block text-xs text-[var(--muted)]">{item.instructions}</span> : null}</td>
          <td className={adminTableCellClass}>{practiceItems.find((activity) => activity.id === item.activitySlug)?.label ?? item.activitySlug}</td>
          <td className={adminTableCellClass}>{formatDueDate(item.dueOn)}</td>
          <td className={adminTableCellClass}>{item.completedCount} / {classroom.learnerCount}</td>
        </tr>)}</tbody>
      </AdminTable>}
    </AdminSection>

    <AdminSection title="Learners" description="Progress counts activities completed through verified practice.">
      {learners.length === 0 ? <AdminEmptyState>No learners have joined. Share the class code to get started.</AdminEmptyState> : <AdminTable label="Class learners and progress">
        <thead><tr><th className={adminTableHeadClass}>Learner</th><th className={adminTableHeadClass}>Joined</th><th className={adminTableHeadClass}>Progress</th></tr></thead>
        <tbody>{learners.map((learner) => <tr key={learner.id}>
          <td className={adminTableCellClass}><strong className="block">{learner.displayName}</strong><span className="mt-1 block text-xs text-[var(--muted)]">{learner.email ?? 'No email'}</span></td>
          <td className={adminTableCellClass}>{formatAdminDate(learner.joinedAt)}</td>
          <td className={adminTableCellClass}><AdminBadge value={learner.completedCount === assignments.length && assignments.length ? 'completed' : 'in_progress'} /> <span className="ml-2 text-xs text-[var(--muted)]">{learner.completedCount} / {assignments.length} tasks</span></td>
        </tr>)}</tbody>
      </AdminTable>}
    </AdminSection>
  </div></main>;
}
