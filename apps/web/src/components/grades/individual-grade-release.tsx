'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { GradeReleaseResponseDetail } from '@leetcode-app/database';
import { gradeReleaseReceiptMatches, isPendingGradeAction, type PendingGradeAction } from '@/lib/grade-release-client';
import { gradePoints } from './grade-response-view';

export function IndividualGradeRelease({ detail, actorId, workspace }: { detail: GradeReleaseResponseDetail; actorId: string; workspace: 'admin' | 'teach' }) {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState<PendingGradeAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [released, setReleased] = useState(Boolean(detail.grade?.published));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const inFlight = useRef(false);
  const key = `method:individual-grade-release:${actorId}:${workspace}:${detail.classroom.id}:${detail.recipientId}`;
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = window.sessionStorage.getItem(key);
        const saved: unknown = raw ? JSON.parse(raw) : null;
        if (isPendingGradeAction(saved) && saved.kind === 'release' && saved.assignmentId === detail.assignment.id && saved.body.targets.length === 1 && saved.body.targets[0].recipientId === detail.recipientId) {
          setPending(saved); setConfirmed(true); setMessage('An earlier grade release needs confirmation. Retry its original request.');
        } else if (raw) window.sessionStorage.removeItem(key);
      } catch { /* The server grade remains available without browser storage. */ }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [key, detail.assignment.id, detail.recipientId]);

  async function release() {
    if (!confirmed || inFlight.current || blocked || !pending && (!detail.releaseTarget || released)) return;
    const action: PendingGradeAction = pending ?? { assignmentId: detail.assignment.id, kind: 'release', body: { targets: [detail.releaseTarget!], requestKey: crypto.randomUUID() } };
    if (action.kind !== 'release') return;
    inFlight.current = true; setBusy(true); setPending(action); setMessage(null); setError(false);
    try {
      try { window.sessionStorage.setItem(key, JSON.stringify(action)); } catch { /* Keep the exact request in memory. */ }
      const response = await fetch(`/api/class-gradebook/${detail.classroom.id}/assignments/${detail.assignment.id}/releases?workspace=${workspace}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-assessment-author': actorId }, body: JSON.stringify(action.body), signal: AbortSignal.timeout(15_000) });
      const body = await response.json().catch(() => null) as { actorId?: string; receipt?: unknown; message?: string } | null;
      if (!response.ok || body?.actorId !== actorId || !gradeReleaseReceiptMatches(body.receipt, action, detail.classroom.id, actorId)) {
        if ([400, 401, 403, 404, 409, 413].includes(response.status)) setBlocked(true);
        throw new Error(body?.message ?? 'Could not confirm grade release. Retry safely.');
      }
      const currentGrade = action.body.targets[0].gradeRevisionId === detail.grade?.id;
      setPending(null); setReleased(currentGrade); setConfirmed(false);
      try { window.sessionStorage.removeItem(key); } catch { /* The release is durable. */ }
      setMessage(currentGrade ? 'Grade released privately to the learner.' : 'Original release confirmed. Review the current saved grade before releasing a correction.');
      router.refresh();
    } catch (cause) { setError(true); setMessage(cause instanceof Error ? cause.message : 'Could not release the grade.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <section className="space-y-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6" aria-label="Individual grade release">
    <h2 className="text-xl font-bold">{released ? 'Released score' : 'Saved score'}</h2>
    <p className="font-mono text-2xl font-bold">{detail.grade ? `${gradePoints(detail.grade.earnedUnits)} / ${gradePoints(detail.grade.maxUnits)}` : 'Awaiting a saved grade'}</p>
    {message ? <p role={error ? 'alert' : 'status'} className="rounded-lg bg-[var(--paper)] p-4 text-sm">{message}</p> : null}
    {detail.releaseTarget || pending ? <><label className="flex min-h-11 items-start gap-3 text-sm leading-6"><input className="mt-1" type="checkbox" checked={confirmed} disabled={busy || Boolean(pending) || blocked} onChange={event => setConfirmed(event.target.checked)} />I reviewed this saved score and want to release it privately to {detail.learner.displayName}.</label><button className="min-h-11 rounded-md bg-[var(--moss)] px-4 font-bold text-white disabled:opacity-50" type="button" disabled={!ready || !confirmed || busy || blocked || released && !pending} onClick={() => void release()}>{busy ? 'Releasing…' : pending ? 'Retry original grade release' : 'Release this grade'}</button></> : null}
    {blocked ? <p className="text-sm">The saved record or account changed. Reopen the latest class grades to review it.</p> : null}
  </section>;
}
