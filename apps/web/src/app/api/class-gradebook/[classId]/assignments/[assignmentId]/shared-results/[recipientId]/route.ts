import { classGradebookFailure, classGradebookJson, readSharedAssignmentResponse } from '@/lib/class-gradebook-api';
export const runtime = 'nodejs';
export async function GET(request: Request, { params }: { params: Promise<{ classId: string; assignmentId: string; recipientId: string }> }) {
  try { const { classId, assignmentId, recipientId } = await params; return classGradebookJson(await readSharedAssignmentResponse(request, classId, assignmentId, recipientId)); }
  catch (error) { return classGradebookFailure(error); }
}
