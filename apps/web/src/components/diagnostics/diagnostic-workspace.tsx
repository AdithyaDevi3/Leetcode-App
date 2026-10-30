'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { DiagnosticAnswerDraft, DiagnosticSubmissionReceipt, DiagnosticView, DiagnosticSaveReceipt } from '@leetcode-app/database';
import { SiteNavigation } from '@/components/site-navigation';
import { quizButton, quizSecondary, quizDate } from '@/components/assessments/quiz-ui';
import { answerSignature, diagnosticAnswers, diagnosticUuid, validDiagnostic, validDiagnosticDraft, validDiagnosticSubmission } from '@/lib/diagnostic-client';

type Answers = Record<string, string | null>;
type Save = { expectedRevision: number; answers: Answers; requestKey: string };
type Submit = { expectedRevision: number; requestKey: string };
type Recovery = { answers: Answers; revision: number };
type Cache = { answers: Answers; baseline: DiagnosticAnswerDraft; recovery: Recovery | null; pendingSave: Save | null; pendingSubmit: Submit | null };

export function DiagnosticWorkspace({ learnerId, initial }: { learnerId: string; initial: DiagnosticView }) {
  const [view, setView] = useState(initial);
  const [answers, setAnswers] = useState<Answers>(() => diagnosticAnswers(initial, initial.answerDraft.answers)!);
  const [baseline, setBaseline] = useState(initial.answerDraft);
  const [submission, setSubmission] = useState(initial.submission);
  const [recovery, setRecovery] = useState<Recovery | null>(null);
  const [latest, setLatest] = useState<DiagnosticView | null>(null);
  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(true);
  const [checking, setChecking] = useState(false);
  const [ownerChanged, setOwnerChanged] = useState(false);
  const [pendingKind, setPendingKind] = useState<'save' | 'submit' | null>(null);
  const [conflict, setConflict] = useState(false);
  const [review, setReview] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const alive = useRef(true);
  const stopped = useRef(false);
  const inFlight = useRef(false);
  const verificationEpoch = useRef(0);
  const pendingSave = useRef<Save | null>(null);
  const pendingSubmit = useRef<Submit | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const endpoint = `/api/learner/diagnostics/${initial.id}`;
  const storageKey = `method:diagnostic:${learnerId}:${initial.id}`;
  const dirty = answerSignature(answers) !== answerSignature(diagnosticAnswers(initial, baseline.answers)!);
  const answered = initial.questions.filter(question => answers[question.versionId]).length;
  const disabled = !ready || busy || !verified || ownerChanged || conflict || Boolean(submission) || Boolean(pendingKind);
  const question = initial.questions[index];
  // Focus handlers read current state without reattaching listeners after each edit.
  const current = useRef({ baseline, submission });
  useEffect(() => { current.current = { baseline, submission }; }, [baseline, submission]);

  function persist(next: Partial<Cache> = {}) {
    try { window.sessionStorage.setItem(storageKey, JSON.stringify({ answers, baseline, recovery,
      pendingSave: pendingSave.current, pendingSubmit: pendingSubmit.current, ...next } satisfies Cache)); }
    catch { /* Server saves still work when browser storage is unavailable. */ }
  }
  function stopOwner() {
    stopped.current = true; setOwnerChanged(true); setVerified(false);
    setError(true); setMessage('Your account changed. Reopen this skills check in the original account. Your browser choices are preserved.');
  }
  function checkOwner(response: Response, body: { learnerId?: string; code?: string }) {
    if (response.status === 401 || body.code === 'owner_changed' || (body.learnerId && body.learnerId !== learnerId)) { stopOwner(); throw new Error('Account verification changed. Saving is paused.'); }
    if (response.ok && body.learnerId !== learnerId) throw new Error('The response could not be verified. Retry the same request.');
  }
  async function readVerified(): Promise<DiagnosticView> {
    const epoch = verificationEpoch.current;
    const response = await fetch(endpoint, { cache: 'no-store', headers: { 'x-diagnostic-owner': learnerId }, signal: AbortSignal.timeout(15_000) });
    const body = await response.json();
    if (!alive.current || stopped.current || epoch !== verificationEpoch.current) throw new Error('Account verification changed. Verify your account again.');
    checkOwner(response, body);
    if (!response.ok) throw new Error(body.error ?? 'Could not read saved answers. Your choices are preserved.');
    const saved: unknown = body.diagnostic;
    if (!validDiagnostic(saved) || saved.id !== initial.id || saved.selectionVersion !== initial.selectionVersion
      || JSON.stringify(saved.questions) !== JSON.stringify(initial.questions)) throw new Error('Could not verify the saved question set. Your choices are preserved.');
    return saved;
  }
  async function verifyAccount() {
    if (stopped.current) return;
    const epoch = ++verificationEpoch.current;
    setChecking(true); setVerified(false);
    try {
      const saved = await readVerified();
      if (!alive.current || stopped.current || epoch !== verificationEpoch.current) return;
      setVerified(true);
      if (!pendingSave.current && !pendingSubmit.current && (saved.answerDraft.revision !== current.current.baseline.revision || Boolean(saved.submission) !== Boolean(current.current.submission))) {
        setLatest(saved); setConflict(true); setError(true); setMessage('This skills check changed on the server. Compare saved answers before continuing.');
      } else if (current.current.submission && saved.submission) setView(saved);
    } catch (cause) { if (alive.current && !stopped.current && epoch === verificationEpoch.current) { setError(true); setMessage(cause instanceof Error ? cause.message : 'Could not verify your account.'); } }
    finally { if (alive.current && epoch === verificationEpoch.current) setChecking(false); }
  }

  useEffect(() => {
    alive.current = true;
    const timer = window.setTimeout(() => {
      try {
        const raw = window.sessionStorage.getItem(storageKey);
        const cache = raw ? JSON.parse(raw) as Partial<Cache> : null;
        if (cache && validDiagnosticDraft(initial, cache.baseline)) {
          const local = diagnosticAnswers(initial, cache.answers);
          const old = diagnosticAnswers(initial, cache.baseline.answers)!;
          const alternative = cache.recovery && diagnosticAnswers(initial, cache.recovery.answers);
          if (alternative && cache.recovery && Number.isSafeInteger(cache.recovery.revision) && cache.recovery.revision >= 0) setRecovery({ answers: alternative, revision: cache.recovery.revision });
          if (local) {
            const save = cache.pendingSave;
            const submit = cache.pendingSubmit;
            const validSave = save && save.expectedRevision === cache.baseline.revision && typeof save.requestKey === 'string' && diagnosticUuid.test(save.requestKey) && diagnosticAnswers(initial, save.answers)
              && answerSignature(diagnosticAnswers(initial, save.answers)!) === answerSignature(local);
            const validSubmit = submit && submit.expectedRevision === cache.baseline.revision && typeof submit.requestKey === 'string' && diagnosticUuid.test(submit.requestKey)
              && answerSignature(local) === answerSignature(old);
            const matchingBaseline = cache.baseline.revision === initial.answerDraft.revision && answerSignature(old) === answerSignature(diagnosticAnswers(initial, initial.answerDraft.answers)!);
            if (initial.submission) {
              if (answerSignature(local) !== answerSignature(diagnosticAnswers(initial, initial.answerDraft.answers)!)) setRecovery({ answers: local, revision: cache.baseline.revision });
            } else if ((validSave && !validSubmit) || (validSubmit && !validSave) || matchingBaseline) {
              setAnswers(local); setBaseline(cache.baseline);
              pendingSave.current = validSave && !validSubmit ? save! : null;
              pendingSubmit.current = validSubmit && !validSave ? submit! : null;
              setPendingKind(pendingSave.current ? 'save' : pendingSubmit.current ? 'submit' : null);
              if (pendingSave.current || pendingSubmit.current) setMessage('An earlier request needs confirmation. Retry it to recover the saved receipt.');
              else if (answerSignature(local) !== answerSignature(old)) setMessage('Restored unsaved choices from this tab. Save answers to resume across devices.');
            } else if (answerSignature(local) !== answerSignature(diagnosticAnswers(initial, initial.answerDraft.answers)!)) {
              setRecovery({ answers: local, revision: cache.baseline.revision });
              setMessage('The server has newer answers. Your different browser choices are preserved in recovery.');
            }
          }
        }
      } catch { /* A malformed cache cannot replace the verified server snapshot. */ }
      setReady(true);
    }, 0);
    const hide = () => { verificationEpoch.current += 1; setVerified(false); setChecking(false); };
    const focus = () => { void verifyAccount(); };
    const visibility = () => { if (document.visibilityState === 'hidden') hide(); else focus(); };
    window.addEventListener('blur', hide); window.addEventListener('focus', focus); document.addEventListener('visibilitychange', visibility);
    return () => { alive.current = false; verificationEpoch.current += 1; window.clearTimeout(timer); window.removeEventListener('blur', hide); window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', visibility); };
    // Owner and immutable question set define the mounted workspace boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  useEffect(() => {
    if (ready) persist();
    // Preserve choices, original request identities and comparison copies together.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, answers, baseline, recovery, pendingKind]);
  useEffect(() => {
    if ((!dirty && !pendingKind) || submission) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, pendingKind, submission]);

  async function feedback(receipt: DiagnosticSubmissionReceipt) {
    const saved = await readVerified();
    if (!saved.submission || saved.submission.requestKey !== receipt.requestKey || saved.submission.answerRevision !== receipt.answerRevision) throw new Error('Submission received. Reload results to confirm the feedback.');
    if (alive.current && !stopped.current) { setView(saved); setAnswers(diagnosticAnswers(saved, saved.answerDraft.answers)!); setBaseline(saved.answerDraft); }
  }
  async function send(kind: 'save' | 'submit') {
    if (inFlight.current || stopped.current || !verified || conflict || submission || !ready) return;
    if (kind === 'submit' && (dirty || pendingSave.current)) return;
    if (kind === 'save' && pendingSubmit.current) return;
    inFlight.current = true; setBusy(true); setError(false); setMessage(null);
    if (kind === 'save' && !pendingSave.current) pendingSave.current = { expectedRevision: baseline.revision, answers: { ...answers }, requestKey: crypto.randomUUID() };
    if (kind === 'submit' && !pendingSubmit.current) pendingSubmit.current = { expectedRevision: baseline.revision, requestKey: crypto.randomUUID() };
    const request = kind === 'save' ? pendingSave.current! : pendingSubmit.current!;
    setPendingKind(kind); persist();
    try {
      const response = await fetch(`${endpoint}/${kind === 'save' ? 'answers' : 'submissions'}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-diagnostic-owner': learnerId }, body: JSON.stringify(request), signal: AbortSignal.timeout(15_000) });
      const body = await response.json().catch(() => ({}));
      if (!alive.current || stopped.current) return;
      checkOwner(response, body);
      if (!response.ok) {
        if ([400, 409, 413].includes(response.status)) {
          if (kind === 'save') pendingSave.current = null; else pendingSubmit.current = null;
          setPendingKind(null);
          if (response.status === 409) setConflict(true);
        }
        throw new Error(body.error ?? 'Request not confirmed. Your choices are preserved; retry safely.');
      }
      if (kind === 'save') {
        const receipt = body.receipt as DiagnosticSaveReceipt | undefined;
        const saved = receipt?.answerDraft;
        if (!receipt || receipt.diagnosticId !== initial.id || receipt.requestKey !== request.requestKey || !validDiagnosticDraft(initial, saved)
          || saved.revision !== request.expectedRevision + 1 || !Number.isSafeInteger(receipt.currentRevision) || receipt.currentRevision < saved.revision
          || answerSignature(diagnosticAnswers(initial, saved.answers)!) !== answerSignature(diagnosticAnswers(initial, (request as Save).answers)!)) throw new Error('Saved answers were not confirmed. Retry to recover the original receipt.');
        pendingSave.current = null; setPendingKind(null); setBaseline(saved);
        if (Math.max(receipt.currentRevision, initial.answerDraft.revision) > saved.revision) {
          setConflict(true); setError(true); setMessage('Your earlier save was confirmed, but the server has newer answers. Compare both versions before continuing.');
        } else setMessage('Answers saved. Resume from any signed-in device.');
      } else {
        const receipt = body.receipt;
        if (!validDiagnosticSubmission(initial.id, receipt) || receipt.requestKey !== request.requestKey || receipt.answerRevision !== request.expectedRevision) throw new Error('Submission was not confirmed. Retry to recover the original receipt.');
        pendingSubmit.current = null; setPendingKind(null); setSubmission(receipt); setReview(false); setMessage('Skills check submitted. Your answers are saved.');
        try { await feedback(receipt); } catch { setMessage('Submission received. Reload results to view your explanations.'); }
      }
    } catch (cause) { if (alive.current && !stopped.current) { setError(true); setMessage(cause instanceof Error ? cause.message : 'Request not confirmed. Your choices are preserved.'); } }
    finally { inFlight.current = false; if (alive.current) setBusy(false); }
  }
  async function compare() {
    if (inFlight.current || stopped.current) return;
    const epoch = verificationEpoch.current;
    inFlight.current = true; setBusy(true); setError(false);
    try { const saved = await readVerified(); if (alive.current && !stopped.current && epoch === verificationEpoch.current) { setLatest(saved); setVerified(true); } }
    catch (cause) { if (alive.current && !stopped.current && epoch === verificationEpoch.current) { setError(true); setMessage(cause instanceof Error ? cause.message : 'Could not compare saved answers.'); } }
    finally { inFlight.current = false; if (alive.current) setBusy(false); }
  }
  function move(next: number) { setIndex(next); setReview(false); window.requestAnimationFrame(() => heading.current?.focus()); }
  function choices(selected: Answers) { return <ol className="list-decimal space-y-2 pl-5 text-sm">{initial.questions.map(item => <li key={item.versionId}><strong>{item.title}:</strong> {item.options.find(option => option.id === selected[item.versionId])?.text ?? 'Skipped'}</li>)}</ol>; }

  return <main className="min-h-screen px-5 py-6 sm:px-8"><div className="mx-auto max-w-4xl space-y-6"><SiteNavigation currentPath="/diagnostic" />
    <header><p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[var(--coral)]">Personal practice · 10 questions</p><h1 className="text-3xl font-bold sm:text-4xl">Your skills check</h1><p className="mt-3 text-sm leading-6 text-[var(--muted)]">Save and resume across devices. Answered questions can guide your practice when personalization is enabled. Skipped items do not count as weaknesses. This check does not create a class grade.</p></header>
    {message ? <p className={`rounded-lg border p-4 text-sm ${error ? 'border-[var(--coral)] bg-[var(--coral-soft)]' : 'border-[var(--moss)] bg-[var(--moss-soft)]'}`} role={error ? 'alert' : 'status'} aria-label="Skills check request status">{message}</p> : null}
    {ownerChanged ? <p role="alert" className="rounded-lg border border-[var(--coral)] p-4">Saving and submission are paused for the original account. Reopen the skills check after signing in again.</p> : !verified ? <section aria-label="Account verification" className="space-y-3 rounded-xl border border-[var(--line)] p-5"><p role="status">{checking ? 'Verifying your account…' : 'Verify your account to show your saved choices.'}</p><button className={quizSecondary} type="button" disabled={checking} onClick={() => verifyAccount()}>Verify account</button></section> : <>
      {submission ? <section aria-label="Skills check results" className="space-y-3 rounded-xl border border-[var(--moss)] bg-[var(--moss-soft)] p-5"><h2 className="text-2xl font-bold">Skills check complete</h2><p className="text-sm">Submitted {quizDate(submission.submittedAt)} · Receipt <span className="break-all font-mono text-xs">{submission.requestKey}</span></p>{view.feedback ? <><p className="text-xl font-bold">{view.feedback.correctCount} correct of {view.feedback.answeredCount} answered</p><p className="text-sm">{10 - view.feedback.answeredCount} skipped. Skipped items are excluded from your learning evidence. A short check is a starting point; practice adds more evidence over time.</p><Link className="inline-flex min-h-11 items-center font-bold text-[var(--moss)] underline" href="/dashboard">See my practice recommendations</Link></> : <button className={quizSecondary} type="button" disabled={busy} onClick={async () => { setBusy(true); try { await feedback(submission); } catch (cause) { setError(true); setMessage(cause instanceof Error ? cause.message : 'Results unavailable. Try again.'); } finally { if (alive.current) setBusy(false); } }}>Reload results</button>}</section> : null}
      {recovery ? <details className="rounded-xl border border-[var(--line)] p-4"><summary className="font-bold">Recover different browser choices</summary><p className="my-3 text-sm">Preserved from revision {recovery.revision}. Compare these with your saved answers.</p>{choices(recovery.answers)}{!submission ? <button className={`${quizSecondary} mt-4`} type="button" disabled={disabled} onClick={() => { setAnswers(recovery.answers); setRecovery({ answers, revision: baseline.revision }); setReview(false); setMessage('Browser choices restored as an unsaved edit. Save answers when ready.'); }}>Restore browser choices</button> : <p className="mt-3 text-sm">Submitted answers are final. This browser copy is available for reference.</p>}</details> : null}
      {conflict ? <section aria-label="Answer conflict" className="space-y-4 rounded-xl border border-[var(--coral)] p-5"><h2 className="text-xl font-bold">Compare saved answers</h2><p className="text-sm">Your choices are preserved. Compare with the current server version before making another edit.</p><button className={quizSecondary} disabled={busy || Boolean(pendingKind)} type="button" onClick={compare}>Load latest saved answers</button>{latest ? <><p className="text-sm font-bold">Server revision {latest.answerDraft.revision}{latest.submission ? ' · Submitted' : ''}</p>{choices(latest.answerDraft.answers)}<div className="flex flex-wrap gap-3"><button className={quizSecondary} type="button" onClick={() => { setRecovery({ answers, revision: baseline.revision }); setAnswers(diagnosticAnswers(initial, latest.answerDraft.answers)!); setBaseline(latest.answerDraft); setSubmission(latest.submission); setView(latest); setConflict(false); setLatest(null); setMessage('Loaded saved answers. Your previous browser choices are preserved.'); }}>Use server answers</button>{!latest.submission ? <button className={quizSecondary} type="button" onClick={() => { setRecovery({ answers: diagnosticAnswers(initial, latest.answerDraft.answers)!, revision: latest.answerDraft.revision }); setBaseline(latest.answerDraft); setView(latest); setConflict(false); setLatest(null); setMessage('Your choices are an unsaved edit of the latest revision. Save answers when ready.'); }}>Keep my choices as the next edit</button> : null}</div></> : null}</section> : null}
      <nav aria-label="Question navigation" className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4"><p className="mb-3 text-sm font-bold">{answered} of 10 answered</p><div className="flex flex-wrap gap-2">{initial.questions.map((item, position) => <button className={`min-h-11 min-w-11 rounded-md border px-3 text-sm font-bold ${index === position ? 'border-[var(--moss)] bg-[var(--moss)] text-white' : answers[item.versionId] ? 'border-[var(--moss)] bg-[var(--moss-soft)]' : 'border-[var(--line)]'}`} type="button" key={item.versionId} aria-current={index === position ? 'step' : undefined} aria-label={`Question ${position + 1}, ${answers[item.versionId] ? 'answered' : 'unanswered'}`} onClick={() => move(position)}>{position + 1}</button>)}</div></nav>
      <section aria-label={`Question ${index + 1}`} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-7"><h2 ref={heading} tabIndex={-1} className="mb-4 text-xl font-bold outline-none">{index + 1}. {question.title}</h2><fieldset disabled={disabled}><legend className="sr-only">Choose an answer for question {index + 1}</legend><p className="mb-5 whitespace-pre-wrap break-words text-sm leading-7">{question.prompt}</p><div className="space-y-3">{question.options.map(option => <label key={option.id} className={`flex min-h-12 items-start gap-3 rounded-lg border p-3 text-sm leading-6 ${answers[question.versionId] === option.id ? 'border-[var(--moss)] bg-[var(--moss-soft)]' : 'border-[var(--line)] bg-white'} has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-[var(--moss)]`}><input type="radio" className="mt-1 h-4 w-4 shrink-0 accent-[var(--moss)]" name={`diagnostic-${question.versionId}`} value={option.id} checked={answers[question.versionId] === option.id} onChange={() => { setAnswers(value => ({ ...value, [question.versionId]: option.id })); setReview(false); setMessage(null); }} /><span className="min-w-0 whitespace-pre-wrap break-words">{option.text}</span></label>)}</div>{!submission ? <button className="mt-3 min-h-11 text-sm font-bold text-[var(--moss)] underline disabled:opacity-50" type="button" disabled={disabled || !answers[question.versionId]} onClick={() => { setAnswers(value => ({ ...value, [question.versionId]: null })); setReview(false); }}>Clear answer</button> : null}</fieldset>
        {submission && view.feedback ? (() => { const item = view.feedback.items.find(item => item.questionVersionId === question.versionId)!; return <div className="mt-5 space-y-3 border-t border-[var(--line)] pt-5" role="region" aria-label="Answer explanation"><p className="font-bold">{item.selectedOptionId === null ? 'Skipped' : item.correct ? 'Correct' : 'Practice this idea'}</p><p className="text-sm"><strong>Correct answer:</strong> {question.options.find(option => option.id === item.correctOptionId)?.text}</p><p className="text-sm leading-6">{item.explanation}</p></div>; })() : null}
        <div className="mt-6 flex justify-between gap-3"><button className={quizSecondary} type="button" disabled={index === 0} onClick={() => move(index - 1)}>Previous question</button><button className={quizSecondary} type="button" disabled={index === 9} onClick={() => move(index + 1)}>Next question</button></div>
      </section>
      {!submission ? <section aria-label="Save and submit skills check" className="space-y-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5"><p role="status" aria-label="Answer save status" className="text-sm font-bold">{!ready ? 'Loading saved choices…' : pendingKind ? 'Request awaiting confirmation' : dirty ? 'Unsaved choices' : `Saved answers · Revision ${baseline.revision}`}</p><div className="flex flex-wrap gap-3"><button className={quizButton} type="button" disabled={!ready || busy || conflict || pendingKind === 'submit' || (!dirty && pendingKind !== 'save')} onClick={() => send('save')}>{busy && pendingKind === 'save' ? 'Saving answers…' : pendingKind === 'save' ? 'Retry save' : 'Save answers'}</button><button className={quizSecondary} type="button" disabled={!ready || busy || conflict || dirty || pendingKind === 'save'} onClick={() => pendingKind === 'submit' ? send('submit') : setReview(true)}>{pendingKind === 'submit' ? 'Retry submission' : 'Review and submit'}</button></div><p className="text-sm text-[var(--muted)]">Save your latest choices before reviewing. Submission is final and opens the explanations.</p>{review ? <div role="region" aria-label="Final submission review" className="space-y-4 border-t border-[var(--line)] pt-5"><h2 className="text-xl font-bold">Review your skills check</h2><p className="text-sm">{answered} answered · {10 - answered} skipped. Skipped items do not count as weaknesses. You cannot change choices after submitting.</p>{choices(answers)}<div className="flex flex-wrap gap-3"><button className={quizButton} type="button" disabled={disabled || dirty} onClick={() => send('submit')}>Confirm final submission</button><button className={quizSecondary} type="button" disabled={busy} onClick={() => setReview(false)}>Keep reviewing</button></div></div> : null}</section> : null}
    </>}
    <Link href="/dashboard" className="inline-flex min-h-11 items-center text-sm font-bold text-[var(--moss)] underline">Return to my learning plan</Link>
  </div></main>;
}
