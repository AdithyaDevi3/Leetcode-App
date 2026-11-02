import { submitWrittenResponse, writtenFailure, writtenJson } from '@/lib/written-assessment-api';
export const runtime = 'nodejs';
export async function POST(request: Request, { params }: { params: Promise<{ recipientId: string }> }) {
  try { return writtenJson(await submitWrittenResponse(request, (await params).recipientId), 201); } catch (error) { return writtenFailure(error); }
}
