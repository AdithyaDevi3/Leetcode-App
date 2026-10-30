import { diagnosticFailure, diagnosticJson, readDiagnostic } from '@/lib/diagnostic-api';
export const runtime = 'nodejs';
export async function GET(request: Request, context: { params: Promise<{ diagnosticId: string }> }) {
  try { return diagnosticJson(await readDiagnostic(request, (await context.params).diagnosticId)); } catch (error) { return diagnosticFailure(error); }
}
