import { notFound } from 'next/navigation';
import { DiagnosticHome } from '@/components/diagnostics/diagnostic-home';

export const dynamic = 'force-dynamic';
export default function DiagnosticFixture() {
  if (process.env.METHOD_E2E_FIXTURES !== '1') notFound();
  return <DiagnosticHome learnerId="44444444-4444-4444-8444-444444444444" />;
}
