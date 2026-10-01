'use client';

import type { GradebookRecipientHistory } from '@leetcode-app/database';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { AdminBadge } from '@/components/admin/admin-ui';

async function responseError(response: Response) {
  try { const body = await response.json() as { error?: string }; return body.error ?? 'Unable to update the grade review.'; }
  catch { return 'Unable to update the grade review.'; }
}

export function GradeDisputeEditor({ submission }: { submission: GradebookRecipientHistory }) {
  const router = useRouter();
  const reviewReasonId = useId();
  const resolutionReasonId = useId();
  const dispute = submission.disputes.at(-1) ?? null;
  const request = dispute ? submission.disputes.find(event => event.publicationId === dispute.publicationId && event.status === 'submitted') ?? dispute : null;
  const [reviewReason, setReviewReason] = useState('Reviewing the learner request and the published grade.');
  const [resolutionReason, setResolutionReason] = useState('');
  const [outcome, setOutcome] = useState<'upheld' | 'changed'>('upheld');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<'review' | 'resolve' | null>(null);
  const [notice, setNotice] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const latestPublication = submission.publications.at(-1) ?? null;

  if (!dispute) return null;

  async function post(path: 'review' | 'resolution', body: Record<string, unknown>) {
    setBusy(path === 'review' ? 'review' : 'resolve'); setNotice(null);
    try {
      const response = await fetch(`/api/instructor/submissions/${submission.recipientId}/grade-disputes/${path}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, requestKey: crypto.randomUUID() }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      setNotice({ kind: 'success', text: path === 'review' ? 'The request is now marked in review.' : 'The resolution was recorded and is visible to the learner.' });
      setConfirmed(false); router.refresh();
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Unable to update the grade review.' }); }
    finally { setBusy(null); }
  }

  const canResolveChanged = latestPublication !== null && latestPublication.gradeRevisionId !== dispute.gradeRevisionId;
  return <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6" aria-labelledby="grade-dispute-heading">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="mb-1 text-xs font-bold uppercase tracking-wide text-[var(--coral)]">Learner request</p><h2 id="grade-dispute-heading" className="text-xl font-bold">Grade review</h2></div><AdminBadge value={dispute.status.replaceAll('_', ' ')} /></div>
    <div className="mt-4 rounded-lg bg-[#f5f3ed] p-4"><p className="text-sm font-bold">What the learner asked us to review</p><p className="mb-0 mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--muted)]">{request?.message ?? 'No request message is available.'}</p></div>
    {dispute.status === 'resolved' ? <div className="mt-4"><p className="text-sm font-bold">Resolution · {dispute.outcome === 'changed' ? 'Grade changed' : 'Grade upheld'}</p><p className="mb-0 mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--muted)]">{dispute.message ?? 'The review was completed.'}</p></div> : dispute.status === 'withdrawn' || dispute.status === 'superseded' ? <p className="mb-0 mt-4 text-sm leading-6 text-[var(--muted)]">This request is closed and requires no instructor action.</p> : <div className="mt-5 space-y-5">
      {dispute.status === 'submitted' ? <form className="space-y-3" onSubmit={event => { event.preventDefault(); void post('review', { expectedDisputeEventId: dispute.id, reason: reviewReason.trim() }); }}>
        <label className="grid gap-1.5 text-sm font-bold" htmlFor={reviewReasonId}>Internal review note<textarea id={reviewReasonId} className="min-h-24 rounded-md border border-[var(--line)] p-3 font-normal" maxLength={4000} required value={reviewReason} onChange={event => setReviewReason(event.target.value)} /></label>
        <button className="min-h-11 rounded-md border border-[var(--moss)] px-4 font-bold text-[var(--moss)] disabled:opacity-50" disabled={!reviewReason.trim() || busy !== null} type="submit">{busy === 'review' ? 'Updating…' : 'Mark in review'}</button>
      </form> : null}
      <form className="space-y-4 border-t border-[var(--line)] pt-5" onSubmit={event => { event.preventDefault(); if (!confirmed) return; void post('resolution', { expectedDisputeEventId: dispute.id, outcome, replacementGradeRevisionId: outcome === 'changed' ? latestPublication?.gradeRevisionId ?? null : null, reason: resolutionReason.trim() }); }}>
        <fieldset><legend className="text-sm font-bold">Resolution</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="flex gap-3 rounded-lg border border-[var(--line)] p-3 text-sm"><input className="mt-1 accent-[var(--moss)]" type="radio" name="outcome" checked={outcome === 'upheld'} onChange={() => { setOutcome('upheld'); setConfirmed(false); }} /><span><strong className="block">Uphold grade</strong><span className="text-[var(--muted)]">Keep the currently disputed published grade.</span></span></label>
          <label className={`flex gap-3 rounded-lg border border-[var(--line)] p-3 text-sm ${canResolveChanged ? '' : 'opacity-60'}`}><input className="mt-1 accent-[var(--moss)]" type="radio" name="outcome" checked={outcome === 'changed'} disabled={!canResolveChanged} onChange={() => { setOutcome('changed'); setConfirmed(false); }} /><span><strong className="block">Confirm changed grade</strong><span className="text-[var(--muted)]">{canResolveChanged ? 'Use the newer grade that has already been published.' : 'Publish a revised grade above before selecting this outcome.'}</span></span></label>
        </div></fieldset>
        <label className="grid gap-1.5 text-sm font-bold" htmlFor={resolutionReasonId}>Response to learner<textarea id={resolutionReasonId} className="min-h-28 rounded-md border border-[var(--line)] p-3 font-normal" maxLength={4000} required value={resolutionReason} onChange={event => setResolutionReason(event.target.value)} placeholder="Explain what you reviewed and why the grade was upheld or changed." /></label>
        <label className="flex items-start gap-3 text-sm leading-6"><input className="mt-1 h-4 w-4 accent-[var(--moss)]" type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>I reviewed the published grade and confirm this final response will be visible to the learner.</span></label>
        <button className="min-h-11 rounded-md bg-[var(--moss)] px-4 font-bold text-white disabled:opacity-50" disabled={!confirmed || !resolutionReason.trim() || busy !== null} type="submit">{busy === 'resolve' ? 'Saving resolution…' : 'Resolve request'}</button>
      </form>
    </div>}
    {notice ? <p role={notice.kind === 'error' ? 'alert' : 'status'} className={`mb-0 mt-4 rounded-md px-3 py-2 text-sm font-bold ${notice.kind === 'error' ? 'bg-[var(--coral-soft)] text-red-900' : 'bg-[var(--moss-soft)] text-[var(--moss)]'}`}>{notice.text}</p> : null}
  </section>;
}
