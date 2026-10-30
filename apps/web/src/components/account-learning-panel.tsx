'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { LEARNING_ALGORITHM_VERSION, type LearningConceptEstimate } from '@leetcode-app/domain';
import { practiceItems } from '@/lib/content';
import type { LearningApiResponse, LearningReviewRequest, LearningReviewResponse } from '@/lib/learning-api-types';
import { useRecommendationSelection } from './recommendation-selection';

const primary = 'inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--moss)] px-4 py-2 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)] disabled:cursor-not-allowed disabled:opacity-50';
const secondary = 'inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--line)] bg-white px-4 py-2 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)] disabled:cursor-not-allowed disabled:opacity-50';
const labelFor = (value: string) => value.replace(/[-_]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
const hrefFor = (id: string) => `/practice?problem=${encodeURIComponent(id)}`;
const dateFor = (value: string) => `${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(new Date(value))} UTC`;
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const percentage = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const timestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));

function validSnapshot(value: unknown, learnerId: string): value is LearningApiResponse {
  if (!isRecord(value) || value.learnerId !== learnerId || !isRecord(value.snapshot) || !isRecord(value.plan)) return false;
  const { snapshot, plan } = value;
  if (value.decisionKey !== undefined && value.decisionKey !== null
    && (typeof value.decisionKey !== 'string' || !/^[a-f0-9]{64}$/.test(value.decisionKey))) return false;
  if (snapshot.algorithmVersion !== LEARNING_ALGORITHM_VERSION || plan.algorithmVersion !== LEARNING_ALGORITHM_VERSION
    || !timestamp(snapshot.generatedAt) || typeof snapshot.optOut !== 'boolean' || !Array.isArray(snapshot.concepts)
    || !isRecord(snapshot.sourceSummary) || !isRecord(snapshot.processing)
    || !['ready', 'collecting', 'disabled'].includes(String(plan.status)) || !Array.isArray(plan.recommendations)) return false;
  if (!['releasedQuizItems', 'verifiedPracticeItems', 'independentItems'].every(key => integer((snapshot.sourceSummary as Record<string, unknown>)[key]))
    || (snapshot.sourceSummary.diagnosticItems !== undefined && !integer(snapshot.sourceSummary.diagnosticItems))
    || typeof snapshot.processing.pending !== 'boolean' || !integer(snapshot.processing.remainingSources) || !integer(snapshot.processing.processedSources)) return false;
  if (!snapshot.concepts.every(concept => isRecord(concept) && typeof concept.conceptId === 'string'
    && percentage(concept.score) && typeof concept.confidence === 'number' && concept.confidence >= 0 && concept.confidence <= 1
    && isRecord(concept.uncertainty) && percentage(concept.uncertainty.lower) && percentage(concept.uncertainty.upper)
    && concept.uncertainty.lower <= concept.uncertainty.upper && ['limited', 'developing', 'established'].includes(String(concept.evidenceStatus))
    && integer(concept.independentItems) && timestamp(concept.lastEvidenceAt) && timestamp(concept.reviewDueAt) && integer(concept.reviewRevision))) return false;
  return plan.recommendations.every(item => isRecord(item) && typeof item.practiceId === 'string' && Boolean(item.practiceId)
    && typeof item.label === 'string' && Array.isArray(item.conceptIds) && item.conceptIds.every(id => typeof id === 'string')
    && ['foundation', 'intermediate', 'advanced'].includes(String(item.difficulty)) && integer(item.estimatedMinutes)
    && typeof item.reason === 'string' && ['recovery', 'review', 'diagnostic', 'broaden'].includes(String(item.reasonKind))
    && ['unknown', 'limited', 'developing', 'established'].includes(String(item.evidenceStatus)));
}

function validRequest(value: unknown): value is LearningReviewRequest {
  return isRecord(value) && typeof value.conceptId === 'string' && Boolean(value.conceptId)
    && integer(value.expectedRevision) && [1, 3, 7].includes(Number(value.days))
    && typeof value.days === 'number' && typeof value.requestKey === 'string' && value.requestKey.length > 0 && value.requestKey.length <= 128;
}

