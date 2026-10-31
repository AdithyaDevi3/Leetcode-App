import { classInsightsFailure, classInsightsJson, readClassInsightsRequest } from '@/lib/class-insights-api';
export const runtime = 'nodejs';
export async function GET(request: Request, { params }: { params: Promise<{ classId: string }> }) {
  try { return classInsightsJson(await readClassInsightsRequest(request, (await params).classId)); }
  catch (error) { return classInsightsFailure(error); }
}
