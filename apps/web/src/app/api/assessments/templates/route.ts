import { createTemplateFromDraft, readTemplateLibrary, templateFailure, templateJson } from '@/lib/assessment-template-api';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try { return templateJson(await readTemplateLibrary(request)); } catch (error) { return templateFailure(error); }
}
export async function POST(request: Request) {
  try { return templateJson(await createTemplateFromDraft(request), 201); } catch (error) { return templateFailure(error); }
}
