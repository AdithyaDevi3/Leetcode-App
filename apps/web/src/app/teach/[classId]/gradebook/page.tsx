import type { ClassGradebookCell, ClassGradebook } from '@leetcode-app/database';
import { GradebookAccessError } from '@leetcode-app/database';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { AdminBadge, AdminEmptyState, AdminMetric, AdminPageHeader, AdminSection } from '@/components/admin/admin-ui';
import { withInstructorGradebook } from '@/lib/instructor-gradebook';

const stateLabels: Record<ClassGradebookCell['state'], string> = {
  not_assigned: 'Not assigned', unsubmitted: 'Not submitted', queued: 'Queued', running: 'Running',
  needs_review: 'Awaiting grade', unavailable: 'Unavailable', draft: 'Draft', published: 'Published',
};
const points = (units: number) => (units / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
const status = (gradebook: ClassGradebook, learnerId: string) => {
  const row = gradebook.rows.find(item => item.learnerId === learnerId)!;
  if (row.rank !== null) return 'Eligible';
  const reason = row.exclusions[0];
  return reason ? reason.replaceAll('_', ' ') : 'Not ranked';
};

export default async function ClassGradebookPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(classId)) notFound();
  let gradebook: ClassGradebook;
  try { gradebook = await withInstructorGradebook(repository => repository.readClassGradebook(classId)); }
  catch (error) {
    if (error instanceof GradebookAccessError) notFound();
    if (error instanceof Error && 'status' in error && error.status === 401) redirect(`/auth?next=${encodeURIComponent(`/teach/${classId}/gradebook`)}`);
    throw error;
  }
  const included = gradebook.learners.filter(item => item.membership === 'included');
  const ranked = gradebook.rows.filter(item => item.rank !== null).length;
  const awaiting = gradebook.rows.filter(item => item.exclusions.includes('awaiting_grade') || item.exclusions.includes('unpublished_grade')).length;
  const rows = gradebook.learners.map(learner => ({ learner, result: gradebook.rows.find(item => item.learnerId === learner.id)! }));

  return <main><div className="mx-auto max-w-[96rem] space-y-7">
    <Link className="inline-flex text-sm font-bold text-[var(--moss)] underline underline-offset-4" href={`/teach/${classId}`}>← Class workspace</Link>
    <AdminPageHeader eyebrow="Class gradebook" title={gradebook.classroom.name} description="Published grades determine totals and rank. Draft or incomplete work stays clearly marked." action={<Link className="inline-flex min-h-11 items-center rounded-md border border-[var(--line)] bg-[var(--surface)] px-4 font-bold text-[var(--ink)] no-underline" href={`/teach/${classId}/submissions`}>Review submissions</Link>} />
    <section aria-label="Gradebook summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <AdminMetric label="Learners" value={included.length} note="Currently enrolled" />
      <AdminMetric label="Assignments" value={gradebook.assignments.length} note="In this comparison set" />
      <AdminMetric label="Ranked" value={ranked} note="All applicable grades published" />
      <AdminMetric label="Awaiting grades" value={awaiting} note="Draft or incomplete review" />
    </section>
    <AdminSection title="Grades" description="Rank compares learners only when every applicable grade is published and no exclusion is open.">
      {!gradebook.assignments.length ? <AdminEmptyState>No assignments yet.</AdminEmptyState> : !gradebook.learners.length ? <AdminEmptyState>No learners have joined.</AdminEmptyState> : <>
        <p className="px-5 pt-4 text-sm text-[var(--muted)] sm:hidden">Swipe horizontally to view assignments and totals.</p>
        <div className="relative w-full overflow-x-auto overscroll-x-contain" role="region" aria-label="Scrollable class gradebook" tabIndex={0}>
          <table className="min-w-max border-separate border-spacing-0 text-left text-sm">
            <caption className="sr-only">Published class grades and objective ranking</caption>
            <thead><tr>
              <th scope="col" className="sticky left-0 top-0 z-30 w-20 border-b border-r border-[var(--line)] bg-[#f0eee7] px-4 py-3 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Rank</th>
              <th scope="col" className="sticky left-20 top-0 z-30 w-56 border-b border-r border-[var(--line)] bg-[#f0eee7] px-4 py-3 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Learner</th>
              {gradebook.assignments.map(assignment => <th scope="col" key={assignment.id} className="sticky top-0 z-20 w-44 border-b border-r border-[var(--line)] bg-[#f0eee7] px-4 py-3 text-xs font-bold uppercase tracking-wider text-[var(--muted)]"><span className="block max-w-40 normal-case tracking-normal text-[var(--ink)]">{assignment.title}</span><span className="mt-1 block font-mono">/ {points(assignment.maxUnits)}</span></th>)}
              <th scope="col" className="sticky top-0 z-20 w-40 border-b border-r border-[var(--line)] bg-[#f0eee7] px-4 py-3 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Published total</th>
              <th scope="col" className="sticky top-0 z-20 w-32 border-b border-r border-[var(--line)] bg-[#f0eee7] px-4 py-3 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Coverage</th>
              <th scope="col" className="sticky top-0 z-20 w-40 border-b border-[var(--line)] bg-[#f0eee7] px-4 py-3 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Status</th>
            </tr></thead>
            <tbody>{rows.map(({ learner, result }) => <tr key={learner.id}>
              <td className="sticky left-0 z-10 border-b border-r border-[var(--line)] bg-[var(--surface)] px-4 py-4 text-center font-mono font-bold tabular-nums">{result.rank === null ? <><span aria-hidden="true">—</span><span className="sr-only">Not ranked</span></> : `#${result.rank}`}</td>
              <th scope="row" className="sticky left-20 z-10 max-w-56 border-b border-r border-[var(--line)] bg-[var(--surface)] px-4 py-4"><span className="block font-bold">{learner.displayName}</span><span className="mt-1 block text-xs font-normal text-[var(--muted)]">{learner.membership === 'withdrawn' ? 'Withdrawn' : learner.email ?? 'No email'}</span></th>
              {learner.cells.map(cell => <td key={cell.assignmentId} className="border-b border-r border-[var(--line)] px-4 py-4 align-top">
                {cell.state === 'published' && cell.earnedUnits !== null ? <span className="block font-mono font-bold tabular-nums">{points(cell.earnedUnits)} / {points(cell.maxUnits)}</span> : <span className="block font-medium">{stateLabels[cell.state]}</span>}
                <span className="mt-1 block"><AdminBadge value={cell.state} /></span>
                {cell.recipientId && ['needs_review', 'draft', 'published'].includes(cell.state) ? <Link className="mt-2 block text-xs font-bold text-[var(--moss)] underline underline-offset-2" href={`/teach/${classId}/submissions/${cell.recipientId}`} aria-label={`Review ${learner.displayName}'s ${gradebook.assignments.find(item => item.id === cell.assignmentId)?.title ?? 'assignment'}`}>Review</Link> : null}
              </td>)}
              <td className="border-b border-r border-[var(--line)] px-4 py-4 font-mono font-bold tabular-nums">{result.publishedTotal.percentage === null ? '—' : `${points(result.publishedTotal.earnedUnits)} / ${points(result.publishedTotal.possibleUnits)} (${result.publishedTotal.percentage}%)`}</td>
              <td className="border-b border-r border-[var(--line)] px-4 py-4 font-mono tabular-nums">{result.coverage.published} / {result.coverage.applicable}</td>
              <td className="border-b border-[var(--line)] px-4 py-4"><AdminBadge value={status(gradebook, learner.id)} /></td>
            </tr>)}</tbody>
          </table>
        </div>
      </>}
    </AdminSection>
  </div></main>;
}
