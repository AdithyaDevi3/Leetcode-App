'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { LearnerReview } from '@/lib/learner-continuity';

const button = 'inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)] disabled:opacity-50';
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const validReview = (value: unknown): value is LearnerReview => isRecord(value)
  && typeof value.id === 'string' && typeof value.conceptId === 'string' && typeof value.label === 'string'
  && typeof value.dueAt === 'string' && Number.isFinite(Date.parse(value.dueAt))
  && typeof value.intervalDays === 'number' && typeof value.repetitions === 'number'
  && (typeof value.practiceItemId === 'string' || value.practiceItemId === null);

export function LegacySavedReviews({ learnerId }: { learnerId: string }) {
  return <OwnedSavedReviews key={learnerId} learnerId={learnerId} />;
}

function OwnedSavedReviews({ learnerId }: { learnerId: string }) {
  const [reviews, setReviews] = useState<LearnerReview[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const alive = useRef(false);
  const inFlight = useRef(false);
  const [asOf, setAsOf] = useState(0);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    void fetch('/api/learner/reviews', { cache: 'no-store', headers: { 'x-learning-owner': learnerId }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) })
      .then(async response => {
        const body: unknown = await response.json().catch(() => null);
        if (!current) return;
        if (!response.ok || !isRecord(body) || body.learnerId !== learnerId || !Array.isArray(body.reviews) || !body.reviews.every(validReview)) {
          if (response.status === 401 || (isRecord(body) && body.code === 'owner_changed')) setBlocked(true);
          throw new Error('Your earlier saved reviews could not be loaded. Reload them to check the current schedule.');
        }
        setReviews(body.reviews);
        setAsOf(Date.now());
        setError(null);
        setUncertain(false);
      })
      .catch(cause => { if (current) { setReviews(null); setError(cause instanceof Error ? cause.message : 'Your earlier saved reviews could not be loaded.'); } });
    return () => { current = false; controller.abort(); };
  }, [learnerId, refresh]);

  async function snooze(review: LearnerReview) {
    if (inFlight.current || uncertain || blocked) return;
    inFlight.current = true; setBusy(true); setError(null); setMessage(null);
    try {
      const response = await fetch('/api/learner/reviews', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-learning-owner': learnerId },
        body: JSON.stringify({ reviewId: review.id, snoozeDays: 1 }), signal: AbortSignal.timeout(15_000),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!alive.current) return;
      if (!response.ok || !isRecord(body) || body.learnerId !== learnerId || !validReview(body.review) || body.review.id !== review.id) {
        if (response.status === 401 || (isRecord(body) && body.code === 'owner_changed')) { setBlocked(true); setReviews(null); }
        throw new Error('The reminder change could not be confirmed. Reload the saved schedule before changing it again.');
      }
      const saved = body.review;
      setReviews(current => current?.map(item => item.id === review.id ? saved : item) ?? null);
      setMessage('Review moved to tomorrow. Your streak is unchanged.');
    } catch (cause) {
      if (alive.current) { setUncertain(true); setError(cause instanceof Error ? cause.message : 'Reload the saved schedule to check whether the reminder changed.'); }
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  }

  if (reviews?.length === 0 && !error) return null;
  const due = reviews?.filter(review => Date.parse(review.dueAt) <= asOf) ?? [];
  return <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5" aria-label="Earlier saved practice reviews">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Saved reminders</p><h2 className="mt-1 text-xl font-bold">Earlier saved practice reviews</h2></div><Link className="inline-flex min-h-11 items-center text-sm font-bold underline underline-offset-4" href="/roadmap">Explore question bank</Link></div>
    <p className="mt-3 text-sm text-[var(--muted)]">Your earlier reminders remain available here, separate from the account concept estimates above.</p>
    {reviews === null && !error ? <p className="mt-3 text-sm" role="status">Loading saved reminders…</p> : null}
    {reviews?.length ? <><p className="mt-3 text-sm font-bold">{due.length} earlier {due.length === 1 ? 'review' : 'reviews'} due · {reviews.length} saved {reviews.length === 1 ? 'reminder' : 'reminders'}</p><ul className="mt-4 space-y-3">{reviews.map(review => <li className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--line)] bg-white p-4" key={review.id}><div><h3 className="font-bold">{review.label}</h3><p className="mt-1 text-sm text-[var(--muted)]">{Date.parse(review.dueAt) <= asOf ? 'Due now' : `Due ${new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(review.dueAt))} UTC`} · repetition {review.repetitions + 1}</p></div><div className="flex flex-wrap gap-2">{review.practiceItemId ? <a className={button} href={`/practice?problem=${encodeURIComponent(review.practiceItemId)}`} aria-label={`Open earlier review ${review.label}`}>Review now</a> : null}<button className={button} disabled={busy || uncertain || blocked} type="button" aria-label={`Move earlier review ${review.label} to tomorrow`} onClick={() => void snooze(review)}>Tomorrow</button></div></li>)}</ul></> : null}
    {message ? <p className="mt-3 text-sm" role="status" aria-label="Earlier review status">{message}</p> : null}
    {error ? <p className="mt-3 text-sm" role="alert" aria-label="Earlier review error">{error}</p> : null}
    {blocked ? <a className={`${button} mt-3`} href="/dashboard">Reopen dashboard</a> : error ? <button className={`${button} mt-3`} type="button" disabled={busy} onClick={() => { setReviews(null); setError(null); setRefresh(value => value + 1); }}>Reload saved reviews</button> : null}
  </section>;
}
