import { classGradebookFailure, classGradebookJson, readAssignmentGradeRelease } from '@/lib/class-gradebook-api';
export const runtime = 'nodejs';
export async function GET(request: Request, { params }: { params: Promise<{ classId: string; assignmentId: string }> }) {
  try { const { classId, assignmentId } = await params; return classGradebookJson(await readAssignmentGradeRelease(request, classId, assignmentId)); }
  catch (error) { return classGradebookFailure(error); }
}
