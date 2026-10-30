import { diagnosticFailure, diagnosticJson, listDiagnostics, startDiagnostic } from '@/lib/diagnostic-api';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try { return diagnosticJson(await listDiagnostics(request)); } catch (error) { return diagnosticFailure(error); }
}
export async function POST(request: Request) {
  try { return diagnosticJson(await startDiagnostic(request)); } catch (error) { return diagnosticFailure(error); }
}
