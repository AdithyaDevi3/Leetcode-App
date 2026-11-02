import { readWrittenLearner, saveWrittenResponse, writtenFailure, writtenJson } from '@/lib/written-assessment-api';
export const runtime = 'nodejs';
export async function GET(request: Request, { params }: { params: Promise<{ recipientId: string }> }) {
  try { return writtenJson(await readWrittenLearner(request, (await params).recipientId)); } catch (error) { return writtenFailure(error); }
}
export async function POST(request: Request, { params }: { params: Promise<{ recipientId: string }> }) {
  try { return writtenJson(await saveWrittenResponse(request, (await params).recipientId)); } catch (error) { return writtenFailure(error); }
}
