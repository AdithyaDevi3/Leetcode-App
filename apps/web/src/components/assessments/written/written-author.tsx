'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { WrittenAssessmentDraft } from '@leetcode-app/database';
import { AdminPageHeader } from '@/components/admin/admin-ui';
import type { WrittenDetailResponse, WrittenDraftCommand, WrittenDraftResponse, WrittenListResponse, WrittenPublishCommand, WrittenPublishResponse, WrittenWorkspace } from '@/lib/written-assessment-api-types';
import { integer, record, uuid, validDetail, validDraft, validDraftReceipt, validList, validPublishReceipt } from './written-contract';
import { formInput, signature, validForm, writtenForm, type WrittenForm } from './written-form';
import { WrittenContentEditor } from './written-content-editor';
import { useWrittenAccess, WrittenRequestError } from './use-written-access';
import { authorPath, field, points, primary, secondary, WrittenAccess, WrittenFrame, WrittenRubric } from './written-ui';

type Base = { revision: number | null; signature: string };
type Pending = { kind: 'save'; command: WrittenDraftCommand; formSignature: string } | { kind: 'publish'; command: WrittenPublishCommand };
const requestKey = (value: unknown) => typeof value === 'string' && value.length >= 1 && value.length <= 128;
function validPending(value: unknown, classId: string, draftId?: string): value is Pending {
  if (!record(value) || !record(value.command) || !requestKey(value.command.requestKey)) return false;
  const command = value.command;
  if (value.kind === 'save') {
    if (Object.keys(value).length !== 3 || Object.keys(command).length !== 4 || typeof value.formSignature !== 'string' || value.formSignature.length > 200_000 || !record(command.draft)
      || (draftId ? command.draftId !== draftId || !integer(command.expectedRevision, 1) : command.draftId !== null || command.expectedRevision !== null)) return false;
    return validDraft({ ...command.draft, id: draftId ?? '55555555-5555-4555-8555-555555555555', createdBy: null, revision: command.expectedRevision ?? 1, status: 'draft', maxUnits: Array.isArray(command.draft.criteria) ? command.draft.criteria.reduce((sum: number, item: unknown) => sum + (record(item) && integer(item.maxUnits, 1) ? item.maxUnits : 0), 0) : 0, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }, classId);
  }
  return value.kind === 'publish' && Boolean(draftId) && Object.keys(value).length === 2 && Object.keys(command).length === 4 && integer(command.expectedRevision, 1)
    && typeof command.expectedRosterFingerprint === 'string' && /^[a-f0-9]{64}$/.test(command.expectedRosterFingerprint) && record(command.audience)
    && Object.keys(command.audience).length === 2 && ['class', 'selected'].includes(String(command.audience.kind)) && Array.isArray(command.audience.learnerIds)
    && command.audience.learnerIds.length >= 1 && command.audience.learnerIds.length <= 5000 && command.audience.learnerIds.every(uuid) && new Set(command.audience.learnerIds).size === command.audience.learnerIds.length;
}
export function WrittenAuthor({ actorId, workspace, classId, draftId }: { actorId: string; workspace: WrittenWorkspace; classId: string; draftId?: string }) {
  const endpoint = `/api/assessments/written?workspace=${workspace}`;
  const previewEndpoint = draftId ? `/api/assessments/written/${draftId}?workspace=${workspace}&classId=${classId}` : `${endpoint}&classId=${classId}`;
  const key = `method:written-author:${actorId}:${workspace}:${classId}:${draftId ?? 'new'}`;
  const [form, setForm] = useState<WrittenForm | null>(null), [base, setBase] = useState<Base | null>(null), [recovery, setRecovery] = useState<WrittenForm | null>(null);
  const [pending, setPending] = useState<Pending | null>(null), [confirmed, setConfirmed] = useState<WrittenDraftResponse | null>(null);
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null), [message, setMessage] = useState<string | null>(null);
  const [audienceKind, setAudienceKind] = useState<'class' | 'selected'>('class'), [selected, setSelected] = useState<string[]>([]), [audienceAcknowledgement, setAudienceAcknowledgement] = useState('');
  const formNow = useRef<WrittenForm | null>(null), baseNow = useRef<Base | null>(null), recoveryNow = useRef<WrittenForm | null>(null), pendingNow = useRef<Pending | null>(null), confirmedNow = useRef<WrittenDraftResponse | null>(null);
  const cacheReady = useRef(false), inFlight = useRef(false);
  const access = useWrittenAccess<WrittenListResponse | WrittenDetailResponse>({ actorId, initialUrl: previewEndpoint,
    validate: (value): value is WrittenListResponse | WrittenDetailResponse => draftId ? validDetail(value, actorId, classId, draftId) : validList(value, actorId, classId) });
  const data = access.data, author = data && 'author' in data ? data.author : null;
  function persist() {
    if (!cacheReady.current) return;
    try { sessionStorage.setItem(key, JSON.stringify({ version: 1, form: formNow.current, base: baseNow.current, recovery: recoveryNow.current, pending: pendingNow.current, confirmed: confirmedNow.current })); } catch { /* In-memory recovery and explicit server saves remain available. */ }
  }
  function change(value: WrittenForm) { formNow.current = value; setForm(value); persist(); setAudienceAcknowledgement(''); }
  function adopt(draft: WrittenAssessmentDraft, preserve = false) {
    if (preserve && formNow.current) { recoveryNow.current = formNow.current; setRecovery(formNow.current); }
    const next = writtenForm(draft), checkpoint = { revision: draft.revision, signature: signature(next) };
    formNow.current = next; baseNow.current = checkpoint; setForm(next); setBase(checkpoint); setConflict(false); setAudienceAcknowledgement(''); persist();
  }
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = sessionStorage.getItem(key), saved: unknown = raw ? JSON.parse(raw) : null;
        if (record(saved) && saved.version === 1) {
          if (validForm(saved.form) && record(saved.base) && Object.keys(saved.base).length === 2 && (saved.base.revision === null || integer(saved.base.revision, 1)) && typeof saved.base.signature === 'string' && saved.base.signature.length <= 200_000) { formNow.current = saved.form; baseNow.current = saved.base as Base; setForm(saved.form); setBase(saved.base as Base); }
          if (validForm(saved.recovery)) { recoveryNow.current = saved.recovery; setRecovery(saved.recovery); }
          if (validPending(saved.pending, classId, draftId)) { pendingNow.current = saved.pending; setPending(saved.pending); setMessage('An earlier request needs confirmation. Retry it before starting different work.'); }
          if (!draftId && validDraftReceipt(saved.confirmed, actorId, classId)) { confirmedNow.current = saved.confirmed; setConfirmed(saved.confirmed); }
        }
      } catch { /* Invalid browser data never substitutes for verified server content. */ }
      if (!draftId && !formNow.current) { const next = writtenForm(), checkpoint = { revision: null, signature: signature(next) }; formNow.current = next; baseNow.current = checkpoint; setForm(next); setBase(checkpoint); }
      cacheReady.current = true; setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [key, actorId, classId, draftId]);
  useEffect(() => {
    if (!author || !ready) return;
    const timer = window.setTimeout(() => {
      if (!baseNow.current || !formNow.current) adopt(author.draft);
      else if (baseNow.current.revision !== author.draft.revision) {
        if (pendingNow.current || signature(formNow.current) !== baseNow.current.signature) setConflict(true);
        else adopt(author.draft);
      }
    }, 0);
    return () => window.clearTimeout(timer);
    // Browser refs retain unsaved work while a fresh server preview arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [author, ready]);
  const parsed = useMemo(() => { try { return { input: form ? formInput(classId, form) : null, error: null }; } catch (cause) { return { input: null, error: cause instanceof Error ? cause.message : 'Check the assignment fields.' }; } }, [form, classId]);
  const dirty = Boolean(form && base && signature(form) !== base.signature), checkpointMatches = Boolean(data && base && (!draftId || author?.draft.revision === base.revision));
  const recipients = author ? audienceKind === 'class' ? author.learners.map(person => person.id) : selected : [];
  const audienceValid = Boolean(author && recipients.length && recipients.every(id => author.learners.some(person => person.id === id)));
  const audienceSignature = JSON.stringify({ revision: author?.draft.revision, fingerprint: author?.rosterFingerprint, kind: audienceKind, ids: [...recipients].sort() });
  async function send(next: Pending) {
    if (!ready || (!access.verifiedNow.current && !pendingNow.current) || access.stopped || inFlight.current) return;
    const request = pendingNow.current ?? next;
    pendingNow.current = request; setPending(request); persist(); inFlight.current = true; setBusy(true); setError(null); setMessage(null);
    try {
      if (request.kind === 'save') {
        const accepted = await access.command(endpoint, request.command, (value): value is WrittenDraftResponse => validDraftReceipt(value, actorId, classId, draftId), true);
        if (!accepted) return;
        if (accepted.draft.revision !== (request.command.expectedRevision ?? 0) + 1) throw new Error('The saved revision could not be confirmed. Retry the original request.');
        pendingNow.current = null; setPending(null);
        if (!draftId) { confirmedNow.current = accepted; setConfirmed(accepted); persist(); setMessage('Private draft created. Open it to review the audience before assigning.'); }
        else if (accepted.currentRevision > accepted.draft.revision) { setConflict(true); persist(); setMessage('Your earlier save is confirmed, but the server has newer content. Compare it with preserved browser work.'); await access.read(); }
        else if (formNow.current && signature(formNow.current) !== request.formSignature) {
          const checkpoint = { revision: accepted.draft.revision, signature: signature(writtenForm(accepted.draft)) }; baseNow.current = checkpoint; setBase(checkpoint); persist(); setMessage('Earlier content saved. Your latest browser edits are still unsaved.'); await access.read();
        } else { adopt(accepted.draft); setMessage('Private draft saved. Review the exact audience before assigning.'); await access.read(); }
      } else {
        const accepted = await access.command(`/api/assessments/written/${draftId}/publications?workspace=${workspace}`, request.command,
          (value): value is WrittenPublishResponse => validPublishReceipt(value, actorId, classId, draftId!), true);
        if (!accepted) return;
        if (accepted.publication.draftRevision !== request.command.expectedRevision || accepted.publication.recipientCount !== request.command.audience.learnerIds.length || accepted.publication.audienceKind !== request.command.audience.kind) throw new Error('The assigned audience receipt could not be confirmed. Retry the original request.');
        pendingNow.current = null; setPending(null); persist(); setAudienceAcknowledgement(''); setMessage(`Assignment published to ${accepted.publication.recipientCount} learners. Its prompt, rubric and audience are frozen.`); await access.read();
      }
    } catch (cause) {
      if (cause instanceof WrittenRequestError && [400, 409, 413].includes(cause.status) && cause.code !== 'owner_changed') { pendingNow.current = null; setPending(null); persist(); if (cause.status === 409) setConflict(true); }
      setError(cause instanceof Error ? cause.message : 'Request not confirmed. Retry its original receipt.');
    } finally { inFlight.current = false; setBusy(false); }
  }
  function save() {
    if (!data || !parsed.input || !formNow.current || !checkpointMatches || conflict || pendingNow.current || confirmedNow.current || author && baseNow.current?.revision !== author.draft.revision) return;
    void send({ kind: 'save', command: { draftId: draftId ?? null, expectedRevision: draftId ? author!.draft.revision : null, requestKey: crypto.randomUUID(), draft: parsed.input }, formSignature: signature(formNow.current) });
  }
  function publish() {
    if (!author || !draftId || !checkpointMatches || dirty || conflict || pendingNow.current || author.publication || !audienceValid || audienceAcknowledgement !== audienceSignature || baseNow.current?.revision !== author.draft.revision) return;
    void send({ kind: 'publish', command: { expectedRevision: author.draft.revision, expectedRosterFingerprint: author.rosterFingerprint, audience: { kind: audienceKind, learnerIds: [...recipients] }, requestKey: crypto.randomUUID() } });
  }
  return <WrittenFrame workspace={workspace}><Link className={secondary} href={authorPath(workspace, classId)}>← Written assignment drafts</Link><AdminPageHeader eyebrow="Private rubric authoring" title={data ? author?.draft.title ?? 'New written assignment' : 'Written assignment'} description="Build a prompt and visible rubric. Saving a draft does not assign it or award a grade." action={<button className={secondary} type="button" disabled={busy || access.loading || access.stopped} onClick={() => { void access.read(); }}>Refresh assignment preview</button>} />
    {error ? <p role="alert" aria-label="Written author error" className="rounded-lg border border-[var(--coral)] bg-[var(--coral-soft)] p-4 text-sm">{error}</p> : null}
    {!data ? <><WrittenAccess loading={access.loading} stopped={access.stopped} error={access.error} busy={busy} retry={() => { void access.read(); }} />{pending && !access.stopped ? <button className={secondary} type="button" disabled={busy || access.loading} onClick={() => { void send(pending); }}>Retry earlier author request</button> : null}</> : <>
      {message ? <p role="status" aria-label="Written author status" className="rounded-lg border border-[var(--moss)] bg-[var(--moss-soft)] p-4 text-sm">{message}</p> : null}
      {pending ? <section aria-label="Pending written author request" className="space-y-3 rounded-xl border border-[var(--line)] p-5"><h2 className="text-lg font-bold">Confirm the earlier request</h2><p className="text-sm">Retry the exact saved command before starting different work. Later edits or roster changes do not change this request.</p><button className={primary} type="button" disabled={busy} onClick={() => { void send(pending); }}>Retry earlier author request</button></section> : null}
      {confirmed ? <section aria-label="Created written draft" className="space-y-3 rounded-xl border border-[var(--moss)] bg-[var(--moss-soft)] p-5"><h2 className="text-xl font-bold">Private draft created</h2><p className="text-sm">The original save is confirmed. Open the saved draft to review current content and assign it.</p><Link className={primary} href={`${authorPath(workspace, classId)}/${confirmed.draft.id}`}>Open saved written draft</Link></section> : null}
      {conflict ? <section aria-label="Written author comparison" className="space-y-3 rounded-xl border border-[var(--coral)] p-5"><h2 className="text-lg font-bold">Compare with saved content</h2><p className="text-sm">The server has a different revision. Your browser work remains preserved. Confirm any pending command before loading the verified preview.</p>{author ? <button className={secondary} disabled={busy || Boolean(pending)} type="button" onClick={() => { adopt(author.draft, true); setMessage('Loaded saved content; earlier browser work remains in recovery.'); }}>Load saved content and keep browser copy</button> : null}</section> : null}
      {recovery ? <details className="space-y-3 rounded-xl border border-[var(--line)] p-5"><summary className="min-h-11 cursor-pointer py-2 font-bold">Preserved assignment content</summary><p className="break-words text-sm">{recovery.title || 'Untitled browser content'}</p><pre className="max-h-52 overflow-auto whitespace-pre-wrap break-words text-sm">{recovery.prompt}</pre><button className={secondary} type="button" disabled={busy || Boolean(pending) || !checkpointMatches || conflict || Boolean(confirmed)} onClick={() => { change(recovery); recoveryNow.current = null; setRecovery(null); persist(); }}>Restore assignment content</button></details> : null}
      <section aria-label="Written assignment editor" className="space-y-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">Prompt and grading criteria</h2><p role="status" aria-label="Written draft save status" className="text-sm font-bold">{pending ? 'Request awaiting confirmation' : !draftId ? 'New private draft' : dirty ? 'Unsaved content' : `Saved revision ${base?.revision ?? '…'}`}</p></div>{parsed.error ? <p role="status" className="text-sm text-[var(--muted)]">{parsed.error}</p> : null}{form ? <WrittenContentEditor form={form} disabled={busy || !ready || !checkpointMatches || conflict || Boolean(pending) || Boolean(confirmed)} onChange={change} /> : <p role="status" className="text-sm">Preparing the editor…</p>}<button className={primary} type="button" disabled={busy || !ready || !checkpointMatches || conflict || Boolean(pending) || Boolean(confirmed) || !parsed.input || Boolean(draftId) && !dirty} onClick={save}>Save private written draft</button></section>
      {author ? <><section aria-label="Saved written content" className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5"><h2 className="text-xl font-bold">Saved prompt · Revision {author.draft.revision}</h2><p className="whitespace-pre-wrap break-words text-sm leading-6">{author.draft.prompt}</p><p className="text-sm">{points(author.draft.maxUnits)} points · {author.draft.criteria.length} criteria</p></section><WrittenRubric criteria={author.draft.criteria} maxUnits={author.draft.maxUnits} />
        {author.publication ? <section aria-label="Written publication receipt" className="space-y-3 rounded-xl border border-[var(--moss)] bg-[var(--moss-soft)] p-5"><h2 className="text-xl font-bold">Assignment published</h2><p className="text-sm">Revision {author.publication.draftRevision} was assigned to {author.publication.recipientCount} learners. Later draft edits do not change its frozen prompt, rubric, audience or grades. This draft cannot be assigned again.</p>{workspace === 'teach' ? <Link className={secondary} href={`/teach/${classId}/submissions`}>Review written submissions</Link> : <p className="text-sm">The class instructor reviews submissions and releases grades. Administrative class management does not grant private grading access.</p>}</section>
          : <section aria-label="Written assignment audience" className="space-y-4 rounded-xl border border-[var(--moss)] bg-[var(--moss-soft)] p-5"><h2 className="text-xl font-bold">Review audience and assign</h2><p className="text-sm">Assign saved revision {author.draft.revision}. The preview below is the exact audience; later class joins will not add recipients.</p><div className="grid max-w-lg gap-2 text-sm"><label className="font-bold" htmlFor="written-audience">Assignment audience</label><select id="written-audience" className={field} value={audienceKind} disabled={busy || Boolean(pending)} onChange={event => { setAudienceKind(event.target.value as 'class' | 'selected'); setAudienceAcknowledgement(''); }}><option value="class">All current class learners</option><option value="selected">Selected enrolled learners</option></select></div><ul aria-label="Exact written assignment audience" className="space-y-2">{author.learners.map(person => <li key={person.id} className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3 text-sm">{audienceKind === 'selected' ? <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={selected.includes(person.id)} disabled={busy || Boolean(pending)} onChange={event => { setSelected(current => event.target.checked ? [...current, person.id] : current.filter(id => id !== person.id)); setAudienceAcknowledgement(''); }} />{person.displayName}</label> : person.displayName}</li>)}</ul><p className="text-sm font-bold">{recipients.length} learners selected</p>{!author.learners.length ? <p className="text-sm">Enroll learners before assigning this work.</p> : null}<label className="flex min-h-11 items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={audienceAcknowledgement === audienceSignature} disabled={busy || Boolean(pending) || dirty || !checkpointMatches || conflict || !audienceValid} onChange={event => setAudienceAcknowledgement(event.target.checked ? audienceSignature : '')} /><span>I reviewed this saved revision and the exact recipient list.</span></label>{dirty ? <p role="status" className="text-sm">Save or compare your unsaved content before assigning.</p> : null}<button className={primary} type="button" disabled={busy || Boolean(pending) || dirty || !checkpointMatches || conflict || !audienceValid || audienceAcknowledgement !== audienceSignature} onClick={publish}>Assign written work</button></section>}</> : null}
    </>}
  </WrittenFrame>;
}
