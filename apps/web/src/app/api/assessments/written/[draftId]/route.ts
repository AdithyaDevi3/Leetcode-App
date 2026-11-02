import { readWrittenDetail, writtenFailure, writtenJson } from '@/lib/written-assessment-api';
export const runtime = 'nodejs';
export async function GET(request: Request, { params }: { params: Promise<{ draftId: string }> }) {
  try { return writtenJson(await readWrittenDetail(request, (await params).draftId)); } catch (error) { return writtenFailure(error); }
}
