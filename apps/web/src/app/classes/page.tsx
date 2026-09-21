import { redirect } from 'next/navigation';
import { PostgresClassroomRepository, createDatabaseClient, databaseConfigFromEnv } from '@leetcode-app/database';
import { SiteNavigation } from '@/components/site-navigation';
import { getSession } from '@/lib/auth/session';
import { joinClassroom } from './actions';

const formatDueDate = (value: string | null) => value
  ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
  : 'No due date';

export default async function ClassesPage({ searchParams }: {
  searchParams: Promise<{ error?: string; joined?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/auth?next=%2Fclasses');
  const notice = await searchParams;
  const db = createDatabaseClient(databaseConfigFromEnv());
  const repository = new PostgresClassroomRepository(db);
  let classes;
  let assignments;
  try {
    [classes, assignments] = await Promise.all([
      repository.listStudentClasses(session.user.id),
      repository.listStudentAssignments(session.user.id),
    ]);
  } finally {
    await db.close();
  }

  return <main className="min-h-screen px-5 py-6 sm:px-8">
    <div className="mx-auto max-w-6xl space-y-8">
      <SiteNavigation currentPath="/classes" />
      <header className="max-w-3xl">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[var(--coral)]">Learning together</p>
        <h1 className="mb-3 text-3xl font-bold tracking-tight sm:text-4xl">My classes and tasks</h1>
        <p className="text-[var(--muted)]">Enter a class code from your instructor. Your assigned practice appears here, and completed activities update your progress.</p>
      </header>
      {notice.error ? <p role="alert" className="rounded-lg border border-[var(--coral)] bg-[var(--coral-soft)] px-4 py-3 text-sm text-red-950">{notice.error}</p> : null}
      {notice.joined ? <p role="status" className="rounded-lg border border-[var(--moss)] bg-[var(--moss-soft)] px-4 py-3 text-sm text-[var(--moss)]">{notice.joined}</p> : null}

      <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_10px_30px_rgba(34,46,38,0.05)] sm:p-6">
        <h2 className="mb-2 text-xl font-bold">Join a class</h2>
        <p className="mb-4 text-sm text-[var(--muted)]">You can continue using regular practice with or without a class.</p>
        <form action={joinClassroom} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="grid w-full max-w-sm gap-1.5 text-sm font-bold">Class code
            <input autoCapitalize="characters" autoComplete="off" className="min-h-11 rounded-md border border-[var(--line)] bg-white px-3 font-mono font-normal uppercase tracking-wider focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)]" maxLength={16} name="code" placeholder="ABCDEF-GHJKLM" required />
          </label>
          <button className="min-h-11 rounded-md bg-[var(--moss)] px-5 font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)]" type="submit">Join class</button>
        </form>
      </section>

      <section aria-labelledby="classes-heading" className="space-y-4">
        <h2 className="text-2xl font-bold" id="classes-heading">My classes</h2>
        {classes.length === 0 ? <p className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-6 text-[var(--muted)]">No classes yet. Enter a code to see assignments from your instructor.</p> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((classroom) => <article className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5" key={classroom.id}>
            <h3 className="mb-2 text-lg font-bold">{classroom.name}</h3>
            {classroom.description ? <p className="mb-3 text-sm leading-6 text-[var(--muted)]">{classroom.description}</p> : null}
            <p className="mb-0 text-xs font-bold uppercase tracking-wide text-[var(--moss)]">{classroom.completedCount} of {classroom.assignmentCount} tasks complete</p>
          </article>)}
        </div>}
      </section>

      <section aria-labelledby="tasks-heading" className="space-y-4">
        <h2 className="text-2xl font-bold" id="tasks-heading">Assigned tasks</h2>
        {assignments.length === 0 ? <p className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-6 text-[var(--muted)]">Your classes have no assigned tasks yet.</p> : <div className="grid gap-3">
          {assignments.map((task) => <article className="flex flex-col gap-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:flex-row sm:items-center sm:justify-between" key={task.id}>
            <div className="min-w-0">
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-[var(--moss)]">{task.className} · {formatDueDate(task.dueOn)}</p>
              <h3 className="mb-1 text-lg font-bold">{task.title}</h3>
              {task.instructions ? <p className="mb-2 text-sm leading-6 text-[var(--muted)]">{task.instructions}</p> : null}
              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${task.completed ? 'bg-[var(--moss-soft)] text-[var(--moss)]' : 'bg-[var(--sky)] text-slate-800'}`}>{task.completed ? 'Completed' : 'To do'}</span>
            </div>
            <a className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md border border-[var(--moss)] px-4 font-bold text-[var(--moss)] no-underline hover:bg-[var(--moss-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)]" href={`/practice?problem=${encodeURIComponent(task.activitySlug)}`}>{task.completed ? 'Review activity' : 'Start task'} →</a>
          </article>)}
        </div>}
      </section>
    </div>
  </main>;
}
