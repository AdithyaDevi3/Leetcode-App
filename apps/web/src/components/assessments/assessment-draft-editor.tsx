'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { AssessmentDraftInput, StoredAssessmentDraft } from '@leetcode-app/database';
import type { LearnerQuestion } from '@leetcode-app/domain';
import { AdminBadge, AdminSection } from '@/components/admin/admin-ui';
import { assessmentDraftForm, assessmentFormInput, displayAssessmentPoints, type AssessmentDraftForm, type AssessmentDraftSeed } from '@/lib/assessment-draft-form';
import { AssessmentPublicationPanel } from './assessment-publication-panel';

const field = 'min-h-11 w-full rounded-md border border-[var(--line)] bg-white px-3 font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)]';
const secondary = 'min-h-11 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-bold text-[var(--ink)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)]';
type PendingSave = { draftId: string | null; expectedRevision: number | null; requestKey: string; draft: AssessmentDraftInput };
function validForm(value: unknown): value is AssessmentDraftForm {
  if (!value || typeof value !== 'object') return false;
  const form = value as AssessmentDraftForm;
  return ['title', 'instructions', 'availableAt', 'dueAt', 'closesAt'].every(key => typeof form[key as keyof AssessmentDraftForm] === 'string')
    && Array.isArray(form.questions) && form.questions.length <= 30 && form.questions.every(question => typeof question.questionVersionId === 'string' && typeof question.points === 'string');
}
export function AssessmentDraftEditor({ classId, authorId, workspace, questions, initialDraft = null, initialSeed = null }: {
  classId: string; authorId: string; workspace: 'teach' | 'admin'; questions: readonly LearnerQuestion[]; initialDraft?: StoredAssessmentDraft | null; initialSeed?: AssessmentDraftSeed | null;
}) {
  const router = useRouter();
  const [form, setForm] = useState(() => assessmentDraftForm(initialDraft, initialSeed));
  const [stored, setStored] = useState(initialDraft);
  const [savedSignature, setSavedSignature] = useState(() => initialDraft ? JSON.stringify(assessmentFormInput(classId, assessmentDraftForm(initialDraft))) : '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [search, setSearch] = useState('');
  const [concept, setConcept] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [cacheReady, setCacheReady] = useState(false);
  const [hasPending, setHasPending] = useState(false);
  const [recovery, setRecovery] = useState<AssessmentDraftForm | null>(null);
  const pending = useRef<PendingSave | null>(null);
  const inFlight = useRef(false);
  const cacheClosed = useRef(false);
  const key = `method:assessment:${authorId}:${classId}:${initialDraft?.id ?? (initialSeed ? `new:${initialSeed.key}` : 'new')}`;
  const basePath = workspace === 'admin' ? `/admin/classes/${classId}` : `/teach/${classId}`;
  const editUrl = stored ? `${basePath}/assessments/${stored.id}` : null;
  const parsed = useMemo(() => {
    try { return { input: assessmentFormInput(classId, form), error: null }; }
    catch (error) { return { input: null, error: error instanceof Error ? error.message : 'Check this quiz draft.' }; }
  }, [classId, form]);
  const signature = parsed.input ? JSON.stringify(parsed.input) : '';
  const dirty = !stored || signature !== savedSignature;
  const total = parsed.input?.questions.reduce((sum, question) => sum + question.maxUnits, 0) ?? null;
  const catalog = new Map(questions.map(question => [question.versionId, question]));
  const topics = [...new Set(questions.flatMap(question => [...question.conceptIds]))].sort();
  const selected = new Set(form.questions.map(question => question.questionVersionId));
  const filtered = questions.filter(question => (!concept || question.conceptIds.includes(concept)) && (!difficulty || question.difficulty === difficulty)
    && `${question.title} ${question.prompt} ${question.conceptIds.join(' ')} ${question.activityIds.map(id => id.replaceAll('-', ' ')).join(' ')}`.toLowerCase().includes(search.trim().toLowerCase()));

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = window.sessionStorage.getItem(key);
        const cache = raw ? JSON.parse(raw) as { form?: unknown; recovery?: unknown; pending?: PendingSave; stored?: StoredAssessmentDraft; savedSignature?: string } : null;
        if (cache && validForm(cache.recovery)) setRecovery(cache.recovery);
        if (cache && validForm(cache.form)) {
          if (cache.pending || !initialDraft || cache.stored?.revision === initialDraft.revision) {
            setForm(cache.form);
            pending.current = cache.pending?.draft?.classId === classId && typeof cache.pending.requestKey === 'string' ? cache.pending : null;
            setHasPending(Boolean(pending.current));
            if (cache.stored?.classId === classId) setStored(cache.stored);
            if (typeof cache.savedSignature === 'string') setSavedSignature(cache.savedSignature);
            setMessage(pending.current ? 'An earlier save needs confirmation. Retry to recover its receipt.' : 'Restored your browser draft.');
          } else setRecovery(cache.form);
        }
      } catch { /* Server drafts remain available when browser storage is unavailable. */ }
      setCacheReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [key, classId, initialDraft]);
  useEffect(() => {
    if (!cacheReady || cacheClosed.current) return;
    try { window.sessionStorage.setItem(key, JSON.stringify({ form, stored, recovery, pending: pending.current, savedSignature })); } catch { /* Keep the form usable in memory. */ }
  }, [key, form, stored, recovery, savedSignature, cacheReady, message]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function save() {
    if (inFlight.current || conflict) return;
    if (!pending.current && !parsed.input) { setMessage(parsed.error); setError(true); return; }
    inFlight.current = true; setBusy(true); setError(false); setMessage(null);
    if (!pending.current) pending.current = { draftId: stored?.id ?? null, expectedRevision: stored?.revision ?? null, requestKey: crypto.randomUUID(), draft: parsed.input! };
    setHasPending(true);
    const request = pending.current;
    try {
      // Store the receipt identity before sending, so a reload can retry safely.
      try { window.sessionStorage.setItem(key, JSON.stringify({ form, stored, recovery, pending: request, savedSignature })); } catch { /* Memory retry remains available. */ }
      const response = await fetch(`/api/assessments/drafts?workspace=${workspace}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-assessment-author': authorId }, body: JSON.stringify(request), signal: AbortSignal.timeout(15_000) });
      const body = await response.json().catch(() => null) as { draft?: StoredAssessmentDraft; currentRevision?: number; error?: string } | null;
      if (!response.ok || !body?.draft) {
        if (response.status === 409) setConflict(true);
        if (response.status === 400 || response.status === 413) { pending.current = null; setHasPending(false); }
        throw new Error(body?.error ?? 'Could not confirm the save. Your entries are preserved; retry saving.');
      }
      if (body.draft.classId !== classId || !Number.isSafeInteger(body.draft.revision) || body.draft.revision < 1) throw new Error('Could not confirm the saved draft. Retry saving.');
      pending.current = null;
      setHasPending(false);
      setStored(body.draft);
      const accepted = JSON.stringify(request.draft);
      setSavedSignature(accepted);
      if (Math.max(body.currentRevision ?? body.draft.revision, initialDraft?.revision ?? 0) > body.draft.revision) {
        setConflict(true); setError(true); setMessage('Your earlier save was confirmed, but the server has a newer draft. Your entries are preserved; open the latest saved draft to compare.');
        return;
      }
      if (accepted === signature) {
        setMessage('Draft saved. Learners cannot see it.');
        if (!initialDraft) {
          cacheClosed.current = true;
          try { window.sessionStorage.removeItem(key); } catch { /* Confirmed work is stored on the server. */ }
          router.replace(`${basePath}/assessments/${body.draft.id}`, { scroll: false });
        }
      } else setMessage('Earlier save recovered. Your latest edits are still unsaved; save again to keep them.');
    } catch (error) { setError(true); setMessage(error instanceof Error ? error.message : 'Unable to save. Your entries are preserved.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  function move(index: number, direction: number) {
    setForm(current => { const values = [...current.questions]; [values[index], values[index + direction]] = [values[index + direction], values[index]]; return { ...current, questions: values }; });
  }
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
      <div><AdminBadge value="draft" /> <span className="ml-2 text-sm font-bold" aria-live="polite">{stored ? `Revision ${stored.revision} · ${conflict ? 'Review required' : dirty ? 'Unsaved changes' : 'Saved'}` : 'New quiz draft'}</span><p className="mb-0 mt-2 text-sm text-[var(--muted)]">Saving keeps a private draft. It does not assign work or release grades.</p></div>
      <button className="min-h-11 rounded-md bg-[var(--moss)] px-5 font-bold text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)]" disabled={busy || conflict || (!dirty && !hasPending)} type="button" onClick={save}>{busy ? 'Saving draft…' : 'Save draft'}</button>
    </div>
    {message ? <p role={error ? 'alert' : 'status'} aria-label={error ? 'Quiz draft error' : 'Quiz draft status'} className={`rounded-lg border p-4 text-sm ${error ? 'border-[var(--coral)] bg-[var(--coral-soft)]' : 'border-[var(--moss)] bg-[var(--moss-soft)]'}`}>{message}</p> : null}
    {conflict ? <p className="text-sm"><Link className="font-bold text-[var(--moss)] underline" href={editUrl ?? basePath} target="_blank" rel="noopener noreferrer">{editUrl ? 'Open latest saved draft in a new tab' : 'Reopen class workspace'}</Link>. Your edits remain in this tab for comparison.</p> : null}
    {recovery ? <details className="rounded-xl border border-[var(--line)] p-4"><summary>Recover a different browser draft</summary><p className="text-sm">The server has a newer revision. Restore this browser copy only if you want to use it as your next edit.</p><button className={secondary} type="button" onClick={() => { setForm(recovery); setRecovery(null); }}>Restore browser draft</button></details> : null}
    {stored ? <AssessmentPublicationPanel key={`${authorId}:${stored.id}:${stored.revision}`} draft={stored} authorId={authorId} workspace={workspace} blocked={dirty || conflict || busy || hasPending || !cacheReady} /> : <p className="text-sm text-[var(--muted)]">Save this draft to choose a class audience and assign the quiz.</p>}
    <fieldset disabled={busy} className="space-y-6">
      <AdminSection title="Quiz details" description="Give learners a clear title and instructions."><div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
        <label className="grid gap-1.5 text-sm font-bold sm:col-span-2">Quiz title<input className={field} minLength={3} maxLength={160} value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} /></label>
        <label className="grid gap-1.5 text-sm font-bold sm:col-span-2">Instructions <span className="font-normal text-[var(--muted)]">Optional</span><textarea className={`${field} min-h-24 py-3`} maxLength={2000} value={form.instructions} onChange={event => setForm(current => ({ ...current, instructions: event.target.value }))} /></label>
        <details className="sm:col-span-2"><summary className="font-bold">Availability and deadlines</summary><p className="text-sm text-[var(--muted)]">Optional. Times use your current time zone and are saved with the draft.</p><div className="grid gap-4 sm:grid-cols-3">{(['availableAt', 'dueAt', 'closesAt'] as const).map((name, index) => <label className="grid gap-1.5 text-sm font-bold" key={name}>{['Opens at', 'Due at', 'Closes at'][index]}<input type="datetime-local" className={field} value={form[name]} onChange={event => setForm(current => ({ ...current, [name]: event.target.value }))} /></label>)}</div></details>
      </div></AdminSection>
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <AdminSection title="Question bank" description={`${questions.length} reviewed questions. Search, preview, and add questions to this quiz.`}>
          <div className="grid gap-3 border-b border-[var(--line)] p-5 sm:grid-cols-2"><label className="grid gap-1.5 text-sm font-bold sm:col-span-2">Search questions<input className={field} type="search" value={search} onChange={event => setSearch(event.target.value)} /></label><label className="grid gap-1.5 text-sm font-bold">Concept<select aria-label="Concept" className={field} value={concept} onChange={event => setConcept(event.target.value)}><option value="">All concepts</option>{topics.map(topic => <option key={topic} value={topic}>{topic.replaceAll('-', ' ')}</option>)}</select></label><label className="grid gap-1.5 text-sm font-bold">Difficulty<select aria-label="Difficulty" className={field} value={difficulty} onChange={event => setDifficulty(event.target.value)}><option value="">All levels</option>{['foundation', 'intermediate', 'advanced'].map(level => <option key={level} value={level}>{level}</option>)}</select></label></div>
          <div className="max-h-[45rem] space-y-3 overflow-y-auto p-5" aria-label="Available quiz questions"><p className="text-sm text-[var(--muted)]" role="status">{filtered.length} matching questions</p>{filtered.map(question => <article className="rounded-lg border border-[var(--line)] p-4" key={question.versionId}><h3 className="mb-1 text-base font-bold">{question.title}</h3><p className="mb-3 text-xs capitalize text-[var(--muted)]">{question.difficulty} · {question.conceptIds.map(value => value.replaceAll('-', ' ')).join(', ')} · Version {question.version}</p><details><summary className="text-sm font-bold">Preview question</summary><p className="mt-3 whitespace-pre-wrap text-sm">{question.prompt}</p><ul className="list-disc space-y-2 pl-5 text-sm">{question.options.map(option => <li key={option.id}>{option.text}</li>)}</ul></details><button className={`${secondary} mt-3`} disabled={selected.has(question.versionId) || form.questions.length >= 30} type="button" aria-label={`Add ${question.title}`} onClick={() => setForm(current => ({ ...current, questions: [...current.questions, { questionVersionId: question.versionId, points: '5' }] }))}>{selected.has(question.versionId) ? 'Added' : 'Add question'}</button></article>)}{filtered.length === 0 ? <p className="text-sm">No questions match. Adjust the search or filters.</p> : null}</div>
        </AdminSection>
        <AdminSection title="Quiz questions" description={`${form.questions.length} selected · ${total === null ? 'Check points' : `${displayAssessmentPoints(total)} points`}`}>
          <ol className="space-y-4 p-5" aria-label="Selected quiz questions">{form.questions.map((selection, index) => <li className="rounded-lg border border-[var(--line)] p-4" key={selection.questionVersionId}><h3 className="text-base font-bold">{index + 1}. {catalog.get(selection.questionVersionId)?.title ?? 'Unavailable question version'}</h3><label className="mt-3 grid max-w-40 gap-1.5 text-sm font-bold">Points for question {index + 1}<input className={field} inputMode="decimal" value={selection.points} onChange={event => setForm(current => ({ ...current, questions: current.questions.map((question, position) => position === index ? { ...question, points: event.target.value } : question) }))} /></label><div className="mt-3 flex flex-wrap gap-2"><button className={secondary} type="button" disabled={index === 0} aria-label={`Move question ${index + 1} up`} onClick={() => move(index, -1)}>Move up</button><button className={secondary} type="button" disabled={index === form.questions.length - 1} aria-label={`Move question ${index + 1} down`} onClick={() => move(index, 1)}>Move down</button><button className={secondary} type="button" aria-label={`Remove question ${index + 1}`} onClick={() => setForm(current => ({ ...current, questions: current.questions.filter((_, position) => position !== index) }))}>Remove</button></div></li>)}</ol>{form.questions.length === 0 ? <p className="px-5 pb-5 text-sm text-[var(--muted)]">Add questions from the bank to build your quiz.</p> : null}
        </AdminSection>
      </div>
      <details className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5"><summary className="font-bold">Learner preview</summary><h2 className="mt-4 text-2xl font-bold">{form.title || 'Untitled quiz'}</h2>{form.instructions ? <p className="whitespace-pre-wrap text-sm">{form.instructions}</p> : null}<ol className="space-y-6 pl-5">{form.questions.map((selection, index) => { const question = catalog.get(selection.questionVersionId); return question ? <li key={selection.questionVersionId}><h3 className="text-base font-bold">{index + 1}. {question.title} · {selection.points} points</h3><p className="whitespace-pre-wrap text-sm">{question.prompt}</p><ul className="list-disc space-y-2 pl-5 text-sm">{question.options.map(option => <li key={option.id}>{option.text}</li>)}</ul></li> : null; })}</ol></details>
    </fieldset>
  </div>;
}
