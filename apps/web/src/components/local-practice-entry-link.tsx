'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

import { buildLocalLearningPlan, readLocalLearnerProfile } from '@/lib/local-learner';
import { readLocalPracticeHistory } from '@/lib/local-practice-history';

export function LocalPracticeEntryLink({ children, className }: { children: ReactNode; className?: string }) {
  const [href, setHref] = useState('/practice');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const profile = readLocalLearnerProfile();
      if (!profile) return;

      const nextPractice = buildLocalLearningPlan(profile, readLocalPracticeHistory()).recommendations[0];
      if (nextPractice) setHref(`/practice?problem=${encodeURIComponent(nextPractice.practiceItemId)}`);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return <a className={className} href={href}>{children}</a>;
}
