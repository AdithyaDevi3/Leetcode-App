'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SharedAssignmentResults, SharedGradeResponseDetail } from '@leetcode-app/database';
import { GradeResponseView, gradePoints } from './grade-response-view';

const button = 'inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-bold text-[var(--moss)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)]';

export function SharedClassResults({ results, learnerId }: { results: SharedAssignmentResults; learnerId: string }) {
  return <OwnedSharedClassResults key={`${learnerId}:${results.classroom.id}:${results.assignment.id}:${results.sharing.id}`} results={results} learnerId={learnerId} />;
}

function OwnedSharedClassResults({ results, learnerId }: { results: SharedAssignmentResults; learnerId: string }) {
  const router = useRouter();
  const [sort, setSort] = useState('score_desc');
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState<SharedGradeResponseDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const region = useRef<HTMLElement>(null);
  const requestVersion = useRef(0);
  useEffect(() => {
    const refresh = () => router.refresh();
    window.addEventListener('focus', refresh);
    return () => { window.removeEventListener('focus', refresh); requestVersion.current += 1; };
  }, [router]);

  async function readResponse(recipientId: string) {
    const version = ++requestVersion.current;
    setBusy(true); setMessage(null); setDetail(null);
    try {
      const response = await fetch(`/api/class-gradebook/${results.classroom.id}/assignments/${results.assignment.id}/shared-results/${recipientId}`, { cache: 'no-store', headers: { 'x-assessment-author': learnerId }, signal: AbortSignal.timeout(15_000) });
      const body = await response.json() as { actorId?: string; detail?: SharedGradeResponseDetail; code?: string; message?: string };
      if (version !== requestVersion.current) return;
      if (body.actorId && body.actorId !== learnerId || body.code === 'owner_changed' || [401, 403, 404].includes(response.status)) setUnavailable(true);
      if (!response.ok || body.actorId !== learnerId || body.detail?.recipientId !== recipientId || body.detail.classroom.id !== results.classroom.id || body.detail.assignment.id !== results.assignment.id) throw new Error(body.message ?? 'These shared results are no longer available. Refresh the class to continue.');
      if (body.detail.sharing.id !== results.sharing.id) { router.refresh(); throw new Error('Class results changed. Refresh to review the newly shared version.'); }
      setDetail(body.detail);
      window.requestAnimationFrame(() => region.current?.focus());
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Could not load the shared response.'); }
    finally { setBusy(false); }
  }

  const rows = results.learners.filter(row => row.learner.displayName.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((left, right) => {
    if (sort === 'name') return left.learner.displayName.localeCompare(right.learner.displayName);
    const difference = left.earnedUnits / left.maxUnits - right.earnedUnits / right.maxUnits;
    return (sort === 'score_asc' ? difference : -difference) || left.learner.displayName.localeCompare(right.learner.displayName);
  });
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[var(--moss-soft)] p-4 text-sm"><p className="mb-0 leading-6">Shared with current class members · {results.learners.length} released records · Version {results.sharing.sequence}</p><button className={button} type="button" onClick={() => router.refresh()}>Refresh class results</button></div>
    {message ? <p role="alert" className="rounded-lg border border-[var(--coral)] bg-[var(--coral-soft)] p-4 text-sm">{message}</p> : null}
    {!unavailable ? <>
      <p className="text-sm leading-7 text-[var(--muted)]">These are the records explicitly shared for this assignment. Your complete personal grades and instructor feedback stay on your Grades page.</p>
      <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-bold">Find a classmate<input className="min-h-11 rounded-md border border-[var(--line)] bg-white px-3 font-normal" type="search" value={query} onChange={event => setQuery(event.target.value)} /></label><label className="grid gap-2 text-sm font-bold">Sort shared results<select className="min-h-11 rounded-md border border-[var(--line)] bg-white px-3 font-normal" value={sort} onChange={event => setSort(event.target.value)}><option value="score_desc">Highest score first</option><option value="score_asc">Lowest score first</option><option value="name">Student name</option></select></label></div>
      <div className="overflow-x-auto rounded-xl border border-[var(--line)]" role="region" aria-label="Shared class scores" tabIndex={0}><table className="w-full min-w-[30rem] text-left text-sm"><caption className="sr-only">Shared scores for {results.assignment.title}</caption><thead className="bg-[var(--paper)]"><tr><th scope="col" className="p-4">Student</th><th scope="col" className="p-4">Released score</th><th scope="col" className="p-4">Submitted work</th></tr></thead><tbody>{rows.map(row => <tr key={row.recipientId}><th scope="row" className="border-t border-[var(--line)] p-4">{row.learner.displayName}</th><td className="border-t border-[var(--line)] p-4 font-mono tabular-nums">{gradePoints(row.earnedUnits)} / {gradePoints(row.maxUnits)} ({(row.earnedUnits / row.maxUnits * 100).toFixed(1)}%)</td><td className="border-t border-[var(--line)] p-4"><button className={button} type="button" disabled={busy} aria-label={`View ${row.learner.displayName}'s shared answers`} onClick={() => void readResponse(row.recipientId)}>Questions and answers</button></td></tr>)}</tbody></table>{!rows.length ? <p className="p-4 text-sm">No shared records match this search.</p> : null}</div>
      {detail ? <section ref={region} tabIndex={-1} aria-label={`Shared response for ${detail.learner.displayName}`} className="space-y-5 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">{detail.learner.displayName}</h2><button className={button} type="button" onClick={() => setDetail(null)}>Close shared answers</button></div><p className="font-mono font-bold">{gradePoints(detail.earnedUnits)} / {gradePoints(detail.maxUnits)}</p><GradeResponseView content={detail.content} response={detail.response} /></section> : null}
    </> : null}
  </div>;
}
