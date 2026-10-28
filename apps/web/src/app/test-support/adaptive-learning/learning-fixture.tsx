'use client';

import { useState } from 'react';
import { AccountLearningPanel } from '@/components/account-learning-panel';

const first = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';

export function AdaptiveLearningFixture() {
  const [learnerId, setLearnerId] = useState(first);
  return <main className="min-h-screen bg-[var(--paper)] px-4 py-8 text-[var(--ink)] sm:px-8"><div className="mx-auto max-w-3xl space-y-6">
    <h1 className="text-3xl font-bold">Sample learning dashboard</h1>
    <nav aria-label="Synthetic learner controls" className="flex flex-wrap gap-3">
      <button className="min-h-11 rounded-md border border-[var(--line)] bg-white px-4 font-bold" type="button" aria-pressed={learnerId === first} onClick={() => setLearnerId(first)}>First sample account</button>
      <button className="min-h-11 rounded-md border border-[var(--line)] bg-white px-4 font-bold" type="button" aria-pressed={learnerId === second} onClick={() => setLearnerId(second)}>Second sample account</button>
    </nav>
    <AccountLearningPanel learnerId={learnerId} />
  </div></main>;
}
