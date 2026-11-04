import Link from 'next/link';
import type { StudentClassroom } from '@leetcode-app/database';

export function ClassEntry({ classes, error, joined, joinAction }: {
  classes: readonly StudentClassroom[]; error?: string; joined?: string;
  joinAction: (data: FormData) => void | Promise<void>;
}) {
  return <>
    {error ? <p role="alert" className="rounded-lg border border-[var(--coral)] bg-[var(--coral-soft)] px-4 py-3 text-sm">{error.slice(0, 500)}</p> : null}
    {joined ? <p role="status" className="rounded-lg border border-[var(--moss)] bg-[var(--moss-soft)] px-4 py-3 text-sm text-[var(--moss)]">{joined.slice(0, 500)}</p> : null}
    <section aria-labelledby="classes-heading" className="space-y-4">
      <h2 className="text-2xl font-bold" id="classes-heading">My classes</h2>
      {!classes.length ? <p className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-6 text-[var(--muted)]">No classes yet. Enter a code from your instructor to get started.</p> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{classes.map(classroom => <article className="min-w-0 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5" key={classroom.id}>
        <h3 className="break-words text-lg font-bold">{classroom.name}</h3>{classroom.description ? <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--muted)]">{classroom.description}</p> : null}
        <p className="mt-3 text-xs text-[var(--muted)]">{classroom.assignmentCount} assigned tasks</p>
        <div className="mt-4 flex flex-wrap gap-3"><Link className="inline-flex min-h-11 items-center rounded-md bg-[var(--moss)] px-4 font-bold text-white no-underline" href={`/classes/${classroom.id}`}>Open class</Link><Link className="inline-flex min-h-11 items-center font-bold text-[var(--moss)] underline" href={`/classes/${classroom.id}/grades`}>My grades</Link></div>
      </article>)}</div>}
    </section>
    <details className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6" open={!classes.length || Boolean(error)}>
      <summary className="min-h-11 cursor-pointer text-lg font-bold">{classes.length ? 'Join another class' : 'Join a class'}</summary>
      <p className="mb-4 mt-3 text-sm leading-6 text-[var(--muted)]">Enter a class code from your instructor. Additional classes can also be used for small study groups.</p>
      <form action={joinAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="grid w-full max-w-sm gap-1.5 text-sm font-bold">Class code<input autoCapitalize="characters" autoComplete="off" className="min-h-11 rounded-md border border-[var(--line)] bg-[var(--paper)] px-3 font-mono font-normal uppercase tracking-wider" maxLength={16} name="code" placeholder="ABCDEF-GHJKLM" required /></label>
        <button className="min-h-11 rounded-md bg-[var(--moss)] px-5 font-bold text-white" type="submit">Join class</button>
      </form>
    </details>
  </>;
}
