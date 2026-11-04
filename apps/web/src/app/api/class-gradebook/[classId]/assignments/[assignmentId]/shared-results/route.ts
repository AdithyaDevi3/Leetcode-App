import { classGradebookFailure, classGradebookJson, readSharedAssignmentResults } from '@/lib/class-gradebook-api';
export const runtime = 'nodejs';
export async function GET(request: Request, { params }: { params: Promise<{ classId: string; assignmentId: string }> }) {
  try { const { classId, assignmentId } = await params; return classGradebookJson(await readSharedAssignmentResults(request, classId, assignmentId)); }
  catch (error) { return classGradebookFailure(error); }
}
