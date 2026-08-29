'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Plan = { pace: string; suggestedTopics: string[]; explanation: string };

export default function LearnPage() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [message, setMessage] = useState('Loading your learning plan…');
  useEffect(() => {
    void fetch('/api/learner/plan').then(async (response) => ({ response, body: await response.json().catch(() => null) }))
      .then(({ response, body }) => {
        if (response.ok && body?.plan) { setPlan(body.plan); setMessage(''); return; }
        setMessage(response.status === 404 ? 'Set your goals first to get a learning plan.' : body?.error ?? 'Unable to load your learning plan.');
      }).catch(() => setMessage('Unable to load your learning plan.'));
  }, []);
  return <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900"><section className="mx-auto max-w-2xl rounded-xl bg-white p-8 shadow-sm">
    <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Your learning path</p><h1 className="mt-2 text-3xl font-bold">Today’s next step</h1>
    {plan ? <><p className="mt-4 text-slate-700">{plan.explanation}</p><p className="mt-4 text-sm text-slate-500">Pace: {plan.pace}</p><ol className="mt-5 list-decimal space-y-2 pl-5">{plan.suggestedTopics.map((topic) => <li key={topic}>{topic}</li>)}</ol><Link className="mt-8 inline-block rounded bg-slate-900 px-4 py-2 font-semibold text-white" href="/">Start practice</Link></> : <><p className="mt-4 text-slate-700" aria-live="polite">{message}</p>{message.startsWith('Set your goals') ? <Link className="mt-6 inline-block rounded bg-slate-900 px-4 py-2 font-semibold text-white" href="/onboarding">Set up my plan</Link> : null}</>}
  </section></main>;
}
