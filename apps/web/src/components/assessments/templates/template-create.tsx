'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { AdminPageHeader } from '@/components/admin/admin-ui';
import type { AssessmentCopyPreview } from '@/lib/assessment-copy-api-types';
import type { TemplateCreateCommand, TemplateMutationResponse, TemplateWorkspace } from '@/lib/assessment-template-api-types';
import { validAssessmentCopyPreview } from '../assessment-copy-contract';
import { record, validCreateCommand, validMutation } from './template-contract';
import { TemplateRequestError, useOwnerPreview } from './use-owner-preview';
import { classPath, libraryPath, primary, secondary, TemplateAccess, TemplateFrame, TemplateQuestions } from './template-ui';

export function TemplateCreate({ workspace, actorId, classId, draftId }: { workspace: TemplateWorkspace; actorId: string; classId: string; draftId: string }) {
  const endpoint = `/api/assessments/templates?workspace=${workspace}`;
  const key = `method:template-create:${actorId}:${workspace}:${classId}:${draftId}`;
  const [pending, setPending] = useState<TemplateCreateCommand | null>(null);
  const [receipt, setReceipt] = useState<TemplateMutationResponse | null>(null);
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null), [message, setMessage] = useState<string | null>(null);
  const pendingNow = useRef<TemplateCreateCommand | null>(null), receiptNow = useRef<TemplateMutationResponse | null>(null), inFlight = useRef(false);
  const preview = useOwnerPreview<AssessmentCopyPreview>({ actorId, initialUrl: `/api/assessments/drafts/${draftId}/copy?workspace=${workspace}&classId=${classId}`, validate: value => validAssessmentCopyPreview(value, actorId, classId, draftId) });
  function persist(command: TemplateCreateCommand | null, accepted: TemplateMutationResponse | null) {
    try { sessionStorage.setItem(key, JSON.stringify({ pending: command, receipt: accepted })); } catch { /* Memory retry still keeps the exact command. */ }
  }
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = sessionStorage.getItem(key), value: unknown = raw ? JSON.parse(raw) : null;
        if (record(value) && validCreateCommand(value.pending, classId, draftId)) { pendingNow.current = value.pending; setPending(value.pending); setMessage('An earlier template save needs confirmation. Retry its exact request.'); }
        else if (record(value) && validMutation(value.receipt, actorId)) { receiptNow.current = value.receipt; setReceipt(value.receipt); setMessage('Your private template is already saved.'); }
      } catch { /* Existing server templates remain available in the library. */ }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [key, actorId, classId, draftId]);
  async function save() {
    if (!preview.data || !ready || inFlight.current || receiptNow.current || !preview.verifiedNow.current) return;
    if (!pendingNow.current && preview.data.source.questions.some(item => !item.question)) return;
    const command = pendingNow.current ?? { operation: 'create_from_draft' as const, sourceClassId: classId, sourceDraftId: draftId, expectedRevision: preview.data.source.revision, requestKey: crypto.randomUUID() };
    pendingNow.current = command; setPending(command); persist(command, null); inFlight.current = true; setBusy(true); setError(null);
    try {
      const accepted = await preview.command(endpoint, command, (value): value is TemplateMutationResponse => validMutation(value, actorId));
      if (!accepted) return;
      pendingNow.current = null; receiptNow.current = accepted; setPending(null); setReceipt(accepted); persist(null, accepted);
      setMessage('Private template saved. Open it to review content and create a class draft.');
    } catch (cause) {
      if (cause instanceof TemplateRequestError && ([400, 413].includes(cause.status) || (cause.status === 409 && ['source_conflict', 'template_conflict'].includes(cause.code ?? '')))) {
        pendingNow.current = null; setPending(null); persist(null, null);
      }
      setError(cause instanceof Error ? cause.message : 'The template save could not be confirmed. Retry the same request.');
    } finally { inFlight.current = false; setBusy(false); }
  }
  const source = preview.data?.source;
  return <TemplateFrame workspace={workspace}>
    <div className="flex flex-wrap gap-3"><Link className={secondary} href={`${classPath(workspace, classId)}/assessments/${draftId}`}>← Back to saved quiz</Link><Link className={secondary} href={libraryPath(workspace)}>Your template library</Link></div>
    <AdminPageHeader eyebrow="Reusable authoring" title="Save a private template" description="Capture one saved quiz revision as reusable content that belongs to your account." action={<button type="button" className={secondary} disabled={preview.loading || busy || preview.stopped} onClick={() => { void preview.read(); }}>Refresh saved version</button>} />
    {error ? <p className="rounded-lg border border-[var(--coral)] bg-[var(--coral-soft)] p-4 text-sm" role="alert" aria-label="Template save error">{error}</p> : null}
    {!source ? <TemplateAccess loading={preview.loading} stopped={preview.stopped} error={preview.error} retry={() => { void preview.read(); }} busy={busy} /> : <>
      {message ? <p className="rounded-lg border border-[var(--moss)] bg-[var(--moss-soft)] p-4 text-sm" role="status" aria-label="Template save status">{message}</p> : null}
      <section aria-label="Saved template source" className="space-y-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5"><p className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">{source.className} · Saved revision {source.revision}</p><h2 className="break-words text-2xl font-bold">{source.title}</h2><p className="text-sm leading-6">This uses the saved draft, which may differ from unsaved edits or an assigned quiz&apos;s frozen version. It keeps questions, order, points and authored instructions. Dates, audiences, submissions and grades are not part of a template.</p>{source.instructions ? <p className="whitespace-pre-wrap break-words text-sm">{source.instructions}</p> : null}<TemplateQuestions questions={source.questions} label="Saved template questions" /></section>
      <section aria-label="Create private template" className="space-y-4 rounded-xl border border-[var(--moss)] bg-[var(--moss-soft)] p-5"><h2 className="text-xl font-bold">Keep this content for reuse</h2><p className="text-sm leading-6">Only you can open this template, including in the admin workspace. Saving it assigns nothing. Review authored instructions before reusing them with a different class.</p>
        {pending ? <p className="text-sm" role="status">Retrying saved revision {pending.expectedRevision}; later source edits do not change this request.</p> : null}
        {source.questions.some(item => !item.question) ? <p className="text-sm" role="status">Replace unavailable questions in the source before starting a new template. An earlier accepted request can still be recovered.</p> : null}
        {receipt ? <div className="flex flex-wrap gap-3"><Link className={primary} href={`${libraryPath(workspace)}/${receipt.template.id}`} onClick={event => { if (!preview.verifiedNow.current) event.preventDefault(); }}>Open saved template</Link><button className={secondary} type="button" onClick={() => { receiptNow.current = null; setReceipt(null); persist(null, null); setMessage('Review the current saved revision before creating another template.'); void preview.read(); }}>Prepare another template</button></div> : <button className={primary} disabled={busy || !ready || (!pending && source.questions.some(item => !item.question))} type="button" onClick={save}>{busy ? 'Confirming template…' : pending ? 'Retry earlier template save' : 'Save private template'}</button>}
      </section>
    </>}
  </TemplateFrame>;
}
