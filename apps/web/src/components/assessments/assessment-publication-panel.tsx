'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { StoredAssessmentDraft, StoredQuizPublication } from '@leetcode-app/database';
import { quizButton, quizDate, quizPoints, quizSecondary } from './quiz-ui';

type Preview = { draft: StoredAssessmentDraft; learners: { id: string; displayName: string }[]; rosterFingerprint: string; publication: StoredQuizPublication | null };
type PublicationRequest = { expectedRevision: number; audience: { kind: 'class' | 'selected'; learnerIds: string[] }; expectedRosterFingerprint: string; requestKey: string };

function pendingPublication(value: unknown): value is PublicationRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<PublicationRequest>;
  const audience = candidate.audience;
  return Object.keys(candidate).every(key => ['expectedRevision', 'audience', 'expectedRosterFingerprint', 'requestKey'].includes(key))
    && Number.isSafeInteger(candidate.expectedRevision) && Number(candidate.expectedRevision) >= 1
    && typeof candidate.requestKey === 'string' && Boolean(candidate.requestKey.trim()) && candidate.requestKey.length <= 128
    && typeof candidate.expectedRosterFingerprint === 'string' && /^[0-9a-f]{64}$/.test(candidate.expectedRosterFingerprint)
    && Boolean(audience && typeof audience === 'object' && !Array.isArray(audience)
      && Object.keys(audience).every(key => ['kind', 'learnerIds'].includes(key))
      && ['class', 'selected'].includes(audience.kind) && Array.isArray(audience.learnerIds)
      && audience.learnerIds.length >= 1 && audience.learnerIds.length <= 2000
      && audience.learnerIds.every(id => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
      && new Set(audience.learnerIds.map(id => id.toLowerCase())).size === audience.learnerIds.length);
}

