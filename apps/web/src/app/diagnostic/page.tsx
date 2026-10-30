import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { diagnosticUuid } from '@/lib/diagnostic-client';
import { DiagnosticHome } from '@/components/diagnostics/diagnostic-home';

export default async function DiagnosticPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const session = await getSession({ failOnAuthError: true });
  const { id } = await searchParams;
  const selectedId = typeof id === 'string' && diagnosticUuid.test(id) ? id : undefined;
  if (!session) redirect(`/auth?next=${encodeURIComponent(`/diagnostic${selectedId ? `?id=${selectedId}` : ''}`)}`);
  return <DiagnosticHome key={`${session.user.id}:${selectedId ?? 'current'}`} learnerId={session.user.id} diagnosticId={selectedId} />;
}
