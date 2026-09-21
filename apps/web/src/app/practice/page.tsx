import { PracticeWorkspace } from '@/components/practice-workspace';
import { findPracticeItem } from '@/lib/content';
import { notFound } from 'next/navigation';

export default async function PracticePage({ searchParams }: { searchParams: Promise<{ problem?: string | string[] }> }) {
  const problem = (await searchParams).problem;
  if (typeof problem === 'string' && !findPracticeItem(problem)) notFound();
  return <PracticeWorkspace />;
}
