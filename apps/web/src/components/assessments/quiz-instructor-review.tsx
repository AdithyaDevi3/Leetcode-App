'use client';

import { useEffect, useRef, useState } from 'react';
import type { InstructorQuizAssignment, StoredGradebookPublication } from '@leetcode-app/database';
import { QuizQuestionCards, quizButton, quizDate, quizPoints, type QuizAnswers } from './quiz-ui';

type ReleaseRequest = { expectedPublicationSequence: number; requestKey: string };

export function QuizInstructorReview({ assignment, instructorId }: { assignment: InstructorQuizAssignment; instructorId: string }) {
  const [publication, setPublication] = useState(assignment.publication);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [hasPending, setHasPending] = useState(false);
  const [ready, setReady] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const request = useRef<ReleaseRequest | null>(null);
  const inFlight = useRef(false);
  const grade = assignment.grade;
  const released = Boolean(grade && publication?.gradeRevisionId === grade.id);
  const key = `method:quiz-release:${instructorId}:${assignment.recipientId}:${grade?.id ?? 'none'}`;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = window.sessionStorage.getItem(key);
        const pending = raw ? JSON.parse(raw) as ReleaseRequest : null;
        if (!released && pending && Number.isSafeInteger(pending.expectedPublicationSequence) && typeof pending.requestKey === 'string') {
          request.current = pending; setHasPending(true); setConfirmed(true);
          setMessage('An earlier release needs confirmation. Retry to recover its publication receipt.');
        } else if (released) window.sessionStorage.removeItem(key);
      } catch { /* The persisted grade/publication remains the source of truth. */ }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [key, released]);

  async function release() {
    if (!grade || !confirmed || inFlight.current || released || conflict) return;
    inFlight.current = true; setBusy(true); setError(false); setMessage(null);
    if (!request.current) request.current = { expectedPublicationSequence: publication?.sequence ?? 0, requestKey: crypto.randomUUID() };
    setHasPending(true);
    try {
      try { window.sessionStorage.setItem(key, JSON.stringify(request.current)); } catch { /* Retry with the same identity in memory. */ }
      const response = await fetch(`/api/instructor/submissions/${assignment.recipientId}/grades/${grade.id}/publications`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-assessment-author': instructorId }, body: JSON.stringify(request.current), signal: AbortSignal.timeout(15_000) });
      const body = await response.json().catch(() => null) as { publication?: StoredGradebookPublication; error?: string } | null;
      if (!response.ok || !body?.publication) {
        if (response.status === 409 || response.status === 403 || response.status === 401) setConflict(true);
        if ([400, 413].includes(response.status)) { request.current = null; setHasPending(false); try { window.sessionStorage.removeItem(key); } catch { /* The error is definitive. */ } }
        throw new Error(body?.error ?? 'Could not confirm grade release. Retry safely.');
      }
      if (body.publication.gradeRevisionId !== grade.id || body.publication.sequence !== request.current!.expectedPublicationSequence + 1
        || !Number.isFinite(Date.parse(body.publication.publishedAt))) throw new Error('Could not confirm the grade publication receipt. Retry safely.');
      setPublication(body.publication); request.current = null; setHasPending(false);
      try { window.sessionStorage.removeItem(key); } catch { /* Confirmed publication is durable. */ }
      setMessage('Grade released. The learner can now see this score in class grades.');
    } catch (cause) { setError(true); setMessage(cause instanceof Error ? cause.message : 'Could not release the grade.'); }
    finally { inFlight.current = false; setBusy(false); }
  }

  return <div className="space-y-6">
    <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6" aria-label="Quiz submission and grade">
      <h2 className="text-xl font-bold">{assignment.submission ? 'Submitted quiz' : 'Not submitted'}</h2>
      <p className="mt-2 text-sm text-[var(--muted)]">{assignment.learner.displayName} · One submission · Instructor release</p>
      {assignment.submission ? <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2"><div><dt className="font-bold">Submitted</dt><dd>{quizDate(assignment.submission.submittedAt)}{assignment.submission.isLate ? ' · Late' : ''}</dd></div><div><dt className="font-bold">Receipt</dt><dd className="break-all font-mono text-xs">{assignment.submission.attemptId}</dd></div></dl> : <p className="mt-3 text-sm">No final response or score has been created. Submitted choices will appear here after the learner finishes.</p>}
      {grade ? <div className="mt-5 border-t border-[var(--line)] pt-5"><p className="text-sm font-bold">Calculated score</p><p className="mt-2 font-mono text-2xl font-bold">{quizPoints(grade.earnedUnits)} / {quizPoints(assignment.maxUnits)}</p><p className="mt-2 text-sm text-[var(--muted)]">Scored automatically from the frozen question versions and point values. {released ? 'Released to the learner.' : 'Private until you release this grade.'}</p>{released ? <p className="mt-3 text-sm font-bold">Released {quizDate(publication?.publishedAt ?? null)}</p> : <div className="mt-4 space-y-4"><label className="flex min-h-11 items-start gap-3 text-sm leading-6"><input className="mt-1" type="checkbox" checked={confirmed} disabled={busy || hasPending || conflict} onChange={event => setConfirmed(event.target.checked)} />I reviewed the saved submission and want to release this score to the learner.</label><button className={quizButton} type="button" disabled={!ready || !confirmed || busy || conflict} onClick={release}>{busy ? 'Releasing grade…' : hasPending ? 'Retry grade release' : 'Release grade'}</button></div>}</div> : assignment.submission ? <p role="alert" aria-label="Missing quiz score" className="mt-4 text-sm">The submitted score is unavailable. Reload the saved record before releasing a grade.</p> : null}
      {message ? <p role={error ? 'alert' : 'status'} aria-label={error ? 'Quiz release error' : 'Quiz release status'} className={`mt-4 rounded-lg border p-4 text-sm ${error ? 'border-[var(--coral)] bg-[var(--coral-soft)]' : 'border-[var(--moss)] bg-[var(--moss-soft)]'}`}>{message}</p> : null}
      {conflict ? <p className="mt-3 text-sm">The saved record or your account changed. Release is paused; reopen this page to review the latest state.</p> : null}
    </section>
    {assignment.submission ? <QuizQuestionCards questions={assignment.questions.map(question => ({ question, maxUnits: question.maxUnits }))} answers={assignment.answerDraft.answers as QuizAnswers} /> : null}
  </div>;
}
