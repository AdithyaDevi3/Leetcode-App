import { notFound } from 'next/navigation';
import { LocalLearnerDashboard } from '@/components/local-learner-dashboard';
import { AdaptiveLearningFixture } from './learning-fixture';

export const dynamic = 'force-dynamic';

export default async function AdaptiveLearningPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  if (process.env.METHOD_E2E_FIXTURES !== '1') notFound();
  const { view } = await searchParams;
  return view === 'dashboard' ? <LocalLearnerDashboard /> : <AdaptiveLearningFixture />;
}
