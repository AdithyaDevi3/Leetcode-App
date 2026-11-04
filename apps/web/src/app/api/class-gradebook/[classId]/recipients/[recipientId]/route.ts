import { classGradebookFailure, classGradebookJson, readGradeReleaseResponse } from '@/lib/class-gradebook-api';
export const runtime = 'nodejs';
export async function GET(request: Request, { params }: { params: Promise<{ classId: string; recipientId: string }> }) {
  try { const { classId, recipientId } = await params; return classGradebookJson(await readGradeReleaseResponse(request, classId, recipientId)); }
  catch (error) { return classGradebookFailure(error); }
}
