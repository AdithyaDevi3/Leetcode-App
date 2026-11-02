'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AdminBadge, AdminPageHeader } from '@/components/admin/admin-ui';
import type { TemplateArchiveCommand, TemplateDetailResponse, TemplateDraftResponse, TemplateMutationResponse, TemplateUpdateCommand, TemplateUseCommand, TemplateView, TemplateWorkspace } from '@/lib/assessment-template-api-types';
import { displayAssessmentPoints } from '@/lib/assessment-draft-form';
import { record, validDetail, validDraftReceipt, validEditCommand, validUseCommand, validMutation } from './template-contract';
import { formSignature, templateContent, templateForm, validForm, type TemplateForm } from './template-form';
import { TemplateContentEditor } from './template-content-editor';
import { TemplateRequestError, useOwnerPreview } from './use-owner-preview';
import { classPath, field, libraryPath, primary, secondary, TemplateAccess, TemplateFrame, TemplateQuestions } from './template-ui';

type Pending = { kind: 'edit'; command: TemplateUpdateCommand | TemplateArchiveCommand } | { kind: 'use'; command: TemplateUseCommand };
type Base = { revision: number; version: number; signature: string };
function validPending(value: unknown): value is Pending {
  return record(value) && Object.keys(value).length === 2 && (value.kind === 'edit' ? validEditCommand(value.command) : value.kind === 'use' && validUseCommand(value.command));
}
function validBase(value: unknown): value is Base {
  return record(value) && Object.keys(value).length === 3 && Number.isSafeInteger(value.revision) && Number(value.revision) >= 1
    && Number.isSafeInteger(value.version) && Number(value.version) >= 1 && Number(value.version) <= Number(value.revision) && typeof value.signature === 'string' && value.signature.length <= 30_000;
}
export function TemplateDetail({ workspace, actorId, templateId }: { workspace: TemplateWorkspace; actorId: string; templateId: string }) {
  const endpoint = `/api/assessments/templates/${templateId}?workspace=${workspace}`;
  const draftEndpoint = `/api/assessments/templates/${templateId}/drafts?workspace=${workspace}`;
  const key = `method:template-work:${actorId}:${workspace}:${templateId}`;
  const [form, setForm] = useState<TemplateForm | null>(null), [base, setBase] = useState<Base | null>(null), [recovery, setRecovery] = useState<TemplateForm | null>(null);
  const [pending, setPending] = useState<Pending | null>(null), [receipt, setReceipt] = useState<TemplateDraftResponse | null>(null);
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null), [message, setMessage] = useState<string | null>(null);
  const [versionChoice, setVersionChoice] = useState(''), [destination, setDestination] = useState('');
  const requestedVersion = useRef<number | null>(null), inFlight = useRef(false), cacheReady = useRef(false), conflictNow = useRef(false);
  const formNow = useRef<TemplateForm | null>(null), baseNow = useRef<Base | null>(null), recoveryNow = useRef<TemplateForm | null>(null);
  const pendingNow = useRef<Pending | null>(null), receiptNow = useRef<TemplateDraftResponse | null>(null), destinationNow = useRef('');
  const preview = useOwnerPreview<TemplateDetailResponse>({ actorId, initialUrl: endpoint,
    validate: (value): value is TemplateDetailResponse => validDetail(value, actorId, templateId) && (requestedVersion.current === null || value.template.version === requestedVersion.current) });
  function persist() {
    if (!cacheReady.current) return;
    try { sessionStorage.setItem(key, JSON.stringify({ version: 1, form: formNow.current, base: baseNow.current, recovery: recoveryNow.current, pending: pendingNow.current, receipt: receiptNow.current, destination: destinationNow.current })); }
    catch { /* In-memory work and request identities remain usable. */ }
  }
  function changeForm(value: TemplateForm) { formNow.current = value; setForm(value); persist(); }
  function changeConflict(value: boolean) { conflictNow.current = value; setConflict(value); }
  function adopt(template: TemplateView, keepBrowser = false) {
    if (keepBrowser && formNow.current) { recoveryNow.current = formNow.current; setRecovery(formNow.current); }
    const next = templateForm(template), checkpoint = { revision: template.revision, version: template.version, signature: formSignature(next) };
    formNow.current = next; baseNow.current = checkpoint; setForm(next); setBase(checkpoint); changeConflict(false); persist();
  }
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = sessionStorage.getItem(key), value: unknown = raw ? JSON.parse(raw) : null;
        if (record(value) && value.version === 1) {
          if (validForm(value.form) && validBase(value.base)) { formNow.current = value.form; baseNow.current = value.base; setForm(value.form); setBase(value.base); }
          if (validForm(value.recovery)) { recoveryNow.current = value.recovery; setRecovery(value.recovery); }
          if (validPending(value.pending)) { pendingNow.current = value.pending; setPending(value.pending); setMessage('An earlier request needs confirmation. Retry it before starting different work.'); }
          if (!pendingNow.current && validDraftReceipt(value.receipt, actorId)) { receiptNow.current = value.receipt; setReceipt(value.receipt); }
          if (typeof value.destination === 'string') { destinationNow.current = value.destination; setDestination(value.destination); }
          if (pendingNow.current?.kind === 'use') { destinationNow.current = pendingNow.current.command.destinationClassId; setDestination(destinationNow.current); }
          if (receiptNow.current) { destinationNow.current = receiptNow.current.classId; setDestination(destinationNow.current); }
        }
      } catch { /* Never substitute an invalid browser cache for a verified server view. */ }
      cacheReady.current = true; setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [key, actorId]);
  const data = preview.data;
  useEffect(() => {
    if (!data || !ready) return;
    const timer = window.setTimeout(() => {
      const currentForm = formNow.current, checkpoint = baseNow.current;
      if (!currentForm || !checkpoint) adopt(data.template);
      else if (checkpoint.revision !== data.template.revision || checkpoint.version !== data.template.version) {
        if (pendingNow.current || conflictNow.current || formSignature(currentForm) !== checkpoint.signature) changeConflict(true);
        else adopt(data.template);
      }
      setVersionChoice(String(data.template.version));
      if (!pendingNow.current && !receiptNow.current && !data.destinations.some(item => item.id === destinationNow.current)) {
        destinationNow.current = data.destinations[0]?.id ?? ''; setDestination(destinationNow.current); persist();
      }
    }, 0);
    return () => window.clearTimeout(timer);
    // Draft refs preserve work while a later verified server preview arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, ready]);
  const parsed = useMemo(() => {
    try { return { input: form ? templateContent(form) : null, error: null }; }
    catch (cause) { return { input: null, error: cause instanceof Error ? cause.message : 'Check the template content.' }; }
  }, [form]);
  const dirty = Boolean(form && base && formSignature(form) !== base.signature);
  const checkpointMatches = Boolean(data && base && base.revision === data.template.revision && base.version === data.template.version);
  const editable = Boolean(data && checkpointMatches && data.template.status === 'active' && data.template.version === data.template.currentVersion && !conflict);
  const catalog = new Set(data?.catalog.map(item => item.versionId) ?? []);
  const missingEdits = form?.questions.some(item => !catalog.has(item.questionVersionId)) ?? false;
  const missingVersion = data?.template.questions.some(item => !item.question) ?? false;
  async function submit(next: Pending) {
    if (!data || !ready || !preview.verifiedNow.current || inFlight.current) return;
    const request = pendingNow.current ?? next;
    pendingNow.current = request; setPending(request); persist(); inFlight.current = true; setBusy(true); setError(null); setMessage(null);
    try {
      if (request.kind === 'use') {
        const accepted = await preview.command(draftEndpoint, request.command, (value): value is TemplateDraftResponse => validDraftReceipt(value, actorId, request.command.destinationClassId));
        if (!accepted) return;
        pendingNow.current = null; setPending(null); receiptNow.current = accepted; setReceipt(accepted); persist();
        setMessage('Private class draft created. Review its dates and audience before assigning.');
      } else {
        const accepted = await preview.command(endpoint, request.command, (value): value is TemplateMutationResponse => validMutation(value, actorId, templateId));
        if (!accepted) return;
        pendingNow.current = null; setPending(null); persist();
        if (accepted.currentRevision > accepted.template.revision) {
          changeConflict(true); setMessage('Your earlier request was confirmed, but the server has a newer revision. Browser edits are preserved for comparison.');
        } else if (request.command.operation === 'update' && formNow.current && formSignature(formNow.current) !== JSON.stringify(request.command.content)) {
          const checkpoint = { revision: accepted.template.revision, version: accepted.template.version, signature: JSON.stringify(request.command.content) };
          baseNow.current = checkpoint; setBase(checkpoint); persist(); setMessage('Earlier version saved. Your latest browser edits are still unsaved.');
        } else {
          adopt(accepted.template); setMessage(request.command.operation === 'update' ? `Version ${accepted.template.version} saved. Existing class drafts and grades stay unchanged.` : accepted.template.status === 'archived' ? 'Template archived. Existing class work stays unchanged.' : 'Template restored. Review it before creating a draft.');
        }
        requestedVersion.current = null; await preview.read(endpoint);
      }
    } catch (cause) {
      if (cause instanceof TemplateRequestError && ([400, 413].includes(cause.status) || (cause.status === 409 && ['template_conflict', 'source_conflict'].includes(cause.code ?? '')))) {
        pendingNow.current = null; setPending(null); persist(); if (cause.status === 409) changeConflict(true);
      }
      setError(cause instanceof Error ? cause.message : 'The request could not be confirmed. Retry its original receipt.');
    } finally { inFlight.current = false; setBusy(false); }
  }
  function save() {
    if (!data || !parsed.input || !editable || missingEdits || receiptNow.current || baseNow.current?.revision !== data.template.revision || baseNow.current.version !== data.template.version) return;
    void submit({ kind: 'edit', command: { operation: 'update', expectedRevision: data.template.revision, requestKey: crypto.randomUUID(), content: parsed.input } });
  }
  function archive() {
    if (!data || dirty || conflict || pendingNow.current || receiptNow.current || baseNow.current?.revision !== data.template.revision || baseNow.current.version !== data.template.version) return;
    void submit({ kind: 'edit', command: { operation: 'set_archived', archived: data.template.status === 'active', expectedRevision: data.template.revision, requestKey: crypto.randomUUID() } });
  }
  function useTemplate() {
    if (!data || data.template.status !== 'active' || dirty || conflict || missingVersion || receiptNow.current || !data.destinations.some(item => item.id === destination)
      || baseNow.current?.revision !== data.template.revision || baseNow.current.version !== data.template.version) return;
    void submit({ kind: 'use', command: { version: data.template.version, expectedRevision: data.template.revision, destinationClassId: destination, requestKey: crypto.randomUUID() } });
  }
  function loadVersion() {
    if (!data || dirty || pendingNow.current || busy || !checkpointMatches) return;
    const version = Number(versionChoice);
    if (!Number.isSafeInteger(version) || version < 1 || version > data.template.currentVersion) { setError('Choose an existing template version.'); return; }
    requestedVersion.current = version; void preview.read(`${endpoint}&version=${version}`);
  }
  return <TemplateFrame workspace={workspace}>
    <Link className={secondary} href={libraryPath(workspace)}>← Your template library</Link>
    <AdminPageHeader eyebrow="Creator-private content" title={data?.template.title ?? 'Private quiz template'} description="Preview immutable versions, save a new version, or create a separate class draft." action={<button type="button" className={secondary} disabled={preview.loading || busy || preview.stopped} onClick={() => { void preview.read(); }}>Refresh template</button>} />
    {error ? <p className="rounded-lg border border-[var(--coral)] bg-[var(--coral-soft)] p-4 text-sm" role="alert" aria-label="Template action error">{error}</p> : null}
    {!data ? <TemplateAccess loading={preview.loading} stopped={preview.stopped} error={preview.error} retry={() => { void preview.read(); }} busy={busy} /> : <>
      {message ? <p className="rounded-lg border border-[var(--moss)] bg-[var(--moss-soft)] p-4 text-sm" role="status" aria-label="Template action status">{message}</p> : null}
      <section aria-label="Template version preview" className="space-y-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">Version {data.template.version} of {data.template.currentVersion}</h2><AdminBadge value={data.template.status} /></div><p className="text-sm text-[var(--muted)]">Revision {data.template.revision} · {data.template.questions.length} questions · {displayAssessmentPoints(data.template.maxUnits)} points</p><p className="text-sm leading-6">Saved versions are immutable. Editing saves a new version without changing existing class drafts, submissions or grades. Authored instructions should be reviewed before reuse.</p><form className="flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); loadVersion(); }}><label className="grid max-w-48 gap-2 text-sm font-bold">Version to view<input className={field} type="number" min={1} max={data.template.currentVersion} step={1} value={versionChoice} disabled={busy || Boolean(pending) || dirty} onChange={event => setVersionChoice(event.target.value)} /></label><button type="submit" className={secondary} disabled={busy || Boolean(pending) || dirty}>Load version</button></form>{data.template.instructions ? <p className="whitespace-pre-wrap break-words text-sm">{data.template.instructions}</p> : null}<TemplateQuestions questions={data.template.questions} /></section>
      {pending ? <section aria-label="Pending template request" className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5"><h2 className="text-lg font-bold">Confirm the earlier request</h2><p className="text-sm">This request keeps revision {pending.command.expectedRevision}{pending.kind === 'use' ? ` and template version ${pending.command.version}` : ''}. Retry it before starting different work, even if this preview changed.</p><button type="button" className={primary} disabled={busy} onClick={() => { void submit(pending); }}>{busy ? 'Confirming request…' : 'Retry earlier template request'}</button></section> : null}
      {conflict ? <section aria-label="Template comparison required" className="space-y-3 rounded-xl border border-[var(--coral)] bg-[var(--coral-soft)] p-5"><h2 className="text-lg font-bold">Compare with the saved version</h2><p className="text-sm">The server view changed. Browser work is preserved. Confirm any earlier request, then keep a recovery copy while loading the current preview into the editor.</p><button className={secondary} disabled={busy || Boolean(pending)} type="button" onClick={() => { adopt(data.template, true); setMessage('Loaded the verified preview; your earlier browser work remains in recovery.'); }}>Load preview and keep browser copy</button></section> : null}
      {recovery ? <details className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5"><summary className="min-h-11 cursor-pointer py-2 font-bold">Preserved browser content</summary><p className="text-sm">{recovery.title || 'Untitled browser content'} · {recovery.questions.length} questions. Restoring makes an unsaved edit against the currently loaded version.</p><button className={secondary} disabled={!editable || busy || Boolean(pending)} type="button" onClick={() => { changeForm(recovery); recoveryNow.current = null; setRecovery(null); persist(); }}>Restore browser content</button></details> : null}
      <section aria-label="Template content authoring" className="space-y-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">Content for the next version</h2><button className={primary} disabled={!editable || busy || !ready || Boolean(pending) || Boolean(receipt) || !dirty || !parsed.input || missingEdits} type="button" onClick={save}>{busy && pending?.kind === 'edit' ? 'Confirming version…' : 'Save new version'}</button></div>{data.template.version !== data.template.currentVersion ? <p className="text-sm" role="status">Historical versions are read-only. Load version {data.template.currentVersion} to edit current content.</p> : null}{data.template.status === 'archived' ? <p className="text-sm" role="status">Restore this template before editing or creating a new draft.</p> : null}{parsed.error ? <p className="text-sm" role="status">{parsed.error}</p> : null}{missingEdits ? <p className="text-sm" role="status">Remove unavailable versions and add reviewed replacements before saving new content.</p> : null}{form ? <TemplateContentEditor form={form} catalog={data.catalog} disabled={!editable || busy || Boolean(pending) || Boolean(receipt)} onChange={changeForm} /> : <p className="text-sm" role="status">Preparing the verified editor…</p>}</section>
      <section aria-label="Use template in a class" className="space-y-4 rounded-xl border border-[var(--moss)] bg-[var(--moss-soft)] p-5"><h2 className="text-xl font-bold">Create a private class draft</h2><p className="text-sm leading-6">Use the previewed version {data.template.version}. Dates are cleared. The saved draft still needs its own questions/date review, audience preview and explicit assignment. Creating it assigns nothing.</p>{dirty ? <p className="text-sm" role="status">Save or compare your browser edits before creating a draft from a saved version.</p> : null}{missingVersion ? <p className="text-sm" role="status">This version contains unavailable questions. Repair current content and save a new version before starting a new draft; accepted requests can still be recovered.</p> : null}<label className="grid max-w-xl gap-2 text-sm font-bold">Destination class<select aria-label="Destination class" className={field} value={destination} disabled={busy || Boolean(pending) || Boolean(receipt)} onChange={event => { destinationNow.current = event.target.value; setDestination(event.target.value); persist(); }}>{!data.destinations.some(item => item.id === destination) ? <option value={destination}>Choose an authorized class</option> : null}{data.destinations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{!data.destinations.length ? <p className="text-sm">Create or reopen an authorized class before using this template.</p> : null}{receipt ? <div className="flex flex-wrap gap-3">{data.destinations.some(item => item.id === receipt.classId) ? <Link className={primary} href={`${classPath(workspace, receipt.classId)}/assessments/${receipt.draftId}`} onClick={event => { if (!preview.verifiedNow.current) event.preventDefault(); }}>Open class draft</Link> : <p className="text-sm">The earlier destination is no longer available. Recheck class access before opening the draft.</p>}<button className={secondary} type="button" disabled={busy || Boolean(pending)} onClick={() => { receiptNow.current = null; setReceipt(null); persist(); setMessage('Review the version and destination before creating another class draft.'); void preview.read(); }}>Prepare another class draft</button></div> : <button className={primary} type="button" disabled={busy || !ready || !checkpointMatches || Boolean(pending) || dirty || conflict || data.template.status !== 'active' || missingVersion || !data.destinations.some(item => item.id === destination)} onClick={useTemplate}>Create class draft</button>}</section>
      <section aria-label="Template archive controls" className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5"><h2 className="text-lg font-bold">{data.template.status === 'active' ? 'Archive template' : 'Restore template'}</h2><p className="text-sm">Archiving prevents new uses and keeps version history. Existing class drafts and grades remain unchanged.</p><button className={secondary} disabled={busy || !checkpointMatches || Boolean(pending) || Boolean(receipt) || dirty || conflict} type="button" onClick={archive}>{data.template.status === 'active' ? 'Archive template' : 'Restore template'}</button></section>
    </>}
  </TemplateFrame>;
}
