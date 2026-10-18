'use client';

import type { ClassGradebook, ClassGradebookCell } from '@leetcode-app/database';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { AdminBadge, AdminEmptyState, AdminSection } from '@/components/admin/admin-ui';
import { filterAndSortGradebook, gradebookCsv, gradebookStatus, type GradebookSort, type GradebookStatusFilter } from '@/lib/gradebook-view';

const stateLabels: Record<ClassGradebookCell['state'], string> = {
  not_assigned: 'Not assigned', excused: 'Excused', unsubmitted: 'Not submitted', queued: 'Queued', running: 'Running',
  needs_review: 'Awaiting grade', unavailable: 'Unavailable', draft: 'Draft', published: 'Published',
};
const points = (units: number) => (units / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });

export function ClassGradebookTable({ gradebook }: { gradebook: ClassGradebook }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<GradebookStatusFilter>('all');
  const [sort, setSort] = useState<GradebookSort>('learner');
  const rows = useMemo(() => filterAndSortGradebook(gradebook, query, filter, sort), [gradebook, query, filter, sort]);

  const download = () => {
    const blob = new Blob([`\uFEFF${gradebookCsv(gradebook, rows)}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${gradebook.classroom.name.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'class'}-gradebook.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return <AdminSection title="Grades" description="Rank compares learners only when every applicable grade is published and no exclusion is open.">
    {!gradebook.assignments.length ? <AdminEmptyState>No assignments yet.</AdminEmptyState> : !gradebook.learners.length ? <AdminEmptyState>No learners have joined.</AdminEmptyState> : <>
      <div className="grid gap-4 border-b border-[var(--line)] bg-[#faf9f5] px-5 py-5 sm:px-6 lg:grid-cols-[minmax(16rem,1fr)_12rem_12rem_auto] lg:items-end">
        <label className="grid gap-1.5 text-sm font-bold" htmlFor="gradebook-search">Find a learner
          <input className="min-h-11 rounded-md border border-[var(--line)] bg-white px-3 font-normal outline-none focus:border-[var(--moss)] focus:ring-2 focus:ring-[var(--moss-soft)]" id="gradebook-search" onChange={event => setQuery(event.target.value)} placeholder="Search name or email" type="search" value={query} />
        </label>
        <label className="grid gap-1.5 text-sm font-bold" htmlFor="gradebook-status">Show
          <select className="min-h-11 rounded-md border border-[var(--line)] bg-white px-3 font-normal outline-none focus:border-[var(--moss)] focus:ring-2 focus:ring-[var(--moss-soft)]" id="gradebook-status" onChange={event => setFilter(event.target.value as GradebookStatusFilter)} value={filter}>
            <option value="all">All learners</option><option value="needs_attention">Needs attention</option><option value="ranked">Ranked</option><option value="not_ranked">Not ranked</option><option value="withdrawn">Withdrawn</option>
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-bold" htmlFor="gradebook-sort">Sort by
          <select className="min-h-11 rounded-md border border-[var(--line)] bg-white px-3 font-normal outline-none focus:border-[var(--moss)] focus:ring-2 focus:ring-[var(--moss-soft)]" id="gradebook-sort" onChange={event => setSort(event.target.value as GradebookSort)} value={sort}>
            <option value="learner">Learner name</option><option value="rank">Class rank</option><option value="total_desc">Published total</option>
          </select>
        </label>
        <button className="min-h-11 rounded-md border border-[var(--moss)] bg-white px-4 text-sm font-bold text-[var(--moss)] disabled:cursor-not-allowed disabled:opacity-50" disabled={!rows.length} onClick={download} type="button">Download current view</button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 text-sm text-[var(--muted)] sm:px-6">
        <p aria-live="polite" className="mb-0">Showing <strong className="text-[var(--ink)]">{rows.length}</strong> of {gradebook.learners.length} learners</p>
        <p className="mb-0 sm:hidden">Swipe horizontally to view assignments and totals.</p>
      </div>
      {!rows.length ? <AdminEmptyState>No learners match this view. Change the search or filter to continue.</AdminEmptyState> : <div className="relative mt-4 w-full overflow-x-auto overscroll-x-contain" role="region" aria-label="Scrollable class gradebook" tabIndex={0}>
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
              {cell.recipientId && ['excused', 'unsubmitted', 'needs_review', 'draft', 'published'].includes(cell.state) ? <Link className="mt-2 block text-xs font-bold text-[var(--moss)] underline underline-offset-2" href={`/teach/${gradebook.classroom.id}/submissions/${cell.recipientId}`} aria-label={`Review ${learner.displayName}'s ${gradebook.assignments.find(item => item.id === cell.assignmentId)?.title ?? 'assignment'}`}>Review</Link> : null}
            </td>)}
            <td className="border-b border-r border-[var(--line)] px-4 py-4 font-mono font-bold tabular-nums">{result.publishedTotal.percentage === null ? '—' : `${points(result.publishedTotal.earnedUnits)} / ${points(result.publishedTotal.possibleUnits)} (${result.publishedTotal.percentage}%)`}</td>
            <td className="border-b border-r border-[var(--line)] px-4 py-4 font-mono tabular-nums">{result.coverage.published} / {result.coverage.applicable}</td>
            <td className="border-b border-[var(--line)] px-4 py-4"><AdminBadge value={gradebookStatus(result)} /></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </>}
  </AdminSection>;
}
