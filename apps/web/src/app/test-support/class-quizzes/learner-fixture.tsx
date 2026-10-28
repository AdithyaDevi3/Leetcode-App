'use client';

import { useEffect, useState } from 'react';
import type { LearnerQuizAssignment } from '@leetcode-app/database';
import { QuizAttemptWorkspace } from '@/components/assessments/quiz-attempt-workspace';

// Only rendered by the server's METHOD_E2E_FIXTURES-gated page. The browser test supplies
// synthetic API state so a new mount models a fresh authenticated server-page read.
export function QuizLearnerFixture({ recipientId, learnerId }: { recipientId: string; learnerId: string }) {
  const [assignment, setAssignment] = useState<LearnerQuizAssignment | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/learner/assignments/${recipientId}/quiz`, { cache: 'no-store', headers: { 'x-quiz-learner': learnerId }, signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok || body.learnerId !== learnerId || !body.assignment) throw new Error('Synthetic quiz fixture unavailable.');
        setAssignment(body.assignment);
      }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Fixture unavailable.'); });
    return () => controller.abort();
  }, [recipientId, learnerId]);
  if (error) return <p role="alert">{error}</p>;
  if (!assignment) return <p role="status">Loading synthetic class quiz…</p>;
  return <QuizAttemptWorkspace key={`${learnerId}:${recipientId}:${assignment.policyVersionId}`} learnerId={learnerId} assignment={assignment} />;
}
