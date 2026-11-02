import { mutateTemplate, readTemplateDetail, templateFailure, templateJson } from '@/lib/assessment-template-api';
export const runtime = 'nodejs';
type Context = { params: Promise<{ templateId: string }> };
export async function GET(request: Request, context: Context) {
  try { return templateJson(await readTemplateDetail(request, (await context.params).templateId)); } catch (error) { return templateFailure(error); }
}
export async function POST(request: Request, context: Context) {
  try { return templateJson(await mutateTemplate(request, (await context.params).templateId)); } catch (error) { return templateFailure(error); }
}
