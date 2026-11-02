import { createTemplateDraft, templateFailure, templateJson } from '@/lib/assessment-template-api';
export const runtime = 'nodejs';
export async function POST(request: Request, context: { params: Promise<{ templateId: string }> }) {
  try { return templateJson(await createTemplateDraft(request, (await context.params).templateId), 201); } catch (error) { return templateFailure(error); }
}
