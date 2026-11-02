import { notFound } from 'next/navigation';
import { WrittenAuthor } from '@/components/assessments/written/written-author';
import { WrittenAttempt } from '@/components/assessments/written/written-attempt';
import { WrittenLibrary } from '@/components/assessments/written/written-library';
export const dynamic = 'force-dynamic';
export default async function WrittenFixture({ searchParams }: { searchParams: Promise<{ mode?: string; workspace?: string }> }) {
  if (process.env.METHOD_E2E_FIXTURES !== '1') notFound();
  const query = await searchParams, workspace = query.workspace === 'admin' ? 'admin' : 'teach';
  const actorId = '11111111-1111-4111-8111-111111111111', classId = '33333333-3333-4333-8333-333333333333', draftId = '55555555-5555-4555-8555-555555555555';
  return query.mode === 'learner' ? <WrittenAttempt actorId={actorId} classId={classId} recipientId="77777777-7777-4777-8777-777777777777" policyVersionId="88888888-8888-4888-8888-888888888888" />
    : query.mode === 'new' ? <WrittenAuthor actorId={actorId} workspace={workspace} classId={classId} />
      : query.mode === 'author' ? <WrittenAuthor actorId={actorId} workspace={workspace} classId={classId} draftId={draftId} />
        : <WrittenLibrary actorId={actorId} workspace={workspace} classId={classId} />;
}
