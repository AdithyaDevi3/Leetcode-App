'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { buildLocalLearningPlan, readLocalLearnerProfile, type LocalLearningPlan } from '@/lib/local-learner';
import { readLocalPracticeHistory } from '@/lib/local-practice-history';

export default function LearnPage() {
  const [plan, setPlan] = useState<LocalLearningPlan | null>(null);
  const [message, setMessage] = useState('Loading your learning plan…');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const profile = readLocalLearnerProfile();
      if (profile) {
        setPlan(buildLocalLearningPlan(profile, readLocalPracticeHistory()));
        setMessage('');
        return;
      }
      setMessage('Set your goals first to get a learning plan.');
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const nextPractice = plan?.recommendations[0];

  return <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900"><section className="mx-auto max-w-2xl rounded-xl bg-white p-8 shadow-sm">
    <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Your learning path</p><h1 className="mt-2 text-3xl font-bold">Today’s next step</h1>
    {plan ? <>
      <p className="mt-4 text-slate-700">{plan.explanation}</p>
      <p className="mt-4 text-sm text-slate-500">Pace: {plan.pace}</p>
      <ol className="mt-5 space-y-4">
        {plan.recommendations.map((recommendation, index) => <li className="border border-slate-200 p-4" key={recommendation.practiceItemId}>
          <p className="text-sm font-semibold text-slate-500">{index === 0 ? 'Recommended next' : `Alternative ${index}`}</p>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2"><strong>{recommendation.label}</strong><span className="text-sm text-slate-500">{recommendation.estimatedMinutes} min · {recommendation.difficulty}</span></div>
          <p className="mt-2 text-sm text-slate-600">{recommendation.reasons.join(' · ')}</p>
        </li>)}
      </ol>
      {nextPractice ? <a className="mt-8 inline-block rounded bg-slate-900 px-4 py-2 font-semibold text-white" href={`/practice?problem=${encodeURIComponent(nextPractice.practiceItemId)}`}>Start {nextPractice.label}</a> : null}
    </> : <><p className="mt-4 text-slate-700" aria-live="polite">{message}</p>{message.startsWith('Set your goals') ? <Link className="mt-6 inline-block rounded bg-slate-900 px-4 py-2 font-semibold text-white" href="/onboarding">Set up my plan</Link> : null}</>}
  </section></main>;
}
