'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { AdminPageHeader } from '@/components/admin/admin-ui';
import { focusSignature, validClassInsights, type ClassInsightsView } from './class-insights-contract';

const secondary = 'inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-sm font-bold text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)] disabled:cursor-not-allowed disabled:opacity-50';
const primary = 'inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--moss)] px-4 py-2 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)]';
const label = (value: string) => value.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
const date = (value: string) => new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(value));

export function ClassInsightsPanel({ actorId, classId, workspace }: { actorId: string; classId: string; workspace: 'teach' | 'admin' }) {
  const [data, setData] = useState<ClassInsightsView | null>(null);
  const [focus, setFocus] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [coverage, setCoverage] = useState('all');
  const [loading, setLoading] = useState(true);
  const [verified, setVerified] = useState(false);
  const [changed, setChanged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectionMessage, setSelectionMessage] = useState<string | null>(null);
  const alive = useRef(true);
  const stopped = useRef(false);
  const epoch = useRef(0);
  const verifiedNow = useRef(false);
  const selectedNow = useRef<string[] | undefined>(undefined);
  const base = workspace === 'admin' ? `/admin/classes/${classId}` : `/teach/${classId}`;

  async function load(selected?: string[]) {
    if (stopped.current) return;
    const requestEpoch = ++epoch.current;
    verifiedNow.current = false; setVerified(false); setLoading(true); setError(null);
    const query = new URLSearchParams({ workspace, ...(selected?.length ? { focus: focusSignature(selected) } : {}) });
    try {
      const response = await fetch(`/api/classes/${classId}/insights?${query}`, { cache: 'no-store', headers: { 'x-class-insights-owner': actorId }, signal: AbortSignal.timeout(15_000) });
      const body: unknown = await response.json().catch(() => null);
      if (!alive.current || requestEpoch !== epoch.current || stopped.current) return;
      const object = body && typeof body === 'object' ? body as Record<string, unknown> : null;
      if (response.status === 401 || object?.code === 'owner_changed' || (typeof object?.actorId === 'string' && object.actorId !== actorId)) {
        stopped.current = true; epoch.current += 1; setChanged(true); setData(null); setLoading(false);
        setError('Your account changed. Reopen this class in the intended account.');
        return;
      }
      if (!response.ok) throw new Error(typeof object?.error === 'string' ? object.error : 'Class insights are unavailable. Try again.');
      if (!validClassInsights(body, actorId, classId, workspace)) throw new Error('The class insights response could not be verified. Reload before choosing follow-up work.');
      if (selected?.length && focusSignature(selected) !== focusSignature(body.suggestion.focusConceptIds)) throw new Error('The selected focus could not be confirmed. Reset the focus and reload.');
      const nextFocus = selected !== undefined ? [...selected] : [...body.suggestion.focusConceptIds];
      selectedNow.current = nextFocus; setFocus(nextFocus); setSelectionMessage(null);
      setData(body); verifiedNow.current = true; setVerified(true);
    } catch (cause) {
      if (alive.current && requestEpoch === epoch.current && !stopped.current) setError(cause instanceof Error ? cause.message : 'Class insights are unavailable. Try again.');
    } finally { if (alive.current && requestEpoch === epoch.current) setLoading(false); }
  }
  useEffect(() => {
    alive.current = true;
    const timer = window.setTimeout(() => { void load(); }, 0);
    const hide = () => { epoch.current += 1; verifiedNow.current = false; setVerified(false); setLoading(false); };
    const verify = () => { void load(selectedNow.current); };
    const visibility = () => { if (document.visibilityState === 'hidden') hide(); else verify(); };
    window.addEventListener('blur', hide); window.addEventListener('focus', verify); document.addEventListener('visibilitychange', visibility);
    return () => { alive.current = false; epoch.current += 1; window.clearTimeout(timer); window.removeEventListener('blur', hide); window.removeEventListener('focus', verify); document.removeEventListener('visibilitychange', visibility); };
    // The server page and fixture key this component by verified account, class and workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actorId, classId, workspace]);

  const report = verified ? data?.report : null;
  const suggestion = verified ? data?.suggestion : null;
  const previewCurrent = Boolean(suggestion && focus.length && focusSignature(focus) === focusSignature(suggestion.focusConceptIds));
  const visible = report?.concepts.filter(concept => (coverage === 'all' || concept.coverageStatus === coverage) && label(concept.conceptId).toLowerCase().includes(search.trim().toLowerCase())) ?? [];
  function toggle(conceptId: string, checked: boolean) {
    if (!verifiedNow.current) return;
    if (checked && focus.length >= 3) { setSelectionMessage('Choose up to three concepts. Remove one to choose another.'); return; }
    const next = checked ? [...focus, conceptId] : focus.filter(id => id !== conceptId);
    selectedNow.current = next; setFocus(next); setSelectionMessage(null);
  }
  const Container = workspace === 'admin' ? 'div' : 'main';

  return <Container><div className={`mx-auto max-w-6xl space-y-6 ${workspace === 'admin' ? '' : 'px-5 py-6 sm:px-8'}`}>
    <Link className="inline-flex min-h-11 items-center text-sm font-bold text-[var(--moss)] underline underline-offset-4" href={base}>← Back to class</Link>
    <AdminPageHeader eyebrow={report?.classroom.name ?? 'Class workspace'} title="Class concept insights" description="Review class coverage from released quizzes, then choose concepts for an editable follow-up quiz." action={<button className={secondary} type="button" disabled={loading || changed} onClick={() => load(selectedNow.current)}>Refresh insights</button>} />
    {changed ? <section aria-label="Class account changed" className="space-y-3 rounded-xl border border-[var(--coral)] bg-[var(--coral-soft)] p-5"><h2 className="text-xl font-bold">Reopen this class</h2><p role="alert" className="text-sm">Your account changed. Previous class insights are hidden and follow-up navigation is paused.</p><Link className={secondary} href={base}>Reopen class workspace</Link></section> : null}
    {error ? <p className="rounded-lg border border-[var(--coral)] bg-[var(--coral-soft)] p-4 text-sm" role="alert" aria-label="Class insights error">{error}</p> : null}
    {!verified && !changed ? <section className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5" aria-label="Class insights verification"><p className="text-sm" role="status">{loading ? 'Verifying class access and released results…' : 'Verify class access to show the latest insights.'}</p><div className="flex flex-wrap gap-3"><button className={secondary} disabled={loading} type="button" onClick={() => load(selectedNow.current)}>Retry class insights</button>{error ? <button className={secondary} disabled={loading} type="button" onClick={() => load()}>Reset focus and reload</button> : null}</div></section> : null}
    {report && suggestion ? <>
      <section className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5" aria-label="Class evidence scope"><h2 className="text-lg font-bold">Released class quizzes only</h2><p className="text-sm leading-6">These observations use released quiz answers from learners currently enrolled in this class. Skipped answers, withheld grades, excused work and suspended grade disputes do not count as weaknesses. Personal practice and skills checks are excluded.</p><p className="text-sm leading-6 text-[var(--muted)]">Repeated logical questions count once per learner. Observed correctness describes these answers; it is not a mastery score or a ranking of learners.</p>{report.view === 'administrator' ? <p className="text-sm font-bold">Administrator aggregate view: each concept needs at least {report.adminMinimumLearners} learners with answered evidence before its numbers are shown.</p> : <p className="text-sm text-[var(--muted)]">Class owner view. Limited coverage is a starting point, not proof of a class-wide weakness.</p>}</section>
      <dl className="grid gap-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:grid-cols-3" aria-label="Class coverage summary"><div><dt className="text-sm text-[var(--muted)]">Currently enrolled</dt><dd className="mt-2 font-mono text-3xl font-bold">{report.rosterCount}</dd></div><div><dt className="text-sm text-[var(--muted)]">Concepts with visible evidence</dt><dd className="mt-2 font-mono text-3xl font-bold">{report.concepts.filter(concept => concept.answeredItems !== null && concept.answeredItems > 0).length}</dd></div><div><dt className="text-sm text-[var(--muted)]">Observed coverage</dt><dd className="mt-2 text-sm leading-6">Each concept below shows its own learner and question coverage. Missing evidence stays unknown.</dd></div></dl>
      <section className="space-y-4" aria-labelledby="class-concepts-heading"><div><h2 id="class-concepts-heading" className="text-2xl font-bold">Concept coverage</h2><p className="mt-2 text-sm text-[var(--muted)]">Choose up to three focus concepts. You can review and edit the proposed questions before assigning anything.</p></div><div className="grid gap-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:grid-cols-2"><label className="grid gap-1.5 text-sm font-bold">Find a concept<input type="search" className="min-h-11 min-w-0 rounded-md border border-[var(--line)] bg-white px-3 font-normal" value={search} onChange={event => setSearch(event.target.value)} /></label><label className="grid gap-1.5 text-sm font-bold">Coverage filter<select aria-label="Coverage filter" className="min-h-11 rounded-md border border-[var(--line)] bg-white px-3 font-normal" value={coverage} onChange={event => setCoverage(event.target.value)}><option value="all">All coverage</option><option value="covered">Broader coverage</option><option value="limited">Limited coverage</option><option value="unknown">No answered evidence</option>{report.view === 'administrator' ? <option value="suppressed">Numbers hidden</option> : null}</select></label></div>
        <p role="status" aria-label="Focus selection" className="text-sm font-bold">{focus.length} of 3 focus concepts selected{selectionMessage ? `. ${selectionMessage}` : ''}</p>
        {visible.length ? <ul className="grid gap-4 md:grid-cols-2" aria-label="Class concept coverage">{visible.map(concept => <li className="min-w-0 space-y-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5" key={concept.conceptId}><div className="flex flex-wrap items-start justify-between gap-3"><h3 className="text-lg font-bold">{label(concept.conceptId)}</h3><span className="rounded-md bg-[var(--moss-soft)] px-2 py-1 text-xs font-bold text-[var(--moss)]">{concept.coverageStatus === 'covered' ? 'Broader coverage' : concept.coverageStatus === 'suppressed' ? 'Numbers hidden' : concept.coverageStatus === 'unknown' ? 'No answered evidence' : 'Limited coverage'}</span></div>
          {concept.coverageStatus === 'suppressed' ? <p className="text-sm leading-6 text-[var(--muted)]">Numbers are hidden because fewer than {report.adminMinimumLearners} learners have answered evidence for this concept. You can still choose it for ordinary class coverage.</p> : concept.coverageStatus === 'unknown' ? <p className="text-sm leading-6 text-[var(--muted)]">No eligible answered evidence yet. This does not indicate a weakness.</p> : <><p className="text-xl font-bold">{concept.observedCorrectPercent}% <span className="text-sm font-normal text-[var(--muted)]">observed correct</span></p><dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-[var(--muted)]">Answered items</dt><dd className="mt-1 font-bold">{concept.correctItems} correct / {concept.answeredItems}</dd></div><div><dt className="text-[var(--muted)]">Learner coverage</dt><dd className="mt-1 font-bold">{concept.coveredLearners} of {report.rosterCount} · {concept.coveragePercent}%</dd></div><div><dt className="text-[var(--muted)]">Different logical questions</dt><dd className="mt-1 font-bold">{concept.distinctQuestions}</dd></div></dl>{concept.coverageStatus === 'limited' ? <p className="text-sm leading-6 text-[var(--muted)]">More learners and different questions are needed before drawing a class-wide conclusion.</p> : null}</>}
          <label className="flex min-h-11 items-center gap-3 text-sm font-bold"><input type="checkbox" className="h-4 w-4 shrink-0 accent-[var(--moss)]" checked={focus.includes(concept.conceptId)} disabled={!focus.includes(concept.conceptId) && focus.length >= 3} onChange={event => toggle(concept.conceptId, event.target.checked)} />Focus on {label(concept.conceptId)}</label>
        </li>)}</ul> : <p className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 text-sm">No concepts match these filters. Adjust the search or coverage filter.</p>}
      </section>
      <section aria-label="Follow-up quiz proposal" className="space-y-4 rounded-xl border border-[var(--moss)] bg-[var(--moss-soft)] p-5 sm:p-6"><div><h2 className="text-2xl font-bold">Build a follow-up quiz</h2><p className="mt-2 text-sm leading-6">The proposal uses fresh questions from the class bank. Creating a draft assigns nothing; choose the class or selected enrolled learners during publication.</p></div><p className="text-sm"><strong>Selected focus:</strong> {focus.length ? focus.map(label).join(' · ') : 'Choose at least one concept above.'}</p><div className="flex flex-wrap gap-3"><button className={secondary} type="button" disabled={!focus.length || loading} onClick={() => load(focus)}>Preview selected concepts</button><button className={secondary} type="button" disabled={loading} onClick={() => load()}>Use suggested focus</button></div>
        {previewCurrent ? <><p className="text-sm leading-6">{suggestion.reason}</p>{suggestion.unavailableConceptIds.length ? <p className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4 text-sm" role="status">No unused question is available for {suggestion.unavailableConceptIds.map(label).join(', ')}. The proposal covers the remaining selected concepts; review the selection in the editor.</p> : null}{suggestion.questions.length ? <><ol className="list-decimal space-y-3 pl-5 text-sm" aria-label="Proposed follow-up questions">{suggestion.questions.map(question => <li key={question.versionId}><strong>{question.title}</strong><span className="ml-2 text-xs capitalize text-[var(--muted)]">{question.difficulty}</span><details className="mt-1"><summary className="min-h-11 cursor-pointer py-3 font-bold underline">Preview {question.title}</summary><p className="mb-3 whitespace-pre-wrap break-words leading-6">{question.prompt}</p><ul className="list-disc space-y-2 pl-5">{question.options.map(option => <li className="whitespace-pre-wrap break-words" key={option.id}>{option.text}</li>)}</ul></details></li>)}</ol><Link className={primary} href={`${base}/assessments/new?focus=${encodeURIComponent(focusSignature(focus))}`} onClick={event => { if (!verifiedNow.current) event.preventDefault(); }}>Open editable quiz draft</Link><p className="text-xs text-[var(--muted)]">The editor checks the latest class results and available questions again. Review the exact selection before saving and assigning.</p></> : <div className="space-y-3"><p className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4 text-sm" role="status">{suggestion.emptyReason}</p><Link className={secondary} href={`${base}/assessments/new`} onClick={event => { if (!verifiedNow.current) event.preventDefault(); }}>Create a quiz from the full bank</Link></div>}</> : <p className="text-sm" role="status">Preview the selected concepts to confirm the proposed questions.</p>}
      </section>
      <p className="text-xs text-[var(--muted)]">Updated {date(report.generatedAt)} UTC. Refresh after score releases, corrections, excusals or enrollment changes.</p>
    </> : null}
  </div></Container>;
}
