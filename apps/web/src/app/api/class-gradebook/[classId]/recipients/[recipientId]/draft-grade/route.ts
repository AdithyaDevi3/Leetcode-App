import { classGradebookFailure, classGradebookJson, saveClassGradeDraft } from '@/lib/class-gradebook-api';
export const runtime = 'nodejs';
export async function POST(request: Request, { params }: { params: Promise<{ classId: string; recipientId: string }> }) {
  try { const { classId, recipientId } = await params; return classGradebookJson(await saveClassGradeDraft(request, classId, recipientId), 201); }
  catch (error) { return classGradebookFailure(error); }
}
