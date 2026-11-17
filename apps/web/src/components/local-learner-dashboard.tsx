'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Braces, ChartNoAxesCombined, Code2, Compass, GraduationCap, LibraryBig } from 'lucide-react';

import { SiteNavigation } from '@/components/site-navigation';
import { AccountLearningPanel } from '@/components/account-learning-panel';
import { LegacySavedReviews } from '@/components/legacy-saved-reviews';
import { buildLocalLearningPlan, readLocalLearnerProfile, type LocalLearnerProfile } from '@/lib/local-learner';
import { readLocalPracticeHistory, type LocalPracticeHistoryEntry } from '@/lib/local-practice-history';
import { summarizeLearningProgress, type LearningProgressSummary } from '@/lib/learning-progress';
import { readLocalMastery, type LocalMasteryState } from '@/lib/local-mastery';
import {
  loadLearnerPracticeHistory,
  loadLearnerProfile,
  type LearnerProfileSource,
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
  const [profileUnavailable, setProfileUnavailable] = useState(false);
  const [identity, setIdentity] = useState<{ status: 'checking' | 'guest' | 'account' | 'unavailable'; learnerId: string | null; displayName: string | null }>({ status: 'checking', learnerId: null, displayName: null });

  useEffect(() => {
    let current = true;
    let generation = 0;
    const load = async () => {
      const request = ++generation;
      setIdentity({ status: 'checking', learnerId: null, displayName: null });
      setLoading(true);
      setProfileUnavailable(false);
      setProfile(null);
      setHistory([]);
      setProgress(null);
      setMastery({});
      const localHistory = readLocalPracticeHistory();
      const localProfile = readLocalLearnerProfile();
      const continuity = Promise.all([loadLearnerProfile(), loadLearnerPracticeHistory()]);
      let nextIdentity: typeof identity = { status: 'unavailable', learnerId: null, displayName: null };
      try {
        const response = await fetch('/api/viewer', { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
        const body = await response.json() as { viewer?: { id?: unknown; displayName?: unknown } | null };
        if (response.ok && body.viewer === null) nextIdentity = { status: 'guest', learnerId: null, displayName: null };
        else if (response.ok && typeof body.viewer?.id === 'string' && body.viewer.id) nextIdentity = { status: 'account', learnerId: body.viewer.id, displayName: typeof body.viewer.displayName === 'string' ? body.viewer.displayName : null };
      } catch { /* Keep account identity unknown until it can be checked again. */ }
      if (!current || generation !== request) return;
      setIdentity(nextIdentity);
      if (nextIdentity.status === 'guest') {
        setProfile(localProfile);
        setProfileSource(localProfile ? 'device' : 'none');
        setHistory(localHistory);
        setProgress(summarizeLearningProgress(localHistory));
        setMastery(readLocalMastery());
      }
      const [profileResult, durableHistory] = await continuity;
      if (!current || generation !== request) return;
      if (nextIdentity.status === 'account') {
        const sameOwner = profileResult.source === 'account' && profileResult.learnerId === nextIdentity.learnerId;
        setProfile(sameOwner ? profileResult.profile : null);
        setProfileSource(sameOwner ? 'account' : 'none');
        setProfileUnavailable(!sameOwner);
        setHistory(sameOwner ? durableHistory : []);
        setProgress(sameOwner ? summarizeLearningProgress(durableHistory) : null);
      } else if (nextIdentity.status === 'guest' && profileResult.source !== 'account') {
        setProfile(profileResult.profile);
        setProfileSource(profileResult.source);
        setHistory(durableHistory);
        setProgress(summarizeLearningProgress(durableHistory));
      } else {
        setProfile(null);
        setProfileSource('none');
        setProfileUnavailable(true);
      }
      setLoading(false);
    };
    const timer = window.setTimeout(() => { void load(); }, 0);
    const refresh = () => { void load(); };
    const visibility = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      current = false;
      generation += 1;
      window.clearTimeout(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', visibility);
    };
    // Each focus checks identity before displaying account evidence or a device plan.
  }, []);

  const plan = profile && identity.status === 'guest' ? buildLocalLearningPlan(profile, profile.personalizationOptOut ? [] : history, new Date(), profile.personalizationOptOut ? {} : mastery) : null;
  const nextPractice = plan?.recommendations[0];

  return <main className="min-h-screen bg-[var(--paper)] px-4 py-6 text-[var(--ink)] sm:px-6 sm:py-8"><div className="mx-auto w-full max-w-[90rem]"><SiteNavigation currentPath="/dashboard" /><section className="mt-6 w-full rounded-xl bg-white p-4 shadow-sm sm:p-6 lg:p-8">
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <section className="space-y-6" aria-labelledby="learning-step-heading">
        <div><p className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Learner dashboard</p><div className="mt-2 flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-3xl font-bold" id="learning-step-heading">{identity.displayName ? `Welcome, ${identity.displayName}` : 'Your next learning step'}</h1><p className="mt-3 max-w-xl text-sm leading-6 text-[var(--muted)]">Choose a focused task, then track the progress you build.</p></div><Link className="inline-flex min-h-11 items-center rounded-md bg-[var(--moss)] px-4 text-sm font-bold text-white" href="/classes">Open a shared session</Link></div></div>
        {loading && profile === null ? <p aria-live="polite">Loading your learning plan…</p> : null}
        {!loading && profileUnavailable ? <p className="text-sm" role="status">Your account profile could not be confirmed. <Link className="font-bold underline" href="/settings">Open settings</Link> to reload the correct profile.</p> : !loading && profile === null ? <div className="space-y-3"><p>Set your goals first, and we’ll create a focused learning plan.</p><Link className="inline-block rounded bg-[var(--moss)] px-4 py-2 font-semibold text-white" href="/onboarding">Start onboarding</Link></div> : null}
        {profile ? <><p className="text-sm text-[var(--muted)]" aria-live="polite">{profileSource === 'account' ? 'Plan synced with your account.' : 'Plan saved on this device. Sign in to use it everywhere.'}</p>
      <section aria-labelledby="progress-heading" className="border border-[var(--line)] bg-[var(--paper)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Your momentum</p><h2 className="mt-1 text-xl font-bold" id="progress-heading">Progress you can build on</h2></div><Link className="font-semibold underline underline-offset-4" href="/history">View history</Link></div>
        <p className="mt-3 text-sm text-[var(--muted)]">{identity.status === 'account' ? 'This summary uses practice saved to your account and this device.' : 'This summary uses practice history saved on this device.'}</p>
        <dl className="mt-5 grid gap-4 sm:grid-cols-2"><div><dt className="text-sm text-[var(--muted)]">Completed</dt><dd className="text-2xl font-bold">{progress?.completedItems ?? 0}</dd></div><div><dt className="text-sm text-[var(--muted)]">Active days</dt><dd className="text-2xl font-bold">{progress?.activeDays ?? 0}</dd></div><div><dt className="text-sm text-[var(--muted)]">Current streak</dt><dd className="text-2xl font-bold">{progress?.currentStreak ?? 0} <span className="text-sm font-medium">days</span></dd></div><div><dt className="text-sm text-[var(--muted)]">Average score</dt><dd className="text-2xl font-bold">{progress?.averageScore === null || progress?.averageScore === undefined ? '—' : `${progress.averageScore}/100`}</dd></div></dl>
        {progress?.completedItems === 0 ? <p className="mt-4 text-sm text-[var(--muted)]">Finish one practice item to start tracking your momentum.</p> : null}
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-[var(--line)]" aria-label="Practice progress"><div className="h-full rounded-full bg-[var(--moss)] transition-[width]" style={{ width: `${Math.min(100, (progress?.completedItems ?? 0) * 10)}%` }} /></div>
      </section></> : null}
      {identity.status === 'account' && identity.learnerId ? <AccountLearningPanel learnerId={identity.learnerId} /> : identity.status === 'checking' ? <p className="text-sm text-[var(--muted)]" role="status">Checking your learning account…</p> : identity.status === 'unavailable' ? <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5" aria-label="Account identity unavailable"><h2 className="text-xl font-bold">Your learning account is unavailable</h2><p className="mt-3 text-sm">Reconnect to load the correct account plan. Your device scores will not be used as account evidence.</p><a className="mt-3 inline-flex min-h-11 items-center font-semibold underline underline-offset-4" href="/dashboard">Reload dashboard</a><Link className="ml-4 inline-flex min-h-11 items-center font-semibold underline underline-offset-4" href="/roadmap">Explore question bank</Link></section> : null}
      </section>
      <section className="space-y-6" aria-label="Dashboard actions and details">
        <section aria-labelledby="quick-access-heading"><div><h2 className="text-xl font-bold" id="quick-access-heading">Open a workspace</h2><p className="mt-1 text-sm text-[var(--muted)]">Each card opens one part of your learning workspace.</p></div><div className="mt-3 grid gap-3 sm:grid-cols-2">{[
          { href: '/practice', label: 'Practice', text: 'Work through a guided problem.', icon: Braces },
          { href: '/roadmap/coding', label: 'Coding 250', text: 'Browse the coding curriculum.', icon: Code2 },
          { href: '/roadmap', label: 'Interview questions', text: 'Prepare coding and system-design answers.', icon: Compass },
          { href: '/classes', label: 'Groups and rooms', text: 'Join a cohort or shared session.', icon: GraduationCap },
          { href: '/library', label: 'Study library', text: 'Open your private study material.', icon: LibraryBig },
          { href: '/history', label: 'Progress history', text: 'Review saved work and results.', icon: ChartNoAxesCombined },
        ].map(({ href, label, text, icon: Icon }) => <Link className="group rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4 transition hover:border-[var(--moss)] hover:bg-[var(--moss-soft)]" href={href} key={href}><Icon className="text-[var(--moss)]" size={20} strokeWidth={1.8} /><h3 className="mt-4 font-bold text-[var(--ink)]">{label}</h3><p className="mt-1 text-sm leading-5 text-[var(--muted)]">{text}</p></Link>)}</div></section>
        {identity.status === 'account' && identity.learnerId ? <LegacySavedReviews learnerId={identity.learnerId} /> : null}
      {plan && profile ? <section aria-labelledby="plan-heading">
        <h2 className="text-xl font-bold" id="plan-heading">Recommended algorithms</h2>
        <p className="mt-2 text-sm font-semibold text-[var(--muted)]">Device practice plan · sign in for trusted account personalization</p>
        <p className="mt-2 text-[var(--ink)]">{plan.explanation}</p>
        <p className="mt-2 text-sm text-[var(--muted)]">Pace: <span className="font-semibold capitalize">{plan.pace}</span></p>
        <ol className="mt-4 space-y-3">
          {plan.recommendations.map((recommendation, index) => <li className="border border-[var(--line)] p-4" key={recommendation.practiceItemId}>
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold text-[var(--muted)]">{index === 0 ? 'Next up' : `Option ${index + 1}`}</p><h3 className="font-bold">{recommendation.label}</h3></div><span className="text-sm text-[var(--muted)]">{recommendation.estimatedMinutes} min · {recommendation.difficulty}</span></div>
            <p className="mt-2 text-sm text-[var(--muted)]">{profile.personalizationOptOut ? 'Next in the standard curriculum' : recommendation.reasons.join(' · ')}</p>
          </li>)}
        </ol>
        {nextPractice ? <Link className="mt-5 inline-block rounded bg-[var(--moss)] px-4 py-2 font-semibold text-white" href={practiceHref(nextPractice.practiceItemId)}>Start {nextPractice.label}</Link> : null}
      </section> : null}
      {profile ? <section aria-labelledby="profile-heading" className="border-t pt-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold" id="profile-heading">Profile at a glance</h2><Link className="font-semibold underline underline-offset-4" href="/settings">Edit settings</Link></div><dl className="mt-4 grid gap-4 sm:grid-cols-2"><div><dt className="text-sm text-[var(--muted)]">Goal</dt><dd className="font-medium">{profile.goal.replace('_', ' ')}</dd></div><div><dt className="text-sm text-[var(--muted)]">Experience</dt><dd className="font-medium">{profile.experience}</dd></div><div><dt className="text-sm text-[var(--muted)]">Weekly time</dt><dd className="font-medium">{profile.weeklyMinutes} minutes</dd></div><div><dt className="text-sm text-[var(--muted)]">Language</dt><dd className="font-medium capitalize">{profile.preferredLanguage}</dd></div></dl></section> : null}
      </section>
    </div>
  </section></div></main>;
}