function validReceipt(value: unknown, request: LearningReviewRequest, learnerId: string): value is LearningReviewResponse {
  if (!validSnapshot(value, learnerId) || !('reviewReceipt' in value) || !isRecord(value.reviewReceipt)) return false;
  const receipt = value.reviewReceipt;
  return receipt.conceptId === request.conceptId && receipt.requestKey === request.requestKey
    && receipt.previousRevision === request.expectedRevision && receipt.revision === request.expectedRevision + 1
    && timestamp(receipt.dueAt);
}

/** The keyed boundary prevents a previous account's async state from rendering after an owner change. */
export function AccountLearningPanel({ learnerId }: { learnerId: string }) {
  return <OwnedLearningPanel key={learnerId} learnerId={learnerId} />;
}

function OwnedLearningPanel({ learnerId }: { learnerId: string }) {
  const [data, setData] = useState<LearningApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [ownerChanged, setOwnerChanged] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [pending, setPending] = useState<LearningReviewRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const alive = useRef(false);
  const inFlight = useRef(false);
  const pendingRequest = useRef<LearningReviewRequest | null>(null);
  const restored = useRef(false);
  const storageKey = `method:learning-review:${learnerId}`;
  const selection = useRecommendationSelection({
    learnerId, blocked: loading || busy || Boolean(data?.snapshot.optOut), ownerChanged,
    onOwnerChanged: () => { setOwnerChanged(true); setData(null); },
    onRefresh: () => { setLoading(true); setData(null); setError(null); setRefresh(value => value + 1); },
  });

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    const load = async () => {
      if (!restored.current) {
        restored.current = true;
        try {
          const saved: unknown = JSON.parse(window.sessionStorage.getItem(storageKey) ?? 'null');
          if (validRequest(saved)) {
            pendingRequest.current = saved;
            setPending(saved);
            setMessage('An earlier review change needs confirmation. Retry it to recover the saved result.');
          }
        } catch { /* Account evidence stays on the server when browser recovery is unavailable. */ }
      }
      try {
        const response = await fetch('/api/learner/learning', {
          cache: 'no-store', headers: { 'x-learning-owner': learnerId },
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
        });
        const body: unknown = await response.json().catch(() => null);
        if (!current) return;
        if (!response.ok) {
          if (response.status === 401 || (isRecord(body) && body.code === 'owner_changed')) {
            setOwnerChanged(true);
            setData(null);
          }
          throw new Error(isRecord(body) && typeof body.error === 'string' ? body.error : 'Your account learning plan is unavailable. Try again in a moment.');
        }
        if (!validSnapshot(body, learnerId)) throw new Error('We could not confirm your account learning plan. Try loading it again.');
        setData(body);
        setError(null);
        setConflict(false);
      } catch (cause) {
        if (!current) return;
        setData(null);
        setError(cause instanceof Error && cause.name !== 'AbortError' ? cause.message : 'Your account learning plan is unavailable. Try again in a moment.');
      } finally {
        if (current) setLoading(false);
      }
    };
    void load();
    return () => { current = false; controller.abort(); };
  }, [learnerId, refresh, storageKey]);

  const reload = () => {
    if (busy || selection.busy || ownerChanged) return;
    setLoading(true);
    setData(null);
    setError(null);
    setRefresh(value => value + 1);
  };

  const remember = (request: LearningReviewRequest | null) => {
    pendingRequest.current = request;
    setPending(request);
    try {
      if (request) window.sessionStorage.setItem(storageKey, JSON.stringify(request));
      else window.sessionStorage.removeItem(storageKey);
    } catch { /* The original request also remains in memory for a safe retry. */ }
  };

  const snooze = async (concept?: LearningConceptEstimate) => {
    if (inFlight.current || selection.busy || ownerChanged || conflict || loading || (data?.snapshot.optOut && !pendingRequest.current)) return;
    const request = pendingRequest.current ?? (concept ? {
      conceptId: concept.conceptId, expectedRevision: concept.reviewRevision, days: 1 as const, requestKey: crypto.randomUUID(),
    } : null);
    if (!request) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);
    remember(request);
    try {
      const response = await fetch('/api/learner/learning/reviews', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-learning-owner': learnerId },
        body: JSON.stringify(request), signal: AbortSignal.timeout(15_000),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!alive.current) return;
      if (!response.ok) {
        const code = isRecord(body) ? body.code : null;
        if (response.status === 401 || code === 'owner_changed') { setOwnerChanged(true); setData(null); }
        else if (response.status === 409) { remember(null); setConflict(true); }
        else if ([400, 413].includes(response.status)) remember(null);
        throw new Error(isRecord(body) && typeof body.error === 'string' ? body.error : 'We could not confirm that review change. Retry the same request safely.');
      }
      if (!validReceipt(body, request, learnerId)) throw new Error('We could not confirm the saved review change. Retry to recover its receipt.');
      remember(null);
      setData(body);
      setMessage(`Review moved to ${dateFor(body.reviewReceipt.dueAt)}. Your class grades and learning estimate are unchanged.`);
    } catch (cause) {
      if (alive.current) setError(cause instanceof Error ? cause.message : 'We could not confirm that review change. Retry the same request safely.');
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  };

  if (ownerChanged) return <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5" aria-label="Account learning plan">
    <h2 className="text-xl font-bold">Reopen your account learning plan</h2>
    <p className="mt-3 text-sm" role="alert" aria-label="Learning account changed">Your signed-in account changed. Reopen the dashboard to load its own evidence and review schedule.</p>
    <a className={`${secondary} mt-4`} href="/dashboard">Reopen dashboard</a>
  </section>;

  if (loading || !data) return <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5" aria-label="Account learning plan">
    <p className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Account learning</p>
    <h2 className="mt-1 text-xl font-bold">{loading ? 'Loading your account plan' : 'Your learning plan is temporarily unavailable'}</h2>
    {loading ? <p className="mt-3 text-sm" role="status">Loading trusted practice and released quiz evidence…</p> : <>
      <p className="mt-3 text-sm" role="alert" aria-label="Learning plan error">{error}</p>
      <p className="mt-3 text-sm text-[var(--muted)]">Your saved account evidence remains separate from this device’s practice scores. Explore the question bank while your plan reconnects.</p>
      <div className="mt-4 flex flex-wrap gap-3"><button type="button" className={secondary} onClick={reload}>Retry account plan</button><Link href="/roadmap" className={secondary}>Explore question bank</Link></div>
    </>}
    {pending ? <div className="mt-4 border-t border-[var(--line)] pt-4"><p className="text-sm">A review change still needs confirmation.</p><button className={`${secondary} mt-3`} disabled={loading || busy} type="button" onClick={() => void snooze()}>{busy ? 'Confirming review…' : 'Retry review change'}</button></div> : null}
    {selection.recovery}
  </section>;

  const { snapshot, plan } = data;
  const disabled = snapshot.optOut || plan.status === 'disabled';
  const due = disabled ? [] : snapshot.concepts.filter(concept => Date.parse(concept.reviewDueAt) <= Date.parse(snapshot.generatedAt));
  const known = new Set(snapshot.concepts.map(concept => concept.conceptId));
  const unknown = [...new Set(plan.recommendations.flatMap(item => item.conceptIds))].filter(id => !known.has(id));
  const concepts = showAll ? snapshot.concepts : snapshot.concepts.slice(0, 6);
  const reasons = { recovery: 'Targeted practice', review: 'Due review', diagnostic: 'Diagnostic practice', broaden: 'Broaden your practice' };

  return <section className="space-y-6 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6" aria-label="Account learning plan">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Account learning</p><h2 className="mt-1 text-2xl font-bold">{disabled ? 'Follow the standard curriculum' : 'Practice with a clear purpose'}</h2></div>
      <button className={secondary} disabled={busy || selection.busy} type="button" onClick={reload}>Refresh plan</button>
    </div>
    {disabled ? <>
      <p className="text-sm">Personalization is off. These activities follow the same curriculum order for everyone; they make no claims about your strengths or weaknesses.</p>
      <ol className="space-y-3" aria-label="Standard curriculum">{practiceItems.slice(0, 3).map((item, index) => <li className="rounded-lg border border-[var(--line)] bg-white p-4" key={item.id}><p className="text-sm text-[var(--muted)]">Curriculum step {index + 1} · {item.estimatedMinutes} min</p><h3 className="mt-1 font-bold">{item.label}</h3><a className={`${primary} mt-3`} href={hrefFor(item.id)}>Start {item.label}</a></li>)}</ol>
      <Link className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4" href="/settings">Change personalization settings</Link>
    </> : <>
      <p className="text-sm text-[var(--muted)]">Synced across your devices from released quiz results, your skills check, and server-recorded practice verification. Estimates guide practice; your class grades stay separate.</p>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--line)] bg-white p-4"><div><h3 className="font-bold">Optional skills check</h3><p className="mt-1 text-sm text-[var(--muted)]">Ten questions to build your first concept picture. Save and resume across devices.</p></div><Link className={secondary} href="/diagnostic">Open skills check</Link></div>
      {snapshot.processing.pending ? <p className="rounded-lg border border-[var(--line)] bg-white p-3 text-sm" role="status">Updating your account evidence. This plan reflects the evidence processed so far; refresh to check for the latest results.</p> : null}
      <dl className="grid grid-cols-2 gap-4 rounded-lg bg-white p-4 sm:grid-cols-3" aria-label="Account evidence sources"><div><dt className="text-sm text-[var(--muted)]">Released quiz items</dt><dd className="text-2xl font-bold">{snapshot.sourceSummary.releasedQuizItems}</dd></div><div><dt className="text-sm text-[var(--muted)]">Verified practice items</dt><dd className="text-2xl font-bold">{snapshot.sourceSummary.verifiedPracticeItems}</dd></div>{snapshot.sourceSummary.diagnosticItems ? <div><dt className="text-sm text-[var(--muted)]">Skills check items</dt><dd className="text-2xl font-bold">{snapshot.sourceSummary.diagnosticItems}</dd></div> : null}<div><dt className="text-sm text-[var(--muted)]">Independent items</dt><dd className="text-2xl font-bold">{snapshot.sourceSummary.independentItems}</dd></div></dl>
      <section aria-labelledby="account-concepts-heading">
        <h3 className="text-lg font-bold" id="account-concepts-heading">Your concept picture</h3>
        <p className="mt-2 text-sm text-[var(--muted)]">Limited evidence is a starting point. Different questions build confidence; repeating the same item does not count as extra coverage.</p>
        {snapshot.concepts.length === 0 ? <div className="mt-3 rounded-lg border border-[var(--line)] bg-white p-4 text-sm"><p>No account evidence yet. Start a diagnostic practice activity to build your first estimate. An unknown concept is not a weakness.</p><p className="mt-3 text-[var(--muted)]">Older practice history may not contribute to these estimates. A new verification adds evidence.</p></div> : <ul className="mt-4 grid gap-3 sm:grid-cols-2" aria-label="Concept estimates">{concepts.map(concept => <li className="rounded-lg border border-[var(--line)] bg-white p-4" key={concept.conceptId}>
          <div className="flex flex-wrap items-start justify-between gap-2"><h4 className="font-bold">{labelFor(concept.conceptId)}</h4><span className="rounded bg-[var(--moss-soft)] px-2 py-1 text-xs font-bold">{labelFor(concept.evidenceStatus)} evidence</span></div>
          <p className="mt-3 text-lg font-bold">{concept.score}/100 <span className="text-sm font-normal text-[var(--muted)]">estimate</span></p>
          <p className="mt-1 text-sm text-[var(--muted)]">Model range {concept.uncertainty.lower}–{concept.uncertainty.upper}. This estimate can change with more evidence.</p>
          <p className="mt-2 text-sm">{concept.independentItems} independent {concept.independentItems === 1 ? 'item' : 'items'} · {concept.evidenceStatus === 'limited' ? 'Too early for a firm conclusion.' : concept.evidenceStatus === 'developing' ? 'Keep testing this concept in different situations.' : 'Broader evidence supports this estimate.'}</p>
        </li>)}</ul>}
        {snapshot.concepts.length > 6 ? <button className={`${secondary} mt-3`} type="button" aria-expanded={showAll} onClick={() => setShowAll(value => !value)}>{showAll ? 'Show fewer concepts' : `Show all ${snapshot.concepts.length} concepts`}</button> : null}
        {unknown.length ? <p className="mt-3 text-sm text-[var(--muted)]">Still unknown: {unknown.map(labelFor).join(', ')}. Diagnostic practice helps fill these gaps in evidence.</p> : null}
      </section>
      <section aria-labelledby="account-recommendations-heading"><h3 className="text-lg font-bold" id="account-recommendations-heading">Recommended algorithms</h3>
        <ol className="mt-4 space-y-3" aria-label="Account practice recommendations">{plan.recommendations.map((item, index) => <li className="rounded-lg border border-[var(--line)] bg-white p-4" key={item.practiceId}>
          <div className="flex flex-wrap items-start justify-between gap-2"><p className="text-sm font-bold text-[var(--moss)]">{index === 0 ? 'Next up · ' : ''}{reasons[item.reasonKind]}</p><span className="text-sm text-[var(--muted)]">{item.estimatedMinutes} min · {item.difficulty}</span></div>
          <h4 className="mt-2 text-lg font-bold">{item.label}</h4><p className="mt-1 text-sm text-[var(--muted)]">{item.conceptIds.map(labelFor).join(' · ')}</p>
          <details className="mt-2"><summary className="min-h-11 cursor-pointer py-3 text-sm font-bold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)]">Why this question?</summary><p className="text-sm leading-6">{item.reason}</p><p className="mt-2 text-sm text-[var(--muted)]">{item.evidenceStatus === 'unknown' ? 'This recommendation explores an unknown concept; it does not label it a weakness.' : `${labelFor(item.evidenceStatus)} evidence. Your next result can change this estimate.`}</p></details>
          <a className={`${primary} mt-3`} href={hrefFor(item.practiceId)} onClick={event => selection.start(event, item.practiceId, data.decisionKey)} aria-disabled={selection.busy || undefined}>Start {item.label}</a>
        </li>)}</ol>
        {!plan.recommendations.length ? <p className="mt-3 text-sm">No recommended activity is available yet. <Link className="font-bold underline" href="/roadmap">Explore the question bank</Link> to choose your next practice.</p> : null}
      </section>
      <section className="border-t border-[var(--line)] pt-5" aria-labelledby="account-reviews-heading"><h3 className="text-lg font-bold" id="account-reviews-heading">{due.length ? `${due.length} review${due.length === 1 ? '' : 's'} due` : 'Your review schedule'}</h3>
        <p className="mt-2 text-sm text-[var(--muted)]">A delayed return to a concept helps check what you remember. Moving a review changes its date, not your estimate or class grade.</p>
        {due.length ? <ul className="mt-4 space-y-3" aria-label="Due concept reviews">{due.map(concept => {
          const activity = plan.recommendations.find(item => item.conceptIds.includes(concept.conceptId));
          return <li className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--line)] bg-white p-4" key={concept.conceptId}><div><h4 className="font-bold">{labelFor(concept.conceptId)}</h4><p className="mt-1 text-sm text-[var(--muted)]">Due {dateFor(concept.reviewDueAt)}</p></div><div className="flex flex-wrap gap-2">{activity ? <a className={primary} href={hrefFor(activity.practiceId)} onClick={event => selection.start(event, activity.practiceId, data.decisionKey)} aria-disabled={selection.busy || undefined} aria-label={`Review ${labelFor(concept.conceptId)} now`}>Review now</a> : <Link className={secondary} href="/roadmap">Find practice</Link>}<button className={secondary} type="button" disabled={busy || selection.busy || Boolean(pending) || conflict} onClick={() => void snooze(concept)} aria-label={`Review ${labelFor(concept.conceptId)} tomorrow`}>Tomorrow</button></div></li>;
        })}</ul> : <p className="mt-3 text-sm">{snapshot.concepts.length ? 'You’re caught up. Reviews are scheduled from your saved account evidence.' : 'Your first trusted result will start your review schedule.'}</p>}
        {!due.length && snapshot.concepts.length ? <p className="mt-2 text-sm text-[var(--muted)]">Next review: {dateFor([...snapshot.concepts].sort((a, b) => a.reviewDueAt.localeCompare(b.reviewDueAt))[0].reviewDueAt)}.</p> : null}
      </section>
      <p className="text-xs text-[var(--muted)]">Updated {dateFor(snapshot.generatedAt)}. Browser-only scores and manual continue actions do not change your account estimate.</p>
    </>}
    {message ? <p className="text-sm" role="status" aria-label="Review change status">{message}</p> : null}
    {error ? <p className="text-sm" role="alert" aria-label="Learning review error">{error}</p> : null}
    {selection.recovery}
    {conflict ? <div className="space-y-3"><p className="text-sm">The review schedule changed. Load the latest plan before choosing a new date.</p><button className={secondary} disabled={busy} type="button" onClick={reload}>Load latest review schedule</button></div> : pending ? <button className={secondary} disabled={busy} type="button" onClick={() => void snooze()}>{busy ? 'Confirming review…' : 'Retry review change'}</button> : null}
  </section>;
}
