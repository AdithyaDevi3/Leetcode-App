'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { LearnerQuizAssignment, QuizSubmissionReceipt } from '@leetcode-app/database';
import { SiteNavigation } from '@/components/site-navigation';
import { QuizQuestionCards, quizButton, quizDate, quizPoints, quizSecondary, type QuizAnswers } from './quiz-ui';

type AnswerDraft = LearnerQuizAssignment['answerDraft'];
type SaveRequest = { expectedRevision: number; answers: QuizAnswers; requestKey: string };
type SubmitRequest = { expectedRevision: number; requestKey: string };
type Recovery = { answers: QuizAnswers; revision: number };
type Cache = { answers: QuizAnswers; baseline: AnswerDraft; recovery: Recovery | null; pendingSave: SaveRequest | null; pendingSubmit: SubmitRequest | null };
const signature = (answers: QuizAnswers) => JSON.stringify(Object.entries(answers).sort(([a], [b]) => a.localeCompare(b)));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function QuizAttemptWorkspace({ assignment, learnerId }: { assignment: LearnerQuizAssignment; learnerId: string }) {
  const normalize = (value: unknown): QuizAnswers | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (Object.keys(record).some(key => !assignment.questions.some(question => question.versionId === key))) return null;
    const entries: [string, string | null][] = [];
    for (const question of assignment.questions) {
      const selected = record[question.versionId] ?? null;
      if (selected !== null && (typeof selected !== 'string' || !question.options.some(option => option.id === selected))) return null;
      entries.push([question.versionId, selected]);
    }
    return Object.fromEntries(entries);
  };
  const [answers, setAnswers] = useState<QuizAnswers>(() => normalize(assignment.answerDraft.answers)!);
  const [baseline, setBaseline] = useState(assignment.answerDraft);
  const [submission, setSubmission] = useState<QuizSubmissionReceipt | null>(assignment.submission);
  const [currentView, setCurrentView] = useState(assignment);
  const [recovery, setRecovery] = useState<Recovery | null>(null);
  const [latest, setLatest] = useState<LearnerQuizAssignment | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingKind, setPendingKind] = useState<'save' | 'submit' | null>(null);
  const [conflict, setConflict] = useState(false);
  const [ownerChanged, setOwnerChanged] = useState(false);
  const [review, setReview] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const pendingSave = useRef<SaveRequest | null>(null);
  const pendingSubmit = useRef<SubmitRequest | null>(null);
  const inFlight = useRef(false);
  const storageKey = `method:quiz:${learnerId}:${assignment.recipientId}:${assignment.policyVersionId}`;
  const endpoint = `/api/learner/assignments/${assignment.recipientId}/quiz`;
  const normalizedBaseline = normalize(baseline.answers)!;
  const dirty = signature(answers) !== signature(normalizedBaseline);
  const answered = assignment.questions.filter(question => answers[question.versionId]).length;
  const blocked = !ready || busy || ownerChanged || conflict || Boolean(submission) || !currentView.isOpen || (currentView.isClosed && !pendingKind);
  const questionViews = assignment.questions.map(question => ({ question, maxUnits: question.maxUnits }));

  function persist(next: Partial<Cache> = {}) {
    const cache: Cache = { answers, baseline, recovery, pendingSave: pendingSave.current, pendingSubmit: pendingSubmit.current, ...next };
    try { window.sessionStorage.setItem(storageKey, JSON.stringify(cache)); } catch { /* Explicit server saves remain available without browser storage. */ }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = window.sessionStorage.getItem(storageKey);
        const cache = raw ? JSON.parse(raw) as Partial<Cache> : null;
        if (!assignment.submission && cache) {
          const local = normalize(cache.answers);
          const previous = cache.baseline && Number.isSafeInteger(cache.baseline.revision) ? normalize(cache.baseline.answers) : null;
          const alternative = cache.recovery && normalize(cache.recovery.answers);
          if (alternative && cache.recovery) setRecovery({ answers: alternative, revision: cache.recovery.revision });
          if (local && previous && cache.baseline) {
            const save = cache.pendingSave;
            const submit = cache.pendingSubmit;
            const validSave = save && Number.isSafeInteger(save.expectedRevision) && typeof save.requestKey === 'string' && normalize(save.answers);
            const validSubmit = submit && Number.isSafeInteger(submit.expectedRevision) && typeof submit.requestKey === 'string';
            if (validSave || validSubmit || cache.baseline.revision === assignment.answerDraft.revision) {
              setAnswers(local); setBaseline(cache.baseline);
              pendingSave.current = validSave ? save! : null; pendingSubmit.current = validSubmit ? submit! : null;
              setPendingKind(validSubmit ? 'submit' : validSave ? 'save' : null);
              if (validSave || validSubmit) setMessage('An earlier request needs confirmation. Retry it to recover the saved receipt.');
              else if (signature(local) !== signature(previous)) setMessage('Restored your unsaved choices from this tab. Save answers to keep them across devices.');
            } else if (signature(local) !== signature(previous)) {
              setRecovery({ answers: local, revision: cache.baseline.revision });
              setMessage('The server has newer saved answers. Your different browser choices are preserved below.');
            }
          }
        }
      } catch { /* Keep the verified server snapshot when browser recovery is unavailable. */ }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
    // The workspace is keyed by learner, recipient and policy; its server snapshot is immutable for this mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (!ready) return;
    persist();
    // Persist acknowledgements and alternatives together so another reload cannot erase recovery.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, storageKey, answers, baseline, recovery, pendingKind, message]);

  useEffect(() => {
    if ((!dirty && !pendingKind) || submission) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, pendingKind, submission]);

  async function send(kind: 'save' | 'submit') {
    if (inFlight.current || ownerChanged || conflict || submission || !currentView.isOpen || (currentView.isClosed && !(kind === 'save' ? pendingSave.current : pendingSubmit.current))) return;
    if (kind === 'submit' && (dirty || pendingSave.current)) return;
    inFlight.current = true; setBusy(true); setError(false); setMessage(null);
    if (kind === 'save' && !pendingSave.current) pendingSave.current = { expectedRevision: baseline.revision, answers: { ...answers }, requestKey: crypto.randomUUID() };
    if (kind === 'submit' && !pendingSubmit.current) pendingSubmit.current = { expectedRevision: baseline.revision, requestKey: crypto.randomUUID() };
    const request = kind === 'save' ? pendingSave.current! : pendingSubmit.current!;
    setPendingKind(kind); persist();
    try {
      const response = await fetch(kind === 'save' ? endpoint : `${endpoint}/submissions`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-quiz-learner': learnerId }, body: JSON.stringify(request), signal: AbortSignal.timeout(15_000) });
      const body = await response.json().catch(() => null) as { answerDraft?: AnswerDraft; currentRevision?: number; submission?: QuizSubmissionReceipt; error?: string; code?: string } | null;
      if (!response.ok) {
        if (body?.code === 'owner_changed') setOwnerChanged(true);
        if (response.status === 409 && body?.code !== 'owner_changed') setConflict(true);
        if ([400, 409, 413].includes(response.status) && body?.code !== 'owner_changed') {
          if (kind === 'save') pendingSave.current = null; else pendingSubmit.current = null;
          setPendingKind(null);
        }
        throw new Error(body?.error ?? 'Unable to confirm the request. Your choices are preserved; retry safely.');
      }
      if (kind === 'save') {
        const saved = body?.answerDraft;
        const normalized = saved && normalize(saved.answers);
        if (!saved || !normalized || saved.revision !== request.expectedRevision + 1
          || signature(normalized) !== signature(normalize((request as SaveRequest).answers)!)
          || (body?.currentRevision !== undefined && (!Number.isSafeInteger(body.currentRevision) || body.currentRevision < saved.revision))) throw new Error('Could not confirm the saved answers. Retry to recover the receipt.');
        pendingSave.current = null; setPendingKind(null); setBaseline(saved);
        if (Math.max(body?.currentRevision ?? saved.revision, assignment.answerDraft.revision) > saved.revision) {
          setConflict(true); setError(true); setMessage('Your earlier save was confirmed, but the server now has newer answers. Your choices are preserved; compare both versions before saving.');
        } else setMessage('Answers saved. You can resume from another device.');
      } else {
        if (!body?.submission || !uuid.test(body.submission.attemptId) || !uuid.test(body.submission.responseRevisionId)
          || !Number.isFinite(Date.parse(body.submission.submittedAt)) || typeof body.submission.isLate !== 'boolean'
          || body.submission.answerRevision !== request.expectedRevision) throw new Error('Could not confirm submission. Retry to recover its receipt.');
        pendingSubmit.current = null; setPendingKind(null); setSubmission(body.submission); setReview(false);
        setMessage('Quiz submitted. Your score will appear after your instructor releases it.');
      }
    } catch (cause) { setError(true); setMessage(cause instanceof Error ? cause.message : 'Request not confirmed. Your choices are preserved.'); }
    finally { inFlight.current = false; setBusy(false); }
  }

  async function compare() {
    if (inFlight.current || ownerChanged) return;
    setBusy(true); setError(false);
    try {
      const response = await fetch(endpoint, { cache: 'no-store', headers: { 'x-quiz-learner': learnerId } });
      const body = await response.json() as { learnerId?: string; assignment?: LearnerQuizAssignment; error?: string; code?: string };
      if (body.code === 'owner_changed' || (body.learnerId && body.learnerId !== learnerId)) { setOwnerChanged(true); throw new Error('Your account changed. Your choices remain in this tab; reopen the quiz in the intended account.'); }
      if (!response.ok || !body.assignment || body.assignment.policyVersionId !== assignment.policyVersionId) throw new Error(body.error ?? 'Could not load the latest answers. Your choices are preserved.');
      setLatest(body.assignment);
    } catch (cause) { setError(true); setMessage(cause instanceof Error ? cause.message : 'Could not compare answers.'); }
    finally { setBusy(false); }
  }

  return <main className="min-h-screen px-5 py-6 sm:px-8"><div className="mx-auto max-w-4xl space-y-6">
    <SiteNavigation currentPath="/classes" />
    <Link className="inline-flex min-h-11 items-center text-sm font-bold text-[var(--moss)] underline" href="/classes">← My classes and tasks</Link>
    <header><p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[var(--coral)]">Class quiz</p><h1 className="break-words text-3xl font-bold sm:text-4xl">{assignment.title}</h1>{assignment.instructions ? <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--muted)]">{assignment.instructions}</p> : null}<p className="mt-3 text-sm">{assignment.questionCount} questions · {quizPoints(assignment.maxUnits)} points · One submission</p><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">{[['Opens', assignment.availableAt], ['Due', assignment.dueAt], ['Closes', assignment.closesAt]].map(([label, value]) => <div key={label}><dt className="font-bold">{label}</dt><dd className="mt-1 text-[var(--muted)]">{quizDate(value)}</dd></div>)}</dl></header>
    {message ? <p className={`rounded-lg border p-4 text-sm ${error ? 'border-[var(--coral)] bg-[var(--coral-soft)]' : 'border-[var(--moss)] bg-[var(--moss-soft)]'}`} role={error ? 'alert' : 'status'} aria-label={error ? 'Quiz request error' : 'Quiz request status'}>{message}</p> : null}
    {ownerChanged ? <p role="alert" aria-label="Quiz account changed" className="rounded-lg border border-[var(--coral)] p-4 text-sm">Your account changed. Saving and submission are paused. Your choices are preserved in this tab for the original learner.</p> : null}
    {submission ? <section aria-label="Submission receipt" className="rounded-xl border border-[var(--moss)] bg-[var(--moss-soft)] p-5"><h2 className="text-xl font-bold">Quiz submitted</h2><dl className="mt-3 space-y-2 text-sm"><div><dt className="font-bold">Submitted</dt><dd>{quizDate(submission.submittedAt)}{submission.isLate ? ' · Late' : ''}</dd></div><div><dt className="font-bold">Receipt</dt><dd className="break-all font-mono text-xs">{submission.attemptId}</dd></div></dl>{currentView.releasedGrade ? <p className="mt-4 text-lg font-bold">Published score: {quizPoints(currentView.releasedGrade.earnedUnits)} / {quizPoints(assignment.maxUnits)}</p> : <p className="mt-4 text-sm">Your score will appear after your instructor releases it. Your submitted choices are shown below.</p>}<Link href={`/classes/${assignment.classId}/grades`} className="mt-2 inline-flex min-h-11 items-center font-bold text-[var(--moss)] underline">View class grades</Link></section> : null}
    {currentView.isClosed && !submission ? <p role="status" className="rounded-lg border border-[var(--line)] p-4 text-sm">This quiz is closed. Your saved choices remain available; new saves and submissions are disabled.</p> : null}
    {!currentView.isOpen ? <p role="status" className="rounded-xl border border-[var(--line)] p-5 text-sm">This quiz opens {quizDate(assignment.availableAt)}. Questions and answer entry will be available then.</p> : null}
    {recovery && !submission ? <details className="rounded-xl border border-[var(--line)] p-4"><summary className="font-bold">Recover different browser choices</summary><p className="mt-3 text-sm">These choices were based on revision {recovery.revision}. Compare them with your current saved answers before restoring.</p><ul className="my-3 space-y-2 text-sm">{assignment.questions.map((question, index) => <li key={question.versionId}>{index + 1}. {question.options.find(option => option.id === recovery.answers[question.versionId])?.text ?? 'Unanswered'}</li>)}</ul><button className={quizSecondary} type="button" disabled={blocked || Boolean(pendingKind)} onClick={() => { setAnswers(recovery.answers); setRecovery({ answers, revision: baseline.revision }); setMessage('Browser choices restored as an unsaved edit. Save answers to replace the server version.'); }}>Restore browser choices</button></details> : null}
    {conflict && !ownerChanged ? <section aria-label="Answer conflict" className="rounded-xl border border-[var(--coral)] p-5"><h2 className="text-lg font-bold">Compare saved answers</h2><p className="mt-2 text-sm">Another save changed this quiz. Your choices are still shown below.</p><button className={quizSecondary} disabled={busy} type="button" onClick={compare}>Load latest saved answers for comparison</button>{latest ? <div className="mt-4 space-y-3"><p className="text-sm font-bold">Server revision {latest.answerDraft.revision}{latest.submission ? ' · Already submitted' : ''}</p><ul className="space-y-2 text-sm">{assignment.questions.map((question, index) => <li key={question.versionId}>{index + 1}. {question.options.find(option => option.id === latest.answerDraft.answers[question.versionId])?.text ?? 'Unanswered'}</li>)}</ul><div className="flex flex-wrap gap-3"><button className={quizSecondary} type="button" onClick={() => { setRecovery({ answers, revision: baseline.revision }); setAnswers(normalize(latest.answerDraft.answers)!); setBaseline(latest.answerDraft); setSubmission(latest.submission); setCurrentView(latest); setConflict(false); setLatest(null); setMessage('Loaded the latest server answers. Your previous choices remain in browser recovery.'); }}>Use server answers</button>{!latest.submission && !latest.isClosed ? <button className={quizSecondary} type="button" onClick={() => { setRecovery({ answers: normalize(latest.answerDraft.answers)!, revision: latest.answerDraft.revision }); setBaseline(latest.answerDraft); setCurrentView(latest); setConflict(false); setLatest(null); setMessage('Kept your choices as an unsaved edit of the latest revision. Save answers when ready.'); }}>Keep my choices as the next edit</button> : null}</div></div> : null}</section> : null}
    {currentView.isOpen ? <nav aria-label="Question navigation" className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4"><p className="mb-3 text-sm font-bold">{answered} of {assignment.questions.length} answered</p><div className="flex flex-wrap gap-2">{assignment.questions.map((question, index) => <a href={`#quiz-question-${index + 1}`} className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border px-3 text-sm font-bold ${answers[question.versionId] ? 'border-[var(--moss)] bg-[var(--moss-soft)]' : 'border-[var(--line)]'}`} aria-label={`Question ${index + 1}, ${answers[question.versionId] ? 'answered' : 'unanswered'}`} key={question.versionId}>{index + 1}</a>)}</div></nav> : null}
    <QuizQuestionCards questions={questionViews} answers={answers} disabled={blocked || Boolean(pendingKind)} onChange={submission ? undefined : (versionId, optionId) => { setAnswers(current => ({ ...current, [versionId]: optionId })); setReview(false); setMessage(null); }} />
    {!submission && currentView.isOpen ? <section className="space-y-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5" aria-label="Save and submit quiz"><p role="status" aria-label="Answer save status" className="text-sm font-bold">{!ready ? 'Loading saved choices…' : pendingKind ? 'Request awaiting confirmation' : dirty ? 'Unsaved choices' : `Saved answers · Revision ${baseline.revision}`}</p><p className="text-sm text-[var(--muted)]">Save answers to resume across devices. Submission is final; your instructor releases the score afterward.</p><div className="flex flex-wrap gap-3"><button className={quizButton} type="button" disabled={blocked || pendingKind === 'submit' || (!dirty && pendingKind !== 'save')} onClick={() => send('save')}>{busy && pendingKind === 'save' ? 'Saving answers…' : pendingKind === 'save' ? 'Retry save' : 'Save answers'}</button><button className={quizSecondary} type="button" disabled={blocked || dirty || pendingKind === 'save'} onClick={() => pendingKind === 'submit' ? send('submit') : setReview(true)}>{pendingKind === 'submit' ? 'Retry submission' : 'Review and submit'}</button></div>{dirty ? <p className="text-sm text-[var(--muted)]">Save your latest choices before reviewing the final submission.</p> : null}{review ? <div className="space-y-4 border-t border-[var(--line)] pt-5" aria-label="Final submission review"><h2 className="text-xl font-bold">Ready to submit?</h2><p className="text-sm">{assignment.questions.length - answered} unanswered {assignment.questions.length - answered === 1 ? 'question' : 'questions'} will earn zero points. You cannot change choices after submitting.</p><ol className="list-decimal space-y-2 pl-5 text-sm">{assignment.questions.map(question => <li key={question.versionId}><span className="font-bold">{question.title}:</span> {question.options.find(option => option.id === answers[question.versionId])?.text ?? 'Unanswered'}</li>)}</ol><div className="flex flex-wrap gap-3"><button className={quizButton} type="button" disabled={blocked || dirty || Boolean(pendingKind)} onClick={() => send('submit')}>Confirm final submission</button><button className={quizSecondary} type="button" disabled={busy} onClick={() => setReview(false)}>Keep reviewing</button></div></div> : null}</section> : null}
  </div></main>;
}
