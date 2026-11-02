import { publishWrittenDraft, writtenFailure, writtenJson } from '@/lib/written-assessment-api';
export const runtime = 'nodejs';
export async function POST(request: Request, { params }: { params: Promise<{ draftId: string }> }) {
  try { return writtenJson(await publishWrittenDraft(request, (await params).draftId), 201); } catch (error) { return writtenFailure(error); }
}
