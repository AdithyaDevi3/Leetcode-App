'use client';

import type { GradebookRecipientHistory } from '@leetcode-app/database';
import { useState } from 'react';

import { AdminBadge } from '@/components/admin/admin-ui';

export function ApplicabilityEditor({ submission }: { submission: GradebookRecipientHistory }) {
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const isExcused = submission.applicability.applicability === 'excused';

  async function update() {
    setPending(true);
    setMessage('');
    const next = isExcused ? 'assigned' : 'excused';
    try {
      const response = await fetch(`/api/instructor/submissions/${submission.recipientId}/applicability`, {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
          expectedApplicabilityRevisionId: submission.applicability.id,
          applicability: next,
          reason,
          requestKey: crypto.randomUUID(),
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Unable to update assignment status');
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update assignment status');
      setPending(false);
    }
  }

  return <section aria-labelledby="applicability-heading" className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="applicability-heading" className="text-xl font-bold">Assignment status</h2><p className="mt-1 text-sm leading-6 text-[var(--muted)]">Excused work is excluded from totals, coverage, and rank eligibility.</p></div><AdminBadge value={isExcused ? 'excused' : 'assigned'} /></div>
    {isExcused ? <p className="mt-4 rounded-md bg-[#f5f3ed] px-4 py-3 text-sm"><strong>Recorded reason:</strong> {submission.applicability.reason}</p> : null}
    <label className="mt-4 block text-sm font-bold" htmlFor="applicability-reason">{isExcused ? 'Reason for restoring this assignment' : 'Reason for excusal'}</label>
    <textarea id="applicability-reason" className="mt-2 min-h-24 w-full rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm" maxLength={500} value={reason} onChange={event => setReason(event.target.value)} placeholder={isExcused ? 'Why is this assignment applicable again?' : 'Document the approved reason for this exception.'} />
    <div className="mt-3 flex flex-wrap items-center gap-3"><button className={isExcused ? 'inline-flex min-h-11 items-center rounded-md border border-[var(--line)] bg-white px-4 font-bold' : 'inline-flex min-h-11 items-center rounded-md bg-[var(--coral)] px-4 font-bold text-white'} type="button" disabled={pending || !reason.trim()} onClick={update}>{pending ? 'Saving…' : isExcused ? 'Restore assignment' : 'Mark as excused'}</button><p className="mb-0 text-sm text-[var(--muted)]" role="status">{message}</p></div>
  </section>;
}
