'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { SiteNavigation } from '@/components/site-navigation';
import { buildLocalLearningPlan, readLocalLearnerProfile, type LocalLearnerProfile } from '@/lib/local-learner';
import { readLocalPracticeHistory, type LocalPracticeHistoryEntry } from '@/lib/local-practice-history';
import { summarizeLearningProgress, type LearningProgressSummary } from '@/lib/learning-progress';
import { readLocalMastery, type LocalMasteryState } from '@/lib/local-mastery';
import {
  loadLearnerPracticeHistory,
  loadLearnerProfile,
  loadLearnerReviews,
  snoozeLearnerReview,
  type LearnerProfileSource,
  type LearnerReview,
} from '@/lib/learner-continuity';

const practiceHref = (practiceItemId: string) =>
  `/practice?problem=${encodeURIComponent(practiceItemId)}`;

export function LocalLearnerDashboard() {
  const [profile, setProfile] = useState<LocalLearnerProfile | null>(null);
  const [history, setHistory] = useState<LocalPracticeHistoryEntry[]>([]);
  const [progress, setProgress] = useState<LearningProgressSummary | null>(null);
  const [mastery, setMastery] = useState<LocalMasteryState>({});
  const [profileSource, setProfileSource] = useState<LearnerProfileSource>('none');
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState<LearnerReview[]>([]);
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);
  const [asOf, setAsOf] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const localHistory = readLocalPracticeHistory();
      const localProfile = readLocalLearnerProfile();
      setProfile(localProfile);
      setProfileSource(localProfile ? 'device' : 'none');
      setHistory(localHistory);
      setProgress(summarizeLearningProgress(localHistory));
      setMastery(readLocalMastery());
      void Promise.all([loadLearnerProfile(), loadLearnerPracticeHistory(), loadLearnerReviews()]).then(([profileResult, durableHistory, durableReviews]) => {
        setProfile(profileResult.profile);
        setProfileSource(profileResult.source);
        setHistory(durableHistory);
        setProgress(summarizeLearningProgress(durableHistory));
        setReviews(durableReviews);
        setAsOf(Date.now());
        setLoading(false);
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const plan = profile ? buildLocalLearningPlan(profile, history, new Date(), mastery) : null;
  const nextPractice = plan?.recommendations[0];
  const dueReviews = reviews.filter((review) => new Date(review.dueAt).getTime() <= asOf);
  const snooze = async (review: LearnerReview) => {
    setReviewMessage('Snoozing review…');
    if (!await snoozeLearnerReview(review.id, 1)) {
      setReviewMessage('Could not snooze that review. Please try again.');
      return;
    }
    setReviews((current) => current.map((item) => item.id === review.id
      ? { ...item, dueAt: new Date(Math.max(Date.now(), new Date(item.dueAt).getTime()) + 86_400_000).toISOString() }
      : item));
    setReviewMessage('Review moved to tomorrow. Your streak is unchanged.');
  };

  return <main className="min-h-screen bg-[var(--paper)] px-6 py-8 text-[var(--ink)] sm:py-12"><div className="mx-auto max-w-5xl"><SiteNavigation currentPath="/dashboard" /><section className="mx-auto mt-10 max-w-3xl rounded-xl bg-white p-6 shadow-sm sm:p-8">
    <p className="mt-8 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Learner dashboard</p><h1 className="mt-2 text-3xl font-bold">Your next learning step</h1>
    {loading && profile === null ? <p className="mt-6" aria-live="polite">Loading your learning plan…</p> : null}
    {!loading && profile === null ? <div className="mt-6 space-y-3"><p>Set your goals first, and we’ll create a focused learning plan.</p><Link className="inline-block rounded bg-[var(--moss)] px-4 py-2 font-semibold text-white" href="/onboarding">Start onboarding</Link></div> : null}
    {profile && plan ? <div className="mt-6 space-y-7">
      <p className="text-sm text-[var(--muted)]" aria-live="polite">{profileSource === 'account' ? 'Plan synced with your account.' : 'Plan saved on this device. Sign in to use it everywhere.'}</p>
      {profileSource === 'account' ? <section aria-labelledby="reviews-heading" className="border border-[var(--line)] bg-[var(--surface)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Spaced review</p><h2 className="mt-1 text-xl font-bold" id="reviews-heading">{dueReviews.length ? `${dueReviews.length} review${dueReviews.length === 1 ? '' : 's'} due` : 'You’re caught up'}</h2></div><Link className="font-semibold underline underline-offset-4" href="/roadmap">Explore question bank</Link></div>
        {dueReviews.length ? <ol className="mt-4 space-y-3">{dueReviews.slice(0, 3).map((review) => <li className="flex flex-wrap items-center justify-between gap-3 border border-[var(--line)] p-4" key={review.id}><div><h3 className="font-bold capitalize">{review.label}</h3><p className="mt-1 text-sm text-[var(--muted)]">Review {review.conceptId.replace(/[-_]+/g, ' ')} · repetition {review.repetitions + 1}</p></div><div className="flex flex-wrap gap-3">{review.practiceItemId ? <Link className="rounded bg-[var(--moss)] px-3 py-2 text-sm font-semibold text-white" href={practiceHref(review.practiceItemId)}>Review now</Link> : null}<button className="rounded border border-[var(--line)] px-3 py-2 text-sm font-semibold" onClick={() => void snooze(review)} type="button">Tomorrow</button></div></li>)}</ol> : <p className="mt-3 text-sm text-[var(--muted)]">Complete verified practice to schedule concept reviews at useful intervals.</p>}
        {reviewMessage ? <p className="mt-3 text-sm text-[var(--muted)]" aria-live="polite">{reviewMessage}</p> : null}
      </section> : null}
      <section aria-labelledby="progress-heading" className="border border-[var(--line)] bg-[var(--paper)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Your momentum</p><h2 className="mt-1 text-xl font-bold" id="progress-heading">Progress you can build on</h2></div><Link className="font-semibold underline underline-offset-4" href="/history">View history</Link></div>
        <dl className="mt-5 grid gap-4 sm:grid-cols-4"><div><dt className="text-sm text-[var(--muted)]">Completed</dt><dd className="text-2xl font-bold">{progress?.completedItems ?? 0}</dd></div><div><dt className="text-sm text-[var(--muted)]">Active days</dt><dd className="text-2xl font-bold">{progress?.activeDays ?? 0}</dd></div><div><dt className="text-sm text-[var(--muted)]">Current streak</dt><dd className="text-2xl font-bold">{progress?.currentStreak ?? 0} <span className="text-sm font-medium">days</span></dd></div><div><dt className="text-sm text-[var(--muted)]">Average score</dt><dd className="text-2xl font-bold">{progress?.averageScore === null || progress?.averageScore === undefined ? '—' : `${progress.averageScore}/100`}</dd></div></dl>
        {progress?.completedItems === 0 ? <p className="mt-4 text-sm text-[var(--muted)]">Finish one practice item to start tracking your momentum.</p> : null}
      </section>
      <section aria-labelledby="plan-heading">
        <h2 className="text-xl font-bold" id="plan-heading">Recommended algorithms</h2>
        <p className="mt-2 text-[var(--ink)]">{plan.explanation}</p>
        <p className="mt-2 text-sm text-[var(--muted)]">Pace: <span className="font-semibold capitalize">{plan.pace}</span></p>
        <ol className="mt-4 space-y-3">
          {plan.recommendations.map((recommendation, index) => <li className="border border-[var(--line)] p-4" key={recommendation.practiceItemId}>
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold text-[var(--muted)]">{index === 0 ? 'Next up' : `Option ${index + 1}`}</p><h3 className="font-bold">{recommendation.label}</h3></div><span className="text-sm text-[var(--muted)]">{recommendation.estimatedMinutes} min · {recommendation.difficulty}</span></div>
            <p className="mt-2 text-sm text-[var(--muted)]">{recommendation.reasons.join(' · ')}</p>
          </li>)}
        </ol>
        {nextPractice ? <a className="mt-5 inline-block rounded bg-[var(--moss)] px-4 py-2 font-semibold text-white" href={practiceHref(nextPractice.practiceItemId)}>Start {nextPractice.label}</a> : null}
      </section>
      <section aria-labelledby="profile-heading" className="border-t pt-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold" id="profile-heading">Profile at a glance</h2><Link className="font-semibold underline underline-offset-4" href="/settings">Edit settings</Link></div><dl className="mt-4 grid gap-4 sm:grid-cols-4"><div><dt className="text-sm text-[var(--muted)]">Goal</dt><dd className="font-medium">{profile.goal.replace('_', ' ')}</dd></div><div><dt className="text-sm text-[var(--muted)]">Experience</dt><dd className="font-medium">{profile.experience}</dd></div><div><dt className="text-sm text-[var(--muted)]">Weekly time</dt><dd className="font-medium">{profile.weeklyMinutes} minutes</dd></div><div><dt className="text-sm text-[var(--muted)]">Language</dt><dd className="font-medium capitalize">{profile.preferredLanguage}</dd></div></dl></section>
    </div> : null}
  </section></div></main>;
}
