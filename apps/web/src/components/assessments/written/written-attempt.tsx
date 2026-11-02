'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { WrittenResponseDraft, WrittenSubmissionReceipt } from '@leetcode-app/database';
import { SiteNavigation } from '@/components/site-navigation';
import type { WrittenLearnerResponse, WrittenSaveCommand, WrittenSaveResponse, WrittenSubmitCommand, WrittenSubmitResponse } from '@/lib/written-assessment-api-types';
import { indentEditorSelection, editorNewline } from '@/lib/editor-indentation';
import { quizDate } from '../quiz-ui';
import { integer, record, validLearnerReply, validResponseDraft, validSaveReceipt, validSubmission, validSubmitReceipt } from './written-contract';
import { useWrittenAccess, WrittenRequestError } from './use-written-access';
import { field, points, primary, secondary, WrittenAccess, WrittenRubric } from './written-ui';

type Pending = { kind: 'save'; command: WrittenSaveCommand } | { kind: 'submit'; command: WrittenSubmitCommand };
const validText = (value: unknown): value is string => typeof value === 'string' && value.length <= 100_000 && new TextEncoder().encode(value).length <= 100_000;
const storableText = (value: string) => !value.includes('\0') && !/(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF])/.test(value);
function validPending(value: unknown): value is Pending {
  return record(value) && Object.keys(value).length === 2 && record(value.command) && integer(value.command.expectedRevision) && typeof value.command.requestKey === 'string' && value.command.requestKey.length >= 1 && value.command.requestKey.length <= 128
    && (value.kind === 'save' ? Object.keys(value.command).length === 3 && validText(value.command.text) && storableText(value.command.text) : value.kind === 'submit' && Object.keys(value.command).length === 2 && value.command.expectedRevision >= 1);
}
export function WrittenAttempt({ actorId, classId, recipientId, policyVersionId }: { actorId: string; classId: string; recipientId: string; policyVersionId: string }) {
  const endpoint = `/api/learner/assignments/${recipientId}/written`, key = `method:written-response:${actorId}:${recipientId}:${policyVersionId}`;
  const [text, setText] = useState(''), [baseline, setBaseline] = useState<WrittenResponseDraft | null>(null), [recovery, setRecovery] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null), [confirmedSubmission, setConfirmedSubmission] = useState<WrittenSubmissionReceipt | null>(null);
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [conflict, setConflict] = useState(false), [reviewSignature, setReviewSignature] = useState(''), [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null), [message, setMessage] = useState<string | null>(null);
  const textNow = useRef(''), baseNow = useRef<WrittenResponseDraft | null>(null), recoveryNow = useRef<string | null>(null), pendingNow = useRef<Pending | null>(null);
  const cacheReady = useRef(false), inFlight = useRef(false), editor = useRef<HTMLTextAreaElement | null>(null), escapeTab = useRef(false), conflictNow = useRef(false), confirmedNow = useRef<WrittenSubmissionReceipt | null>(null);
  const access = useWrittenAccess<WrittenLearnerResponse>({ actorId, initialUrl: endpoint, validate: (value): value is WrittenLearnerResponse => validLearnerReply(value, actorId, recipientId, classId, policyVersionId) });
  const assignment = access.data?.assignment;
  function persist() {
    if (!cacheReady.current) return;
    try { sessionStorage.setItem(key, JSON.stringify({ version: 1, text: textNow.current, baseline: baseNow.current, recovery: recoveryNow.current, pending: pendingNow.current, confirmedSubmission: confirmedNow.current, comparisonRequired: conflictNow.current })); } catch { /* Server saves and current in-memory work remain available. */ }
  }
  function changeConflict(value: boolean) { conflictNow.current = value; setConflict(value); persist(); }
  function change(value: string) { textNow.current = value; setText(value); setReviewSignature(''); setReviewConfirmed(false); persist(); }
  function adopt(draft: WrittenResponseDraft, preserve = false) {
    if (preserve && baseNow.current) { recoveryNow.current = textNow.current; setRecovery(textNow.current); }
    textNow.current = draft.text; baseNow.current = draft; setText(draft.text); setBaseline(draft); changeConflict(false); setReviewSignature(''); setReviewConfirmed(false); persist();
  }
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = sessionStorage.getItem(key), saved: unknown = raw ? JSON.parse(raw) : null;
        if (record(saved) && saved.version === 1) {
          if (validText(saved.text) && validResponseDraft(saved.baseline)) { textNow.current = saved.text; baseNow.current = saved.baseline; setText(saved.text); setBaseline(saved.baseline); }
          if (validText(saved.recovery)) { recoveryNow.current = saved.recovery; setRecovery(saved.recovery); }
          if (validPending(saved.pending)) { pendingNow.current = saved.pending; setPending(saved.pending); setMessage('An earlier request needs confirmation. Retry it to recover the original receipt.'); }
          if (validSubmission(saved.confirmedSubmission)) confirmedNow.current = saved.confirmedSubmission;
          if (saved.comparisonRequired === true) { conflictNow.current = true; setConflict(true); }
        }
      } catch { /* Keep server state authoritative if browser data is invalid. */ }
      cacheReady.current = true; setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [key]);
  useEffect(() => {
    if (!assignment || !ready) return;
    const timer = window.setTimeout(() => {
      if (assignment.isExcused) { if (confirmedNow.current) setConfirmedSubmission(confirmedNow.current); return; }
      if (assignment.submission) {
        confirmedNow.current = assignment.submission; setConfirmedSubmission(assignment.submission); persist();
        if (!pendingNow.current) adopt(assignment.responseDraft, textNow.current !== assignment.responseDraft.text);
      } else if (confirmedNow.current) { confirmedNow.current = null; setConfirmedSubmission(null); persist(); }
      if (assignment.submission) return;
      if (!baseNow.current) adopt(assignment.responseDraft);
      else if (baseNow.current.revision !== assignment.responseDraft.revision) {
        if (pendingNow.current || conflictNow.current || textNow.current !== baseNow.current.text) changeConflict(true);
        else adopt(assignment.responseDraft);
      }
    }, 0);
    return () => window.clearTimeout(timer);
    // Response refs preserve unsaved alternatives while owner-bound views change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignment, ready]);
  const dirty = Boolean(baseline && text !== baseline.text), checkpointMatches = Boolean(assignment && baseline && assignment.responseDraft.revision === baseline.revision);
  const submission = confirmedSubmission ?? assignment?.submission;
  const editable = Boolean(assignment && ready && checkpointMatches && !assignment.isExcused && assignment.isOpen && !assignment.isClosed && !submission && !conflict && !pending && !busy);
  const currentReview = JSON.stringify({ revision: baseline?.revision, text });
  async function send(next: Pending) {
    if (!ready || (!access.verifiedNow.current && !pendingNow.current) || access.stopped || inFlight.current) return;
    const request = pendingNow.current ?? next; pendingNow.current = request; setPending(request); persist(); inFlight.current = true; setBusy(true); setError(null); setMessage(null);
    try {
      if (request.kind === 'save') {
        const accepted = await access.command(endpoint, request.command, (value): value is WrittenSaveResponse => validSaveReceipt(value, actorId, recipientId), true);
        if (!accepted) return;
        if (accepted.responseDraft.revision !== request.command.expectedRevision + 1 || accepted.responseDraft.text !== request.command.text) throw new Error('The saved response could not be confirmed. Retry the original request.');
        pendingNow.current = null; setPending(null); baseNow.current = accepted.responseDraft; setBaseline(accepted.responseDraft); persist();
        if (accepted.currentRevision > accepted.responseDraft.revision) { changeConflict(true); setMessage('Your earlier save is confirmed, but newer saved work exists. Compare it with your preserved response.'); }
        else setMessage('Response saved. You can resume from another device.');
        await access.read();
      } else {
        const accepted = await access.command(`${endpoint}/submissions`, request.command, (value): value is WrittenSubmitResponse => validSubmitReceipt(value, actorId, recipientId), true);
        if (!accepted) return;
        if (accepted.submission.responseRevision !== request.command.expectedRevision) throw new Error('The submitted revision could not be confirmed. Retry the original request.');
        pendingNow.current = null; setPending(null); confirmedNow.current = accepted.submission; setConfirmedSubmission(accepted.submission); setReviewSignature(''); setReviewConfirmed(false); persist(); setMessage('Written work submitted. Your instructor reviews it and releases the grade.'); await access.read();
      }
    } catch (cause) {
      if (cause instanceof WrittenRequestError && [400, 409, 413].includes(cause.status) && cause.code !== 'owner_changed') { pendingNow.current = null; setPending(null); persist(); if (cause.status === 409) changeConflict(true); }
      setError(cause instanceof Error ? cause.message : 'Request not confirmed. Your response is preserved.');
    } finally { inFlight.current = false; setBusy(false); }
  }
  function save() {
    if (!editable || !validText(textNow.current) || !storableText(textNow.current) || !baseNow.current || !assignment || baseNow.current.revision !== assignment.responseDraft.revision) return;
    void send({ kind: 'save', command: { expectedRevision: baseNow.current.revision, text: textNow.current, requestKey: crypto.randomUUID() } });
  }
  function submit() {
    if (!editable || dirty || !textNow.current.trim() || !baseline || !reviewConfirmed || reviewSignature !== currentReview || !assignment || baseNow.current?.revision !== assignment.responseDraft.revision) return;
    void send({ kind: 'submit', command: { expectedRevision: baseline.revision, requestKey: crypto.randomUUID() } });
  }
  return <main className="min-h-screen px-5 py-6 sm:px-8"><div className="mx-auto max-w-5xl space-y-6"><SiteNavigation currentPath="/classes" /><Link className={secondary} href="/classes">← My classes and tasks</Link><header><p className="text-xs font-bold uppercase tracking-wider text-[var(--coral)]">Written assignment</p><h1 className="mt-3 break-words text-3xl font-bold sm:text-4xl">{assignment?.title ?? 'Written work and pseudocode'}</h1><p className="mt-3 text-sm leading-6 text-[var(--muted)]">Save your response, review the exact saved revision, then submit once. Your instructor reviews the rubric and explicitly releases your grade.</p></header>
    {error ? <p role="alert" aria-label="Written response error" className="rounded-lg border border-[var(--coral)] bg-[var(--coral-soft)] p-4 text-sm">{error}</p> : null}
    {!access.stopped && message ? <p role="status" aria-label="Written response status" className="rounded-lg border border-[var(--moss)] bg-[var(--moss-soft)] p-4 text-sm">{message}</p> : null}
    {!assignment ? <WrittenAccess loading={access.loading} stopped={access.stopped} error={access.error} busy={busy} retry={() => { void access.read(); }} /> : <><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-bold">{points(assignment.maxUnits)} points · One final submission</p><button className={secondary} type="button" disabled={busy || access.loading} onClick={() => { void access.read(); }}>Refresh saved response</button></div><dl className="grid gap-3 text-sm sm:grid-cols-3">{[['Opens', assignment.availableAt], ['Due', assignment.dueAt], ['Closes', assignment.closesAt]].map(([label, value]) => <div key={label}><dt className="font-bold">{label}</dt><dd className="mt-1 text-[var(--muted)]">{quizDate(value)}</dd></div>)}</dl>{assignment.instructions ? <p className="whitespace-pre-wrap break-words text-sm leading-6">{assignment.instructions}</p> : null}
      {assignment.isExcused ? <section aria-label="Written assignment excused" className="rounded-xl border border-[var(--line)] p-5"><h2 className="text-xl font-bold">Assignment excused</h2><p className="mt-2 text-sm">New saves and submissions are paused. An accepted earlier request can still recover its original receipt. Your browser work remains private in this tab.</p></section> : !assignment.isOpen ? <p role="status" className="rounded-xl border border-[var(--line)] p-5 text-sm">The prompt, rubric and response editor will be available when this assignment opens.</p> : <><section className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5" aria-label="Frozen assignment prompt"><h2 className="text-xl font-bold">Assignment prompt</h2><p className="whitespace-pre-wrap break-words text-sm leading-6">{assignment.prompt}</p></section><WrittenRubric criteria={assignment.criteria} maxUnits={assignment.maxUnits} />
        {assignment.isClosed && !submission ? <p role="status" className="rounded-lg border border-[var(--line)] p-4 text-sm">This assignment is closed. Saved work remains available; new saves and submissions are disabled.</p> : null}
        {conflict && !submission ? <section aria-label="Written response comparison" className="space-y-3 rounded-xl border border-[var(--coral)] p-5"><h2 className="text-lg font-bold">Compare saved responses</h2><p className="text-sm">The server has revision {assignment.responseDraft.revision}. Your browser response is preserved. Confirm any earlier request first.</p><pre className="max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[var(--surface)] p-3 text-sm">{assignment.responseDraft.text || 'Empty saved response'}</pre><button className={secondary} type="button" disabled={busy || Boolean(pending)} onClick={() => { adopt(assignment.responseDraft, true); setMessage('Loaded the saved response. Your earlier browser work remains in recovery.'); }}>Load saved response and keep browser copy</button></section> : null}
        {recovery !== null ? <details className="space-y-3 rounded-xl border border-[var(--line)] p-5"><summary className="min-h-11 cursor-pointer py-2 font-bold">Preserved browser response</summary><pre className="max-h-52 overflow-auto whitespace-pre-wrap break-words text-sm">{recovery || 'Empty browser response'}</pre>{!submission ? <button className={secondary} type="button" disabled={!editable} onClick={() => { change(recovery); recoveryNow.current = null; setRecovery(null); persist(); }}>Restore browser response</button> : <p className="text-sm text-[var(--muted)]">This browser copy is read-only. Select and copy it if needed; the submitted response stays unchanged.</p>}</details> : null}
        <section aria-label="Written response editor" className="space-y-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5"><h2 className="text-xl font-bold">{submission ? 'Submitted response' : 'Your response'}</h2>{submission ? <pre className="max-h-[40rem] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-[var(--line)] p-4 text-sm leading-6">{assignment.submission ? assignment.responseDraft.text : 'The submitted receipt is confirmed. Refresh this assignment to load the exact frozen response.'}</pre> : <><div className="grid gap-2 text-sm"><label className="font-bold" htmlFor="written-response">Pseudocode or written response</label><textarea id="written-response" ref={editor} aria-describedby="written-editor-help" className={`${field} min-h-72 py-3 font-mono text-sm leading-6`} maxLength={100_000} value={text} readOnly={!editable} onChange={event => change(event.target.value)} onKeyDown={event => {
          if (!editable) return;
          if (event.key === 'Escape') { escapeTab.current = true; return; }
          if (event.key === 'Tab' && escapeTab.current) { escapeTab.current = false; return; }
          escapeTab.current = false;
          if (event.key !== 'Tab' && event.key !== 'Enter' || event.ctrlKey || event.metaKey || event.altKey) return;
          const node = event.currentTarget, selection = { source: node.value, start: node.selectionStart, end: node.selectionEnd };
          const next = event.key === 'Tab' ? indentEditorSelection(selection, 4, event.shiftKey) : editorNewline(selection, 4, 'python');
          event.preventDefault();
          if (!validText(next.source)) { setError('Responses can contain up to 100,000 UTF-8 bytes. Shorten this response before adding indentation.'); return; }
          change(next.source); requestAnimationFrame(() => { editor.current?.setSelectionRange(next.start, next.end); });
        }} /></div><p id="written-editor-help" className="text-sm text-[var(--muted)]">Tab indents four spaces; Shift+Tab removes indentation. Enter preserves indentation. Press Escape, then Tab to leave the editor. Limit: 100,000 UTF-8 bytes.</p><p role="status" aria-label="Written response save status" className="text-sm font-bold">{pending ? 'Request awaiting confirmation' : dirty ? 'Unsaved response' : `Saved response · Revision ${baseline?.revision ?? 0}`}</p>{!validText(text) || !storableText(text) ? <p role="alert" className="text-sm">Use valid Unicode without NUL characters, up to 100,000 UTF-8 bytes. Repair this response before saving.</p> : null}<div className="flex flex-wrap gap-3"><button className={primary} type="button" disabled={!editable || !dirty || !validText(text) || !storableText(text)} onClick={save}>Save written response</button><button className={secondary} type="button" disabled={!editable || dirty || !text.trim() || !baseline?.revision} onClick={() => { setReviewSignature(currentReview); setReviewConfirmed(false); }}>Review final submission</button></div></>}
        </section>
        {!submission && reviewSignature === currentReview && baseline && !dirty ? <section aria-label="Final written submission review" className="space-y-4 rounded-xl border border-[var(--moss)] bg-[var(--moss-soft)] p-5"><h2 className="text-xl font-bold">Review saved revision {baseline.revision}</h2><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[var(--surface)] p-4 text-sm">{text}</pre><p className="text-sm">Submission is final for this assignment. Your instructor reviews your response against the published rubric. Navigation or practice feedback does not award points.</p><label className="flex min-h-11 items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={reviewConfirmed} disabled={!editable} onChange={event => setReviewConfirmed(event.target.checked)} /><span>I reviewed this saved response and am ready to submit.</span></label><button className={primary} type="button" disabled={!editable || !reviewConfirmed} onClick={submit}>Submit written response</button></section> : null}
      </>}
    </>}
    {assignment?.releasedGrade && !submission ? <section aria-label="Released written grade" className="space-y-3 rounded-xl border border-[var(--moss)] bg-[var(--moss-soft)] p-5"><h2 className="text-xl font-bold">Grade released</h2><p className="text-lg font-bold">Published score: {points(assignment.releasedGrade.earnedUnits)} / {points(assignment.maxUnits)}</p><p className="whitespace-pre-wrap break-words text-sm">{assignment.releasedGrade.learnerFeedback || 'No written feedback was included.'}</p><Link className={secondary} href={`/classes/${classId}/grades`}>View class grades and review options</Link></section> : null}
    {pending && !access.stopped ? <section aria-label="Pending written response request" className="space-y-3 rounded-xl border border-[var(--line)] p-5"><h2 className="text-lg font-bold">Confirm the earlier request</h2><p className="text-sm">Retry the same {pending.kind} for saved revision {pending.command.expectedRevision}. This recovers an accepted receipt after closing or excusal; new work still needs current eligibility.</p><button className={primary} type="button" disabled={busy || access.loading} onClick={() => { void send(pending); }}>Retry earlier response request</button></section> : null}
    {submission && assignment && !access.stopped ? <section aria-label="Written submission receipt" className="space-y-3 rounded-xl border border-[var(--moss)] bg-[var(--moss-soft)] p-5"><h2 className="text-xl font-bold">Written work submitted</h2><p className="text-sm">Saved response revision {submission.responseRevision} · {quizDate(submission.submittedAt)}{submission.isLate ? ' · Late' : ''}</p><p className="break-all font-mono text-xs">{submission.attemptId}</p>{assignment?.releasedGrade ? <div className="space-y-3"><p className="text-lg font-bold">Published score: {points(assignment.releasedGrade.earnedUnits)} / {points(assignment.maxUnits)}</p><dl className="space-y-2 text-sm">{assignment.criteria.map(criterion => <div className="flex flex-wrap justify-between gap-3" key={criterion.id}><dt>{criterion.label}</dt><dd>{assignment.releasedGrade!.criterionScores[criterion.id] === undefined ? 'Not individually scored' : `${points(assignment.releasedGrade!.criterionScores[criterion.id])} / ${points(criterion.maxUnits)}`}</dd></div>)}</dl><p className="whitespace-pre-wrap break-words text-sm">{assignment.releasedGrade.learnerFeedback || 'No written feedback was included.'}</p></div> : <p className="text-sm">Your grade appears after your instructor releases it. No score is inferred from submission or navigation.</p>}<Link className={secondary} href={`/classes/${classId}/grades`}>View class grades</Link></section> : null}
  </div></main>;
}