export function AssessmentPublicationPanel({ draft, authorId, workspace, blocked }: {
  draft: StoredAssessmentDraft; authorId: string; workspace: 'admin' | 'teach'; blocked: boolean;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [publication, setPublication] = useState<StoredQuizPublication | null>(null);
  const [kind, setKind] = useState<'class' | 'selected'>('class');
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [ownerChanged, setOwnerChanged] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [hasPending, setHasPending] = useState(false);
  const pending = useRef<PublicationRequest | null>(null);
  const inFlight = useRef(false);
  const key = `method:quiz-publication:${authorId}:${draft.classId}:${draft.id}`;
  const endpoint = `/api/assessments/drafts/${draft.id}/publications?workspace=${workspace}`;
  const audienceIds = kind === 'class' ? preview?.learners.map(learner => learner.id) ?? [] : selected;
  const latestDraftHref = workspace === 'admin' ? `/admin/classes/${draft.classId}/assessments/${draft.id}` : `/teach/${draft.classId}/assessments/${draft.id}`;

  async function load() {
    setBusy(true); setError(false);
    try {
      const response = await fetch(endpoint, { cache: 'no-store', headers: { 'x-assessment-author': authorId } });
      const body = await response.json() as Preview & { error?: string; code?: string };
      if (body.code === 'owner_changed') { setOwnerChanged(true); throw new Error('Your account changed. Reopen the class workspace in the intended account.'); }
      if (!response.ok || body.draft?.id !== draft.id || !Array.isArray(body.learners) || typeof body.rosterFingerprint !== 'string') throw new Error(body.error ?? 'Could not load the class audience.');
      setPreview(body); setPublication(body.publication); setConflict(!body.publication && (body.draft.revision !== draft.revision || Boolean(pending.current && pending.current.expectedRevision !== draft.revision)));
      if (body.publication) {
        pending.current = null; setHasPending(false);
        try { window.sessionStorage.removeItem(key); } catch { /* The authoritative publication has been recovered. */ }
        setMessage(`Assignment confirmed: revision ${body.publication.draftRevision}, ${body.publication.recipientCount} ${body.publication.recipientCount === 1 ? 'learner' : 'learners'}. The published version is frozen.`);
      }
      if (!body.publication && body.draft.revision !== draft.revision) setMessage('The saved draft has changed. Reopen the latest revision before assigning.');
    } catch (cause) { setError(true); setMessage(cause instanceof Error ? cause.message : 'Could not load the class audience.'); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      let recoverPending = false;
      try {
        const raw = window.sessionStorage.getItem(key);
        const saved = raw ? JSON.parse(raw) as { pending?: PublicationRequest } : null;
        if (pendingPublication(saved?.pending)) {
          pending.current = saved.pending; setHasPending(true); setKind(saved.pending.audience.kind); setSelected(saved.pending.audience.learnerIds); setConfirmed(true);
          recoverPending = true;
          setMessage('An earlier assignment request needs confirmation. Retry it to recover the publication receipt.');
        } else if (raw) {
          window.sessionStorage.removeItem(key);
          setMessage('Load the class audience to confirm the saved assignment state.');
        }
      } catch { /* A server publication remains authoritative without browser storage. */ }
      setReady(true);
      if (recoverPending) void load();
    }, 0);
    return () => window.clearTimeout(timer);
    // The parent keys this panel by author, draft and saved revision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, draft.revision]);

  async function publish() {
    if (inFlight.current || blocked || ownerChanged || conflict || publication || !preview || !confirmed || !audienceIds.length || audienceIds.length > 2000) return;
    inFlight.current = true; setBusy(true); setError(false); setMessage(null);
    if (!pending.current) pending.current = { expectedRevision: draft.revision, audience: { kind, learnerIds: [...audienceIds].sort() }, expectedRosterFingerprint: preview.rosterFingerprint, requestKey: crypto.randomUUID() };
    setHasPending(true);
    try {
      try { window.sessionStorage.setItem(key, JSON.stringify({ pending: pending.current })); } catch { /* Keep the same request in memory for safe retry. */ }
      const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', 'x-assessment-author': authorId }, body: JSON.stringify(pending.current), signal: AbortSignal.timeout(15_000) });
      const body = await response.json().catch(() => null) as { publication?: StoredQuizPublication; error?: string; code?: string } | null;
      if (!response.ok || !body?.publication) {
        if (body?.code === 'owner_changed') setOwnerChanged(true);
        if ([400, 409, 413].includes(response.status) && body?.code !== 'owner_changed') {
          pending.current = null; setHasPending(false); setConfirmed(false);
          try { window.sessionStorage.removeItem(key); } catch { /* Server state still decides publication. */ }
          if (response.status === 409) setConflict(true);
        }
        throw new Error(body?.error ?? 'Could not confirm assignment. Retry safely with the same request.');
      }
      const accepted = body.publication;
      if (accepted.draftId !== draft.id || accepted.classId !== draft.classId || accepted.draftRevision !== pending.current!.expectedRevision
        || accepted.recipientCount !== pending.current!.audience.learnerIds.length || accepted.audienceKind !== pending.current!.audience.kind
        || typeof accepted.id !== 'string' || typeof accepted.assignmentId !== 'string' || typeof accepted.policyVersionId !== 'string'
        || !Number.isFinite(Date.parse(accepted.publishedAt))) throw new Error('Could not confirm the publication receipt. Retry the request.');
      setPublication(body.publication); pending.current = null; setHasPending(false);
      try { window.sessionStorage.removeItem(key); } catch { /* Publication is now persisted on the server. */ }
      setMessage(`Quiz assigned to ${body.publication.recipientCount} ${body.publication.recipientCount === 1 ? 'learner' : 'learners'}. The published version is frozen.`);
    } catch (cause) { setError(true); setMessage(cause instanceof Error ? cause.message : 'Unable to assign the quiz.'); }
    finally { inFlight.current = false; setBusy(false); }
  }

  return <section aria-labelledby="quiz-publication-heading" className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6">
    <h2 id="quiz-publication-heading" className="text-xl font-bold">Assign this quiz</h2>
    <p className="mt-2 text-sm text-[var(--muted)]">Assign a saved version to this class. Each learner gets one final submission, and scores stay private until the owning instructor releases them.</p>
    {message ? <p role={error ? 'alert' : 'status'} aria-label={error ? 'Quiz publication error' : 'Quiz publication status'} className={`mt-4 rounded-lg border p-4 text-sm ${error ? 'border-[var(--coral)] bg-[var(--coral-soft)]' : 'border-[var(--moss)] bg-[var(--moss-soft)]'}`}>{message}</p> : null}
    {publication ? <div className="mt-4 rounded-lg bg-[var(--moss-soft)] p-4"><h3 className="font-bold">Assigned to {publication.recipientCount} {publication.recipientCount === 1 ? 'learner' : 'learners'}</h3><p className="mb-0 mt-2 text-sm">Published revision {publication.draftRevision} · {quizDate(publication.publishedAt)}. Editing this draft will not change the assigned quiz or its scores.</p></div> : <>
      {blocked ? <p className="mt-4 text-sm font-bold">Save your current changes and resolve any draft conflict before assigning.</p> : null}
      {conflict ? <div className="mt-4 space-y-3"><p className="text-sm">The draft or class roster changed. Review the latest saved version and audience before assigning.</p><Link className="inline-flex min-h-11 items-center text-sm font-bold text-[var(--moss)] underline" href={latestDraftHref} target="_blank" rel="noopener noreferrer">Open latest saved draft for comparison</Link><button className={quizSecondary} type="button" disabled={busy || ownerChanged} onClick={() => { setConfirmed(false); void load(); }}>Refresh audience and saved revision</button></div> : null}
      {!preview && !busy ? <button className={`${quizSecondary} mt-4`} type="button" disabled={ownerChanged} onClick={load}>Load class audience</button> : null}
      <fieldset disabled={blocked || !ready || busy || hasPending || ownerChanged || conflict || !preview} className="mt-5 space-y-4">
        <legend className="mb-2 text-sm font-bold">Choose recipients</legend>
        <label className="flex min-h-11 items-center gap-3 text-sm"><input type="radio" name={`audience-${draft.id}`} checked={kind === 'class'} onChange={() => { setKind('class'); setConfirmed(false); }} />All current learners ({preview?.learners.length ?? '…'})</label>
        <label className="flex min-h-11 items-center gap-3 text-sm"><input type="radio" name={`audience-${draft.id}`} checked={kind === 'selected'} onChange={() => { setKind('selected'); setConfirmed(false); }} />Selected learners</label>
        {kind === 'selected' ? <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-[var(--line)] p-3" aria-label="Select quiz recipients">{preview?.learners.map(learner => <label className="flex min-h-11 items-center gap-3 text-sm" key={learner.id}><input type="checkbox" checked={selected.includes(learner.id)} onChange={event => { setSelected(current => event.target.checked ? [...current, learner.id] : current.filter(id => id !== learner.id)); setConfirmed(false); }} />{learner.displayName}</label>)}</div> : null}
        <p role="status" aria-label="Quiz audience count" className="text-sm font-bold">{audienceIds.length} {audienceIds.length === 1 ? 'learner selected' : 'learners selected'}</p>
        {audienceIds.length > 2000 ? <p className="text-sm">Choose a selected group of up to 2,000 learners for this quiz.</p> : null}
        <div className="rounded-lg border border-[var(--line)] p-4 text-sm"><p className="font-bold">Publication summary</p><dl className="mt-3 grid gap-3 sm:grid-cols-2"><div><dt className="font-bold">Saved version</dt><dd>Revision {draft.revision} · {draft.questions.length} questions · {quizPoints(draft.maxUnits)} points</dd></div><div><dt className="font-bold">Opens</dt><dd>{quizDate(draft.availableAt)}</dd></div><div><dt className="font-bold">Due</dt><dd>{quizDate(draft.dueAt)}</dd></div><div><dt className="font-bold">Closes</dt><dd>{quizDate(draft.closesAt)}</dd></div></dl><p className="mb-0 mt-4">The selected audience and question versions are frozen. Learners joining later are not automatically added. Correct answers and explanations stay private.</p></div>
        <label className="flex min-h-11 items-start gap-3 text-sm leading-6"><input className="mt-1" type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I confirm this saved version, recipient count, dates, one submission, and instructor grade release.</label>
      </fieldset>
      <button className={`${quizButton} mt-5`} type="button" disabled={blocked || !ready || busy || ownerChanged || conflict || !preview || !confirmed || !audienceIds.length || audienceIds.length > 2000} onClick={publish}>{busy && hasPending ? 'Assigning quiz…' : hasPending ? 'Retry assignment' : 'Assign quiz'}</button>
    </>}
  </section>;
}
