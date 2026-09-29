import type { LearnerClassGradeAssignment, LearnerClassGrades } from '@leetcode-app/database';
import { createDatabaseClient, databaseConfigFromEnv, GradebookAccessError, PostgresGradebookRepository } from '@leetcode-app/database';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { SiteNavigation } from '@/components/site-navigation';
import { getSession } from '@/lib/auth/session';

const labels: Record<LearnerClassGradeAssignment['state'], string> = {
  excused: 'Excused', unsubmitted: 'Not submitted', queued: 'Verification queued', running: 'Verification running',
  needs_review: 'Awaiting instructor review', unavailable: 'Verification unavailable',
  awaiting_publication: 'Grade being finalized', published: 'Published',
};
const badge: Record<LearnerClassGradeAssignment['state'], string> = {
  excused: 'bg-slate-100 text-slate-700', published: 'bg-[var(--moss-soft)] text-[var(--moss)]', queued: 'bg-[var(--sky)] text-slate-800',
  running: 'bg-amber-100 text-amber-900', needs_review: 'bg-amber-100 text-amber-900',
  awaiting_publication: 'bg-amber-100 text-amber-900', unsubmitted: 'bg-slate-100 text-slate-700',
  unavailable: 'bg-[var(--coral-soft)] text-red-900',
};
const points = (units: number) => (units / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
const criterionLabel = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
const dueDate = (value: string | null) => value
  ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
  : 'No due date';

export default async function LearnerClassGradesPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(classId)) notFound();
  const session = await getSession();
  if (!session) redirect(`/auth?next=${encodeURIComponent(`/classes/${classId}/grades`)}`);
  const db = createDatabaseClient(databaseConfigFromEnv());
  let grades: LearnerClassGrades;
  try { grades = await new PostgresGradebookRepository(db, { role: 'learner', userId: session.user.id }).readLearnerClassGrades(classId); }
  catch (error) { if (error instanceof GradebookAccessError) notFound(); throw error; }
  finally { await db.close(); }

  const { publishedTotal, coverage } = grades.summary;
  return <main className="min-h-screen px-5 py-6 sm:px-8"><div className="mx-auto max-w-5xl space-y-8">
    <SiteNavigation currentPath="/classes" />
    <Link className="inline-flex text-sm font-bold text-[var(--moss)] underline underline-offset-4" href="/classes">← My classes</Link>
    <header className="max-w-3xl"><p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[var(--coral)]">Published grades</p><h1 className="mb-3 text-3xl font-bold tracking-tight sm:text-4xl">{grades.classroom.name}</h1><p className="text-[var(--muted)]">Only grades your instructor has published appear here. Work under review stays clearly marked without showing draft scores.</p></header>
    <section aria-label="Published grade summary" className="grid gap-4 sm:grid-cols-3">
      <article className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5"><p className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Published total</p><p className="mt-3 font-mono text-2xl font-bold tabular-nums">{publishedTotal.percentage === null ? '—' : `${points(publishedTotal.earnedUnits)} / ${points(publishedTotal.possibleUnits)}`}</p><p className="mt-2 text-sm text-[var(--muted)]">{publishedTotal.percentage === null ? 'No grades published yet' : `${publishedTotal.percentage}%`}</p></article>
      <article className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5"><p className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Published</p><p className="mt-3 font-mono text-2xl font-bold tabular-nums">{coverage.published} / {coverage.applicable}</p><p className="mt-2 text-sm text-[var(--muted)]">Applicable assignments</p></article>
      <article className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5"><p className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Calculation</p><p className="mt-3 text-lg font-bold">Published work only</p><p className="mt-2 text-sm text-[var(--muted)]">Drafts never affect your displayed total.</p></article>
    </section>
    <section aria-labelledby="grade-list-heading" className="space-y-4">
      <div><h2 id="grade-list-heading" className="text-2xl font-bold">Assignments</h2><p className="mt-1 text-sm text-[var(--muted)]">Instructor feedback appears with the published score.</p></div>
      {!grades.assignments.length ? <p className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-6 text-[var(--muted)]">This class has no assignments yet.</p> : <div className="grid gap-4">
        {grades.assignments.map(assignment => <article key={assignment.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_10px_30px_rgba(34,46,38,0.04)] sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="mb-1 text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Due {dueDate(assignment.dueOn)}</p><h3 className="text-xl font-bold">{assignment.title}</h3></div><span className={`inline-flex self-start rounded-full px-3 py-1.5 text-xs font-bold ${badge[assignment.state]}`}>{labels[assignment.state]}</span></div>
          {assignment.publishedGrade ? <div className="mt-5 grid gap-5 border-t border-[var(--line)] pt-5 lg:grid-cols-[12rem_1fr]">
            <div><p className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Score</p><p className="mt-2 font-mono text-2xl font-bold tabular-nums">{points(assignment.publishedGrade.earnedUnits)} / {points(assignment.maxUnits)}</p></div>
            <div className="space-y-4">{Object.keys(assignment.publishedGrade.criterionScores).length ? <div><h4 className="mb-2 text-sm font-bold">Rubric breakdown</h4><dl className="grid gap-2 sm:grid-cols-2">{Object.entries(assignment.publishedGrade.criterionScores).map(([criterion, score]) => <div key={criterion} className="flex justify-between gap-4 rounded-md bg-[#f5f3ed] px-3 py-2 text-sm"><dt>{criterionLabel(criterion)}</dt><dd className="font-mono font-bold tabular-nums">{points(score)}</dd></div>)}</dl></div> : null}<div><h4 className="mb-1 text-sm font-bold">Instructor feedback</h4><p className="mb-0 whitespace-pre-wrap text-sm leading-6 text-[var(--muted)]">{assignment.publishedGrade.learnerFeedback || 'No written feedback was included.'}</p></div></div>
          </div> : <p className="mb-0 mt-4 text-sm leading-6 text-[var(--muted)]">{assignment.state === 'excused' ? 'Your instructor excused this assignment. It does not count toward your total or completion coverage.' : assignment.state === 'unsubmitted' ? 'Submit this assignment when you are ready.' : 'Your displayed total will update after the current grade is published.'}</p>}
        </article>)}
      </div>}
    </section>
  </div></main>;
}
