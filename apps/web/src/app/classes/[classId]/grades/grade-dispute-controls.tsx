'use client';

import type { LearnerClassGradeAssignment } from '@leetcode-app/database';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

type Assignment = Pick<LearnerClassGradeAssignment, 'recipientId' | 'publishedGrade' | 'dispute'>;

const statusLabel = {
  submitted: 'Review requested',
  in_review: 'Instructor reviewing',
  resolved: 'Review completed',
  withdrawn: 'Request withdrawn',
  superseded: 'Request closed',
} as const;

async function errorMessage(response: Response) {
  try {
    const body = await response.json() as { error?: string; message?: string };
    return body.error ?? body.message ?? 'The request could not be completed.';
  } catch {
    return 'The request could not be completed.';
  }
}

export function GradeDisputeControls({ assignment }: { assignment: Assignment }) {
  const router = useRouter();
  const reasonId = useId();
  const confirmationId = useId();
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState<'request' | 'withdraw' | null>(null);
  const [notice, setNotice] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const dispute = assignment.dispute;
  const active = dispute?.status === 'submitted' || dispute?.status === 'in_review';
  const eligible = Boolean(assignment.publishedGrade) && !active
    && (!dispute || dispute.gradeRevisionId !== assignment.publishedGrade?.gradeRevisionId);

  async function requestReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!assignment.publishedGrade || !reason.trim()) return;
    setPending('request'); setNotice(null);
    try {
      const response = await fetch(`/api/learner/assignments/${assignment.recipientId}/grade-disputes`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expectedDisputeEventId: dispute?.latestEventId ?? null,
          gradeRevisionId: assignment.publishedGrade.gradeRevisionId, reason: reason.trim(), requestKey: crypto.randomUUID() }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      setReason(''); setNotice({ kind: 'success', text: 'Your grade review request was sent.' }); router.refresh();
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'The request could not be completed.' });
    } finally { setPending(null); }
  }

  async function withdrawReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dispute || !active || !confirmed) return;
    setPending('withdraw'); setNotice(null);
    try {
      const response = await fetch(`/api/learner/assignments/${assignment.recipientId}/grade-disputes/withdrawals`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expectedDisputeEventId: dispute.latestEventId, requestKey: crypto.randomUUID() }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      setConfirmed(false); setNotice({ kind: 'success', text: 'Your grade review request was withdrawn.' }); router.refresh();
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'The request could not be completed.' });
    } finally { setPending(null); }
  }

  return <section aria-labelledby={`${reasonId}-heading`} className="mt-5 border-t border-[var(--line)] pt-5">
    <h4 id={`${reasonId}-heading`} className="text-sm font-bold">Grade review</h4>
    {dispute ? <div className="mt-3 rounded-lg border border-[var(--line)] bg-[#f5f3ed] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="mb-0 text-sm font-bold">{statusLabel[dispute.status]}</p>{dispute.outcome ? <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-[var(--muted)]">{dispute.outcome === 'changed' ? 'Grade changed' : 'Grade upheld'}</span> : null}</div>
      <dl className="mt-3 space-y-3 text-sm"><div><dt className="font-bold">Your request</dt><dd className="mt-1 whitespace-pre-wrap leading-6 text-[var(--muted)]">{dispute.requestMessage}</dd></div>{dispute.resolutionMessage ? <div><dt className="font-bold">Instructor response</dt><dd className="mt-1 whitespace-pre-wrap leading-6 text-[var(--muted)]">{dispute.resolutionMessage}</dd></div> : null}</dl>
    </div> : <p className="mb-0 mt-1 text-sm leading-6 text-[var(--muted)]">If the published score or feedback needs another look, explain the specific part you want your instructor to review.</p>}

    {active && dispute ? <form className="mt-4 space-y-3" onSubmit={withdrawReview}>
      <label className="flex items-start gap-3 text-sm leading-6" htmlFor={confirmationId}><input id={confirmationId} className="mt-1 h-4 w-4 accent-[var(--moss)]" type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>I understand that withdrawing closes this request. I can request another review later if a new grade is published.</span></label>
      <button className="rounded-md border border-[var(--line)] bg-white px-4 py-2 text-sm font-bold text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-50" type="submit" disabled={!confirmed || pending !== null}>{pending === 'withdraw' ? 'Withdrawing…' : 'Withdraw request'}</button>
    </form> : eligible ? <form className="mt-4 space-y-3" onSubmit={requestReview}>
      <label className="block text-sm font-bold" htmlFor={reasonId}>What should your instructor review?</label>
      <textarea id={reasonId} className="min-h-28 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-[var(--moss)] focus:ring-2 focus:ring-[var(--moss-soft)]" value={reason} minLength={20} maxLength={4000} required onChange={event => setReason(event.target.value)} placeholder="Reference the rubric criterion, score, or feedback and explain what you think should be reconsidered." />
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="mb-0 text-xs text-[var(--muted)]">{reason.length.toLocaleString()} / 4,000 characters · minimum 20</p><button className="rounded-md bg-[var(--moss)] px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50" type="submit" disabled={reason.trim().length < 20 || pending !== null}>{pending === 'request' ? 'Sending…' : dispute ? 'Request another review' : 'Request grade review'}</button></div>
    </form> : null}
    {notice ? <p role={notice.kind === 'error' ? 'alert' : 'status'} className={`mb-0 mt-3 text-sm font-bold ${notice.kind === 'error' ? 'text-red-800' : 'text-[var(--moss)]'}`}>{notice.text}</p> : null}
  </section>;
}
