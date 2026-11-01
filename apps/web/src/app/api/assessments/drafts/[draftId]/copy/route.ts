import { assessmentCopyFailure, assessmentCopyJson, copyAssessmentDraft, readAssessmentCopyPreview } from '@/lib/assessment-copy-api';
export const runtime = 'nodejs';
type Context = { params: Promise<{ draftId: string }> };
export async function GET(request: Request, context: Context) {
  try { return assessmentCopyJson(await readAssessmentCopyPreview(request, (await context.params).draftId)); }
  catch (error) { return assessmentCopyFailure(error); }
}
export async function POST(request: Request, context: Context) {
  try { return assessmentCopyJson(await copyAssessmentDraft(request, (await context.params).draftId), 201); }
  catch (error) { return assessmentCopyFailure(error); }
}
