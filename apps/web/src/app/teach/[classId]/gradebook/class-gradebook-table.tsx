'use client';

import type { ClassGradebook, ClassGradebookCell } from '@leetcode-app/database';
import Link from 'next/link';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { AdminBadge, AdminEmptyState, AdminSection } from '@/components/admin/admin-ui';
import { filterAndSortGradebook, gradebookCsv, gradebookStatus, type GradebookSort, type GradebookStatusFilter } from '@/lib/gradebook-view';

const stateLabels: Record<ClassGradebookCell['state'], string> = {
  not_assigned: 'Not assigned', excused: 'Excused', unsubmitted: 'Not submitted', queued: 'Queued', running: 'Running',
  needs_review: 'Awaiting grade', unavailable: 'Unavailable', draft: 'Draft', published: 'Published',
};
const reviewableStates = new Set<ClassGradebookCell['state']>(['excused', 'unsubmitted', 'needs_review', 'draft', 'published']);
const points = (units: number) => (units / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
const controlClass = 'min-h-11 min-w-0 w-full rounded-md border border-[var(--line)] bg-white px-3 font-normal outline-none focus:border-[var(--moss)] focus:ring-2 focus:ring-[var(--moss-soft)]';
const buttonClass = 'min-h-11 rounded-md border border-[var(--line)] bg-white px-4 text-sm font-bold text-[var(--moss)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)]';

export function ClassGradebookTable({ gradebook, workspace = 'teach' }: { gradebook: ClassGradebook; workspace?: 'admin' | 'teach' }) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<GradebookStatusFilter>('all');
  const [sort, setSort] = useState<GradebookSort>('total_desc');
  const [assignmentId, setAssignmentId] = useState('');
  const [selectedLearnerId, setSelectedLearnerId] = useState<string | null>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const learnerTrigger = useRef<HTMLButtonElement | null>(null);
  const rows = useMemo(() => filterAndSortGradebook(gradebook, query, filter, sort, assignmentId), [gradebook, query, filter, sort, assignmentId]);
  const assignments = assignmentId ? gradebook.assignments.filter(item => item.id === assignmentId) : gradebook.assignments;
  const selectedLearner = gradebook.learners.find(item => item.id === selectedLearnerId);
  const selectedResult = gradebook.rows.find(item => item.learnerId === selectedLearnerId);
  const detailId = `${id}-learner-detail`;
  const totalSortDirection = sort === 'total_desc' ? 'descending' : sort === 'total_asc' ? 'ascending' : undefined;

  useEffect(() => { if (selectedLearnerId) detailHeading.current?.focus(); }, [selectedLearnerId]);

  const reviewHref = (cell: ClassGradebookCell) => workspace === 'admin'
    ? `/admin/classes/${gradebook.classroom.id}/grades/recipients/${cell.recipientId}`
    : gradebook.assignments.find(item => item.id === cell.assignmentId)?.assignmentKind === 'quiz'
      ? `/teach/${gradebook.classroom.id}/assessments/recipients/${cell.recipientId}`
      : `/teach/${gradebook.classroom.id}/submissions/${cell.recipientId}`;

  const closeDetail = () => {
    setSelectedLearnerId(null);
    learnerTrigger.current?.focus();
  };

  const download = () => {
    const blob = new Blob([`\uFEFF${gradebookCsv(gradebook, rows, assignmentId)}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${gradebook.classroom.name.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'class'}-gradebook.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return <AdminSection title="Grades" description="Highest published scores appear first. Coverage shows how much work is released; class rank requires every applicable grade to be published.">
    {!gradebook.assignments.length ? <AdminEmptyState>No assignments yet.</AdminEmptyState> : !gradebook.learners.length ? <AdminEmptyState>No learners have joined.</AdminEmptyState> : <>
      <div className="grid gap-4 border-b border-[var(--line)] bg-[#faf9f5] px-5 py-5 sm:px-6 md:grid-cols-2 xl:grid-cols-4">
        <label className="grid min-w-0 gap-1.5 text-sm font-bold" htmlFor={`${id}-search`}>Find a learner
          <input className={controlClass} id={`${id}-search`} onChange={event => setQuery(event.target.value)} placeholder="Search name or email" type="search" value={query} />
        </label>
        <label className="grid min-w-0 gap-1.5 text-sm font-bold" htmlFor={`${id}-assignment`}>Assignment
          <select className={controlClass} id={`${id}-assignment`} onChange={event => { setAssignmentId(event.target.value); setSort(event.target.value ? 'assignment_desc' : 'total_desc'); }} value={assignmentId}>
            <option value="">All assignments</option>
            {gradebook.assignments.map(assignment => <option key={assignment.id} value={assignment.id}>{assignment.title}</option>)}
          </select>
        </label>
        <label className="grid min-w-0 gap-1.5 text-sm font-bold" htmlFor={`${id}-status`}>Show
          <select className={controlClass} id={`${id}-status`} onChange={event => setFilter(event.target.value as GradebookStatusFilter)} value={filter}>
            <option value="all">All learners</option><option value="needs_attention">Needs attention</option><option value="ranked">Ranked</option><option value="not_ranked">Not ranked</option><option value="withdrawn">Withdrawn</option>
          </select>
        </label>
        <label className="grid min-w-0 gap-1.5 text-sm font-bold" htmlFor={`${id}-sort`}>Sort by
          <select className={controlClass} id={`${id}-sort`} onChange={event => setSort(event.target.value as GradebookSort)} value={sort}>
            <option value="total_desc">Published total: high to low</option><option value="total_asc">Published total: low to high</option>
            <option disabled={!assignmentId} value="assignment_desc">Assignment score: high to low</option><option disabled={!assignmentId} value="assignment_asc">Assignment score: low to high</option>
            <option value="learner">Learner name</option><option value="rank">Class rank</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 text-sm text-[var(--muted)] sm:px-6">
        <div><p aria-live="polite" className="mb-0">Showing <strong className="text-[var(--ink)]">{rows.length}</strong> of {gradebook.learners.length} learners</p><p className="mb-0 mt-1 text-xs">Choose a learner to see every assignment. Draft scores stay out of totals and score sorting.</p></div>
        <button className={`${buttonClass} disabled:cursor-not-allowed disabled:opacity-50`} disabled={!rows.length} onClick={download} type="button">Download current view</button>
        <p className="mb-0 w-full text-xs sm:hidden">Swipe the table to view assignment columns.</p>
      </div>

      {selectedLearner && selectedResult ? <section id={detailId} className="mx-5 mt-5 rounded-lg border border-[var(--line)] bg-[var(--paper)] p-4 sm:mx-6 sm:p-5" aria-labelledby={`${detailId}-title`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0"><h3 className="m-0 break-words text-lg font-bold outline-none focus-visible:ring-2 focus-visible:ring-[var(--moss)]" id={`${detailId}-title`} ref={detailHeading} tabIndex={-1}>Grades for {selectedLearner.displayName}</h3><p className="mb-0 mt-1 text-sm text-[var(--muted)]">{selectedLearner.membership === 'withdrawn' ? 'Withdrawn learner · ' : ''}{selectedResult.coverage.published} of {selectedResult.coverage.applicable} applicable grades published</p></div>
          <button className={buttonClass} onClick={closeDetail} type="button" aria-label={`Close grade details for ${selectedLearner.displayName}`}>Close details</button>
        </div>
        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3 text-sm">
          <div><dt className="text-[var(--muted)]">Published total</dt><dd className="m-0 mt-1 font-mono font-bold">{selectedResult.publishedTotal.percentage === null ? 'No published grades' : `${points(selectedResult.publishedTotal.earnedUnits)} / ${points(selectedResult.publishedTotal.possibleUnits)} (${selectedResult.publishedTotal.percentage}%)`}</dd></div>
          <div><dt className="text-[var(--muted)]">Class rank</dt><dd className="m-0 mt-1 font-bold">{selectedResult.rank === null ? 'Not yet ranked' : `#${selectedResult.rank}`}</dd></div>
        </dl>
        <ul className="m-0 mt-4 grid list-none gap-3 p-0">
          {gradebook.assignments.map(assignment => {
            const cell = selectedLearner.cells.find(item => item.assignmentId === assignment.id);
            const canReview = cell?.recipientId && reviewableStates.has(cell.state);
            return <li key={assignment.id} className="flex flex-col justify-between gap-3 rounded-md border border-[var(--line)] bg-[var(--surface)] p-4 sm:flex-row sm:items-center">
              <div className="min-w-0"><h4 className="m-0 break-words text-sm font-bold">{assignment.title}</h4><p className="mb-0 mt-1 text-xs text-[var(--muted)]">{assignment.assignmentKind === 'quiz' ? 'Multiple-choice quiz' : assignment.assignmentKind === 'written' ? 'Written assignment' : 'Practice assignment'}{assignment.dueOn ? ` · Due ${assignment.dueOn}` : ''}</p></div>
              <div className="flex shrink-0 flex-wrap items-center gap-3 text-sm">
                <div>{cell && ['published', 'draft'].includes(cell.state) && cell.earnedUnits !== null ? <p className="m-0 font-mono font-bold">{points(cell.earnedUnits)} / {points(cell.maxUnits)}</p> : null}<span className="text-xs text-[var(--muted)]">{cell ? stateLabels[cell.state] : 'Not assigned'}{cell?.state === 'draft' ? ' · not released' : ''}</span></div>
                {canReview ? <Link className="inline-flex min-h-11 items-center text-sm font-bold text-[var(--moss)] underline underline-offset-2" href={reviewHref(cell!)} aria-label={`Review ${selectedLearner.displayName}'s ${assignment.title}`}>Questions & answers</Link> : null}
              </div>
            </li>;
          })}
        </ul>
      </section> : null}

      {!rows.length ? <AdminEmptyState>No learners match this view. Change the search or filter to continue.</AdminEmptyState> : <div className="relative mt-4 w-full overflow-x-auto overscroll-x-contain" role="region" aria-label="Scrollable class gradebook" tabIndex={0}>
        <table className="min-w-max border-separate border-spacing-0 text-left text-sm">
          <caption className="sr-only">Published class grades and objective ranking{assignmentId ? ` for ${assignments[0]?.title ?? 'the selected assignment'}` : ''}</caption>
          <thead><tr>
            <th scope="col" className="top-0 z-30 w-20 border-b border-r border-[var(--line)] bg-[#f0eee7] px-4 py-3 text-xs font-bold uppercase tracking-wider text-[var(--muted)] md:sticky md:left-0">Rank</th>
            <th scope="col" className="sticky left-0 top-0 z-30 w-44 border-b border-r border-[var(--line)] bg-[#f0eee7] px-4 py-3 text-xs font-bold uppercase tracking-wider text-[var(--muted)] sm:w-56 md:left-20">Learner</th>
            {assignments.map(assignment => <th scope="col" key={assignment.id} aria-sort={assignment.id === assignmentId && sort.startsWith('assignment_') ? sort === 'assignment_desc' ? 'descending' : 'ascending' : undefined} className="sticky top-0 z-20 w-44 border-b border-r border-[var(--line)] bg-[#f0eee7] px-4 py-3 text-xs font-bold uppercase tracking-wider text-[var(--muted)]"><button className="flex min-h-11 max-w-40 items-center gap-2 rounded text-left normal-case tracking-normal text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)]" type="button" aria-label={`Sort ${assignment.title} by published score`} onClick={() => { setAssignmentId(assignment.id); setSort(assignmentId === assignment.id && sort === 'assignment_desc' ? 'assignment_asc' : 'assignment_desc'); }}><span>{assignment.title}</span><span aria-hidden="true">{assignment.id === assignmentId && sort.startsWith('assignment_') ? sort === 'assignment_desc' ? '↓' : '↑' : '↕'}</span></button><span className="mt-1 block font-mono">/ {points(assignment.maxUnits)}</span></th>)}
            <th scope="col" aria-sort={totalSortDirection} className="sticky top-0 z-20 w-40 border-b border-r border-[var(--line)] bg-[#f0eee7] px-4 py-3 text-xs font-bold uppercase tracking-wider text-[var(--muted)]"><button className="min-h-11 rounded text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)]" type="button" aria-label="Sort by published total" onClick={() => setSort(sort === 'total_desc' ? 'total_asc' : 'total_desc')}>Published total <span aria-hidden="true">{totalSortDirection === 'descending' ? '↓' : totalSortDirection === 'ascending' ? '↑' : '↕'}</span></button></th>
            <th scope="col" className="sticky top-0 z-20 w-32 border-b border-r border-[var(--line)] bg-[#f0eee7] px-4 py-3 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Coverage</th>
            <th scope="col" className="sticky top-0 z-20 w-40 border-b border-[var(--line)] bg-[#f0eee7] px-4 py-3 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Status</th>
          </tr></thead>
          <tbody>{rows.map(({ learner, result }) => <tr key={learner.id}>
            <td className="z-10 border-b border-r border-[var(--line)] bg-[var(--surface)] px-4 py-4 text-center font-mono font-bold tabular-nums md:sticky md:left-0">{result.rank === null ? <><span aria-hidden="true">—</span><span className="sr-only">Not ranked</span></> : `#${result.rank}`}</td>
            <th scope="row" className="sticky left-0 z-10 max-w-44 border-b border-r border-[var(--line)] bg-[var(--surface)] px-4 py-4 sm:max-w-56 md:left-20"><button type="button" className="min-h-11 max-w-40 rounded text-left font-bold text-[var(--moss)] underline decoration-[var(--line)] underline-offset-4 [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)]" aria-label={`View grades for ${learner.displayName}`} aria-expanded={selectedLearnerId === learner.id} aria-controls={selectedLearnerId === learner.id ? detailId : undefined} onClick={event => { learnerTrigger.current = event.currentTarget; if (selectedLearnerId === learner.id) closeDetail(); else setSelectedLearnerId(learner.id); }}>{learner.displayName}</button><span className="mt-1 block text-xs font-normal text-[var(--muted)] [overflow-wrap:anywhere]">{learner.membership === 'withdrawn' ? 'Withdrawn' : learner.email ?? 'No email'}</span></th>
            {assignments.map(assignment => {
              const cell = learner.cells.find(item => item.assignmentId === assignment.id);
              return <td key={assignment.id} className="border-b border-r border-[var(--line)] px-4 py-4 align-top">
                {cell?.state === 'published' && cell.earnedUnits !== null ? <span className="block font-mono font-bold tabular-nums">{points(cell.earnedUnits)} / {points(cell.maxUnits)}</span> : <span className="block font-medium">{cell ? stateLabels[cell.state] : 'Not assigned'}</span>}
                <span className="mt-1 block"><AdminBadge value={cell?.state ?? 'not_assigned'} /></span>
                {cell?.recipientId && reviewableStates.has(cell.state) ? <Link className="mt-2 inline-flex min-h-9 items-center text-xs font-bold text-[var(--moss)] underline underline-offset-2" href={reviewHref(cell)} aria-label={`Review ${learner.displayName}'s ${assignment.title}`}>Review</Link> : null}
              </td>;
            })}
            <td className="border-b border-r border-[var(--line)] px-4 py-4 font-mono font-bold tabular-nums">{result.publishedTotal.percentage === null ? '—' : `${points(result.publishedTotal.earnedUnits)} / ${points(result.publishedTotal.possibleUnits)} (${result.publishedTotal.percentage}%)`}</td>
            <td className="border-b border-r border-[var(--line)] px-4 py-4 font-mono tabular-nums">{result.coverage.published} / {result.coverage.applicable}</td>
            <td className="border-b border-[var(--line)] px-4 py-4"><AdminBadge value={gradebookStatus(result)} /></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </>}
  </AdminSection>;
}
