'use client';

import type { GradebookRecipientHistory, StoredGradebookGrade } from '@leetcode-app/database';
import { useState } from 'react';

import { AdminBadge } from '@/components/admin/admin-ui';

export function MissingWorkEditor({ submission }: { submission: GradebookRecipientHistory }) {
  const latestGrade = submission.grades.at(-1) ?? null;
  const existing = latestGrade?.kind === 'missing_zero' ? latestGrade : null;
  const latestPublication = submission.publications.at(-1) ?? null;
  const [grade, setGrade] = useState<StoredGradebookGrade | null>(existing);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<'draft' | 'publish' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const closed = submission.assignment.closesAt !== null && new Date(submission.assignment.closesAt).getTime() < Date.now();
  const published = grade !== null && latestPublication?.gradeRevisionId === grade.id;

  async function createDraft() {
    setBusy('draft'); setMessage(null);
    try {
      const response = await fetch(`/api/instructor/submissions/${submission.recipientId}/missing-grade`, {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expectedGradeRevisionId: latestGrade?.id ?? null, requestKey: crypto.randomUUID() }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Unable to finalize missing work');
      setGrade(body.grade); setMessage('Zero-point draft created. Publish it when you are ready for the learner and class total to update.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to finalize missing work'); }
    finally { setBusy(null); }
  }

  async function publish() {
    if (!grade) return;
    setBusy('publish'); setMessage(null);
    try {
      const response = await fetch(`/api/instructor/submissions/${submission.recipientId}/grades/${grade.id}/publications`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expectedPublicationSequence: latestPublication?.sequence ?? 0, requestKey: crypto.randomUUID() }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Unable to publish missing-work grade');
      setMessage('Missing-work zero published to the learner and class gradebook.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to publish missing-work grade'); }
    finally { setBusy(null); }
  }

  return <section className="mx-auto max-w-2xl rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_10px_30px_rgba(34,46,38,0.05)] sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-bold">No submission received</h2><p className="mt-1 text-sm leading-6 text-[var(--muted)]">A missing-work grade is always zero points and becomes part of the learner’s total only after publication.</p></div><AdminBadge value={published ? 'published' : grade ? 'draft' : 'unsubmitted'} /></div>
    <dl className="my-5 grid gap-3 rounded-lg bg-[#f5f3ed] p-4 text-sm sm:grid-cols-2"><div><dt className="font-bold">Due date</dt><dd className="mt-1 text-[var(--muted)]">{submission.assignment.dueOn ?? 'None'}</dd></div><div><dt className="font-bold">Closed at</dt><dd className="mt-1 text-[var(--muted)]">{submission.assignment.closesAt ? new Date(submission.assignment.closesAt).toLocaleString() : 'No closing time'}</dd></div></dl>
    {!closed ? <p role="status" className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">This assignment is still open. Missing work can be finalized only after a due-dated assignment closes.</p> : !grade ? <label className="flex items-start gap-3 rounded-md border border-[var(--line)] p-4 text-sm"><input className="mt-1 size-4" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} type="checkbox" /><span><strong className="block">Confirm no submission was received</strong><span className="mt-1 block text-[var(--muted)]">This creates an attributable zero-point draft. You will review and publish it separately.</span></span></label> : null}
    {message ? <p aria-live="polite" className="mt-4 rounded-md bg-[var(--sky)] px-3 py-2 text-sm">{message}</p> : null}
    <div className="mt-5 flex flex-wrap gap-3">{!grade ? <button className="min-h-11 rounded-md border border-red-700 px-4 font-bold text-red-800 disabled:opacity-50" disabled={!closed || !confirmed || busy !== null} onClick={createDraft} type="button">{busy === 'draft' ? 'Creating…' : 'Create zero-point draft'}</button> : <button className="min-h-11 rounded-md bg-[var(--moss)] px-4 font-bold text-white disabled:opacity-50" disabled={published || busy !== null} onClick={publish} type="button">{busy === 'publish' ? 'Publishing…' : published ? 'Published' : 'Publish zero'}</button>}</div>
  </section>;
}
