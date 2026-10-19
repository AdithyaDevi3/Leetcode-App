import { PracticeWorkspace } from '@/components/practice-workspace';
import { findPracticeItem } from '@/lib/content';
import { notFound } from 'next/navigation';

export default async function PracticePage({ searchParams }: { searchParams: Promise<{ problem?: string | string[]; assignment?: string | string[] }> }) {
  const params = await searchParams;
  const problem = params.problem;
  const assignment = params.assignment;
  if (typeof problem === 'string' && !findPracticeItem(problem)) notFound();
  return <PracticeWorkspace assignmentRecipientId={typeof assignment === 'string' ? assignment : null} />;
}
