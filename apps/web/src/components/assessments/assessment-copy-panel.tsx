'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { AssessmentCopyPreview } from '@/lib/assessment-copy-api-types';
import { AdminPageHeader } from '@/components/admin/admin-ui';
import { displayAssessmentPoints } from '@/lib/assessment-draft-form';
import { validAssessmentCopyCommand, validAssessmentCopyPreview, validAssessmentCopyReceipt, type AssessmentCopyCommand, type AssessmentCopyReceipt } from './assessment-copy-contract';

const secondary = 'inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-sm font-bold text-[var(--moss)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)] disabled:cursor-not-allowed disabled:opacity-50';
const primary = 'inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--moss)] px-5 py-2 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)] disabled:cursor-not-allowed disabled:opacity-50';
const object = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

export function AssessmentCopyPanel({ workspace, actorId, classId, draftId }: { workspace: 'teach' | 'admin'; actorId: string; classId: string; draftId: string }) {
  const [preview, setPreview] = useState<AssessmentCopyPreview | null>(null);
  const [destination, setDestination] = useState(classId);
  const [pending, setPending] = useState<AssessmentCopyCommand | null>(null);
  const [receipt, setReceipt] = useState<AssessmentCopyReceipt | null>(null);
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [cacheReady, setCacheReady] = useState(false);
  const alive = useRef(true);
  const closed = useRef(false);
  const verifiedNow = useRef(false);
  const epoch = useRef(0);
  const inFlight = useRef(false);
  const pendingNow = useRef<AssessmentCopyCommand | null>(null);
  const receiptNow = useRef<AssessmentCopyReceipt | null>(null);
  const destinationNow = useRef(classId);
  const endpoint = `/api/assessments/drafts/${draftId}/copy?workspace=${workspace}`;
  const key = `method:assessment-copy:${actorId}:${workspace}:${classId}:${draftId}`;
  const classPath = (id: string) => workspace === 'admin' ? `/admin/classes/${id}` : `/teach/${id}`;
  const sourcePath = `${classPath(classId)}/assessments/${draftId}`;

  function persist(nextPending: AssessmentCopyCommand | null, nextReceipt: AssessmentCopyReceipt | null, nextDestination = destinationNow.current) {
    try { sessionStorage.setItem(key, JSON.stringify({ pending: nextPending, receipt: nextReceipt, destinationClassId: nextDestination })); } catch { /* The exact command remains retryable in this tab. */ }
  }
  function accountChanged() {
    closed.current = true; verifiedNow.current = false; epoch.current += 1;
    setStopped(true); setVerified(false); setPreview(null); setLoading(false); setMessage(null);
    setError('Your account changed. Reopen the quiz in the intended account. The original copy request stays in this tab.');
  }
  function changedOwner(response: Response, body: unknown) {
    const value = object(body);
    return response.status === 401 || value?.code === 'owner_changed' || (typeof value?.actorId === 'string' && value.actorId !== actorId);
  }
  async function load() {
    if (closed.current) return;
    const current = ++epoch.current;
    verifiedNow.current = false; setVerified(false); setLoading(true); setError(null);
    try {
      const response = await fetch(`${endpoint}&classId=${classId}`, { cache: 'no-store', headers: { 'x-assessment-author': actorId }, signal: AbortSignal.timeout(15_000) });
      const body: unknown = await response.json().catch(() => null);
      if (!alive.current || current !== epoch.current || closed.current) return;
      if (changedOwner(response, body)) { accountChanged(); return; }
      if (!response.ok) throw new Error(typeof object(body)?.error === 'string' ? object(body)!.error as string : 'Quiz copying is unavailable. Recheck access and retry.');
      if (!validAssessmentCopyPreview(body, actorId, classId, draftId)) throw new Error('The saved quiz could not be verified. Reload before creating a copy.');
      if (!pendingNow.current && !receiptNow.current && !body.destinations.some(item => item.id === destinationNow.current)) {
        destinationNow.current = classId; setDestination(classId);
      }
      setPreview(body); verifiedNow.current = true; setVerified(true);
    } catch (cause) {
      if (alive.current && current === epoch.current && !closed.current) setError(cause instanceof Error ? cause.message : 'Quiz copying is unavailable. Retry the preview.');
    } finally { if (alive.current && current === epoch.current) setLoading(false); }
  }
  useEffect(() => {
    alive.current = true;
    const timer = window.setTimeout(() => {
      try {
        const raw = sessionStorage.getItem(key);
        const cache = raw ? object(JSON.parse(raw)) : null;
        if (cache && validAssessmentCopyCommand(cache.pending, classId)) {
          pendingNow.current = cache.pending; setPending(cache.pending);
          destinationNow.current = cache.pending.destinationClassId; setDestination(cache.pending.destinationClassId);
          setMessage('An earlier copy needs confirmation. Retry the same request to recover its saved draft.');
        } else if (cache && validAssessmentCopyReceipt(cache.receipt, actorId, draftId)) {
          receiptNow.current = cache.receipt; setReceipt(cache.receipt);
          destinationNow.current = cache.receipt.classId; setDestination(cache.receipt.classId);
          setMessage('Your earlier private copy is ready. Open the saved draft to continue.');
        } else if (cache && typeof cache.destinationClassId === 'string') {
          destinationNow.current = cache.destinationClassId; setDestination(cache.destinationClassId);
        }
      } catch { /* Account authorization and saved server drafts do not depend on browser storage. */ }
      setCacheReady(true); void load();
    }, 0);
    const hide = () => { epoch.current += 1; verifiedNow.current = false; setVerified(false); setLoading(false); };
    const verify = () => { void load(); };
    const visibility = () => { if (document.visibilityState === 'hidden') hide(); else verify(); };
    window.addEventListener('blur', hide); window.addEventListener('focus', verify); document.addEventListener('visibilitychange', visibility);
    return () => { alive.current = false; epoch.current += 1; window.clearTimeout(timer); window.removeEventListener('blur', hide); window.removeEventListener('focus', verify); document.removeEventListener('visibilitychange', visibility); };
    // The server and fixture key this component by verified actor, workspace and source.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, actorId, classId, draftId, workspace]);

  async function copy() {
    if (!verifiedNow.current || !preview || closed.current || inFlight.current || receiptNow.current || !cacheReady) return;
    if (!pendingNow.current && (preview.source.questions.some(item => !item.question) || !preview.destinations.some(item => item.id === destination))) return;
    const command = pendingNow.current ?? { sourceClassId: classId, destinationClassId: destination, expectedRevision: preview.source.revision, requestKey: crypto.randomUUID() };
    pendingNow.current = command; setPending(command); persist(command, null, command.destinationClassId);
    const current = epoch.current;
    inFlight.current = true; setBusy(true); setError(null); setMessage(null);
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-assessment-author': actorId }, body: JSON.stringify(command), signal: AbortSignal.timeout(15_000) });
      const body: unknown = await response.json().catch(() => null);
      if (!alive.current || current !== epoch.current || closed.current) return;
      if (changedOwner(response, body)) { accountChanged(); return; }
      if (!response.ok) {
        if (response.status === 400 || response.status === 413 || (response.status === 409 && object(body)?.code === 'source_conflict')) {
          pendingNow.current = null; setPending(null); persist(null, null);
        }
        if ([403, 404, 409].includes(response.status)) { verifiedNow.current = false; setVerified(false); }
        throw new Error(typeof object(body)?.error === 'string' ? object(body)!.error as string : 'Could not confirm the copy. Retry the same request to recover it.');
      }
      if (!validAssessmentCopyReceipt(body, actorId, draftId, command.destinationClassId)) throw new Error('Could not verify the saved copy. Retry the same request to recover its receipt.');
      pendingNow.current = null; receiptNow.current = body;
      setPending(null); setReceipt(body); persist(null, body, body.classId);
      setMessage('Private copy created. Open the draft to edit dates, review questions and choose its audience before assigning.');
    } catch (cause) {
      if (alive.current && current === epoch.current && !closed.current) setError(cause instanceof Error ? cause.message : 'Could not confirm the copy. Retry to recover its receipt.');
    } finally { inFlight.current = false; if (alive.current) setBusy(false); }
  }

  const source = verified ? preview?.source : null;
  const destinations = verified ? preview?.destinations ?? [] : [];
  const unavailable = source?.questions.filter(item => !item.question).length ?? 0;
  const completed = Boolean(receipt && destinations.some(item => item.id === receipt.classId));
  function prepareAnother() {
    if (!verifiedNow.current || !receiptNow.current || inFlight.current) return;
    receiptNow.current = null; setReceipt(null); persist(null, null);
    setMessage('Review the current saved version and destination before creating another private copy.');
    void load();
  }
  const Container = workspace === 'admin' ? 'div' : 'main';
  return <Container><div className={`mx-auto max-w-5xl space-y-6 ${workspace === 'admin' ? '' : 'px-5 py-6 sm:px-8'}`}>
    <Link className="inline-flex min-h-11 items-center text-sm font-bold text-[var(--moss)] underline underline-offset-4" href={sourcePath}>← Back to saved quiz</Link>
    <AdminPageHeader eyebrow="Quiz authoring" title="Copy a quiz draft" description="Review the saved version and destination, then create a separate private draft." action={<button className={secondary} disabled={loading || busy || stopped} type="button" onClick={load}>Refresh saved version</button>} />
    {error ? <p className="rounded-lg border border-[var(--coral)] bg-[var(--coral-soft)] p-4 text-sm" role="alert" aria-label="Quiz copy error">{error}</p> : null}
    {stopped ? <section className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5" aria-label="Quiz copy account changed"><h2 className="text-xl font-bold">Reopen the quiz</h2><p className="text-sm">The previous preview and copy navigation are hidden until you reopen this workspace.</p><Link className={secondary} href={classPath(classId)}>Reopen class workspace</Link></section> : !verified ? <section className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5" aria-label="Quiz copy verification"><p className="text-sm" role="status">{loading ? 'Checking your account, saved quiz and available classes…' : 'Recheck access to show the current saved quiz.'}</p><button className={secondary} disabled={loading || busy} type="button" onClick={load}>Retry quiz preview</button></section> : null}
    {source ? <>
      {message ? <p className="rounded-lg border border-[var(--moss)] bg-[var(--moss-soft)] p-4 text-sm" role="status" aria-label="Quiz copy status">{message}</p> : null}
      <section aria-label="Saved quiz to copy" className="space-y-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6"><div><p className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">{source.className} · Saved revision {source.revision}</p><h2 className="break-words text-2xl font-bold">{source.title}</h2></div><p className="text-sm leading-6 text-[var(--muted)]">This copies the saved draft version. Unsaved edits and an already assigned quiz&apos;s frozen version may differ. The original stays unchanged.</p>{source.instructions ? <p className="whitespace-pre-wrap break-words text-sm leading-6">{source.instructions}</p> : <p className="text-sm text-[var(--muted)]">No instructions in this saved version.</p>}<ol className="space-y-3" aria-label="Questions to copy">{source.questions.map((item, index) => <li className="min-w-0 rounded-lg border border-[var(--line)] p-4" key={item.questionVersionId}><h3 className="break-words text-base font-bold">{index + 1}. {item.question?.title ?? 'Unavailable question version'}</h3><p className="mt-1 text-sm text-[var(--muted)]">{displayAssessmentPoints(item.maxUnits)} points</p>{item.question ? <details><summary className="min-h-11 cursor-pointer py-3 text-sm font-bold underline">Preview question {index + 1}</summary><p className="whitespace-pre-wrap break-words text-sm leading-6">{item.question.prompt}</p><ul className="list-disc space-y-2 pl-5 text-sm">{item.question.options.map(option => <li className="whitespace-pre-wrap break-words" key={option.id}>{option.text}</li>)}</ul></details> : <p className="text-sm text-[var(--muted)]">Replace this item in the source draft before making a new copy.</p>}</li>)}</ol><p className="text-sm font-bold">{source.questions.length} questions · {displayAssessmentPoints(source.questions.reduce((sum, item) => sum + item.maxUnits, 0))} points</p></section>
      <section aria-label="Private quiz copy" className="space-y-4 rounded-xl border border-[var(--moss)] bg-[var(--moss-soft)] p-5 sm:p-6"><h2 className="text-2xl font-bold">Choose the destination</h2><p className="text-sm leading-6">The copy keeps the question order, points and instructions. Its title starts with “Copy of”. Dates are cleared; learner records, submissions, grades and the original audience are not copied. You will choose a new audience when you assign it.</p><label className="grid max-w-xl gap-2 text-sm font-bold">Destination class<select aria-label="Destination class" className="min-h-11 min-w-0 rounded-md border border-[var(--line)] bg-white px-3 font-normal" value={destination} disabled={busy || Boolean(pending) || Boolean(receipt)} onChange={event => { destinationNow.current = event.target.value; setDestination(event.target.value); persist(null, null, event.target.value); }}>{!destinations.some(item => item.id === destination) ? <option value={destination}>Earlier destination: recheck access</option> : null}{destinations.map(item => <option key={item.id} value={item.id}>{item.name}{item.id === classId ? ' (source class)' : ''}</option>)}</select></label>
        {pending ? <p className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4 text-sm" role="status">An earlier request uses saved revision {pending.expectedRevision}. Retry to recover that exact copy, even if this preview has changed. Its destination is fixed until the result is confirmed.</p> : null}
        {unavailable ? <div className="space-y-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4"><p className="text-sm" role="status">{unavailable} question {unavailable === 1 ? 'version is' : 'versions are'} unavailable for a new copy. No questions will be silently removed or replaced.{pending ? ' You can still recover an earlier accepted copy.' : ''}</p><Link className="inline-flex min-h-11 items-center text-sm font-bold text-[var(--moss)] underline" href={sourcePath}>Edit source to replace unavailable questions</Link></div> : null}
        {receipt ? completed ? <div className="space-y-3"><Link className={primary} href={`${classPath(receipt.classId)}/assessments/${receipt.draftId}`} onClick={event => { if (!verifiedNow.current) event.preventDefault(); }}>Open copied draft</Link><p className="text-sm">Opening the saved copy shows its latest version. Assignment still requires an audience preview and explicit publication.</p></div> : <p className="text-sm" role="status">The earlier copy&apos;s destination is no longer available in this account. Recheck access before continuing.</p> : <button className={primary} type="button" disabled={busy || !cacheReady || (!pending && (unavailable > 0 || !destinations.some(item => item.id === destination)))} onClick={copy}>{busy ? 'Confirming private copy…' : pending ? 'Retry earlier copy' : 'Create private copy'}</button>}
        {receipt ? <button className={secondary} type="button" disabled={busy} onClick={prepareAnother}>Prepare another copy</button> : null}
      </section>
    </> : null}
  </div></Container>;
}
