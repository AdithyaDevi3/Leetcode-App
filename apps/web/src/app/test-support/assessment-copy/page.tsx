import { notFound } from 'next/navigation';
import { AssessmentCopyPanel } from '@/components/assessments/assessment-copy-panel';

export const dynamic = 'force-dynamic';
export default async function AssessmentCopyFixture({ searchParams }: { searchParams: Promise<{ workspace?: string }> }) {
  if (process.env.METHOD_E2E_FIXTURES !== '1') notFound();
  const { workspace } = await searchParams;
  return <AssessmentCopyPanel key={workspace === 'admin' ? 'admin' : 'teach'} workspace={workspace === 'admin' ? 'admin' : 'teach'} actorId="11111111-1111-4111-8111-111111111111" classId="33333333-3333-4333-8333-333333333333" draftId="55555555-5555-4555-8555-555555555555" />;
}
