'use client';

import { useMemo, useState } from 'react';
import type { GradebookRecipientHistory, StoredGradebookGrade } from '@leetcode-app/database';
import { AdminBadge } from '@/components/admin/admin-ui';

const displayPoints = (units: number) => (units / 100).toFixed(2).replace(/\.00$/, '');
const parsePoints = (value: string): number | null => {
  if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const units = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(units) ? units : null;
};

export function ManualGradeEditor({ submission }: { submission: GradebookRecipientHistory }) {
  if (submission.policy.scoring.mode !== 'reviewed_rubric') throw new Error('Manual rubric required');
  const criteria = submission.policy.scoring.criteria;
  const attempt = submission.attempts.at(-1)!;
  const latestStored = submission.grades.at(-1) ?? null;
  const activeDraft = latestStored?.attemptId === attempt.id ? latestStored : null;
  const latestPublication = submission.publications.at(-1) ?? null;
  const [grade, setGrade] = useState<StoredGradebookGrade | null>(activeDraft);
  const [scores, setScores] = useState<Record<string, string>>(() => Object.fromEntries(criteria.map(criterion => [criterion.id, activeDraft ? displayPoints(activeDraft.criterionScores[criterion.id] ?? 0) : ''])));
  const [learnerFeedback, setLearnerFeedback] = useState(activeDraft?.learnerFeedback ?? '');
  const [privateNote, setPrivateNote] = useState(activeDraft?.privateNote ?? '');
  const [busy, setBusy] = useState<'save' | 'publish' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const parsedScores = useMemo(() => Object.fromEntries(Object.entries(scores).map(([id, value]) => [id, parsePoints(value)])), [scores]);
  const earned = Object.values(parsedScores).every(value => value !== null) ? Object.values(parsedScores).reduce<number>((sum, value) => sum + (value ?? 0), 0) : null;

  async function saveDraft() {
    setMessage(null);
    for (const criterion of criteria) {
      const score = parsedScores[criterion.id];
      if (score === null || score < 0 || score > criterion.maxUnits) { setMessage(`Enter 0–${displayPoints(criterion.maxUnits)} points for ${criterion.label}.`); return; }
    }
    setBusy('save');
    try {
      const response = await fetch(`/api/instructor/submissions/${submission.recipientId}/draft-grade`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ attemptId: attempt.id, expectedGradeRevisionId: grade?.id ?? latestStored?.id ?? null, criterionScores: parsedScores, learnerFeedback, privateNote, requestKey: crypto.randomUUID() }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Unable to save draft');
      setGrade(body.grade); setMessage('Draft saved. Learners cannot see it until you publish.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to save draft'); }
    finally { setBusy(null); }
  }

  async function publish() {
    if (!grade) return;
    setBusy('publish'); setMessage(null);
    try {
      const response = await fetch(`/api/instructor/submissions/${submission.recipientId}/grades/${grade.id}/publications`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedPublicationSequence: latestPublication?.sequence ?? 0, requestKey: crypto.randomUUID() }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Unable to publish grade');
      setMessage('Grade published to the learner.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to publish grade'); }
    finally { setBusy(null); }
  }

  return <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
    <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Latest response</h2><p className="text-sm text-[var(--muted)]">Attempt {attempt.sequence} · {new Date(attempt.submittedAt).toLocaleString()}</p></div><AdminBadge value={latestPublication?.gradeRevisionId === grade?.id ? 'published' : grade ? 'draft' : 'submitted'} /></div>
      <pre className="max-h-[36rem] overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--line)] bg-[#f6f4ee] p-4 text-sm leading-6">{attempt.response.text}</pre>
    </section>
    <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6">
      <h2 className="mb-1 text-lg font-bold">Rubric</h2><p className="mb-5 text-sm text-[var(--muted)]">Save a private draft, review the total, then publish.</p>
      <div className="space-y-4">{criteria.map(criterion => <label className="grid gap-1.5 text-sm font-bold" key={criterion.id}>{criterion.label}<span className="flex items-center gap-2"><input className="min-h-11 min-w-0 flex-1 rounded-md border border-[var(--line)] px-3 font-normal" inputMode="decimal" value={scores[criterion.id]} onChange={event => setScores(current => ({ ...current, [criterion.id]: event.target.value }))} /><span className="text-[var(--muted)]">/ {displayPoints(criterion.maxUnits)}</span></span></label>)}</div>
      <p className="my-5 border-y border-[var(--line)] py-4 text-sm font-bold">Total <span className="float-right font-mono text-lg">{earned === null ? '—' : displayPoints(earned)} / {displayPoints(submission.policy.maxUnits)}</span></p>
      <label className="mb-4 grid gap-1.5 text-sm font-bold">Feedback for learner<textarea className="min-h-28 rounded-md border border-[var(--line)] p-3 font-normal" maxLength={10000} value={learnerFeedback} onChange={event => setLearnerFeedback(event.target.value)} /></label>
      <label className="mb-5 grid gap-1.5 text-sm font-bold">Private instructor notes<textarea className="min-h-24 rounded-md border border-[var(--line)] p-3 font-normal" maxLength={10000} value={privateNote} onChange={event => setPrivateNote(event.target.value)} /><span className="font-normal text-[var(--muted)]">Never shown to the learner.</span></label>
      {message ? <p aria-live="polite" className="mb-4 rounded-md bg-[var(--sky)] px-3 py-2 text-sm">{message}</p> : null}
      <div className="flex flex-wrap gap-3"><button className="min-h-11 rounded-md border border-[var(--moss)] px-4 font-bold text-[var(--moss)] disabled:opacity-50" disabled={busy !== null} onClick={saveDraft} type="button">{busy === 'save' ? 'Saving…' : 'Save draft'}</button><button className="min-h-11 rounded-md bg-[var(--moss)] px-4 font-bold text-white disabled:opacity-50" disabled={!grade || busy !== null} onClick={publish} type="button">{busy === 'publish' ? 'Publishing…' : 'Publish grade'}</button></div>
    </section>
  </div>;
}
