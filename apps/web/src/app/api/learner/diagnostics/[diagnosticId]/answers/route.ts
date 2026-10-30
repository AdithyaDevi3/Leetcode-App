import { diagnosticFailure, diagnosticJson, saveDiagnostic } from '@/lib/diagnostic-api';
export const runtime = 'nodejs';
export async function POST(request: Request, context: { params: Promise<{ diagnosticId: string }> }) {
  try { return diagnosticJson(await saveDiagnostic(request, (await context.params).diagnosticId)); } catch (error) { return diagnosticFailure(error); }
}
