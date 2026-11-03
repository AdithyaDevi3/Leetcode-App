import { changeClassResultsSharing, classGradebookFailure, classGradebookJson } from '@/lib/class-gradebook-api';
export const runtime = 'nodejs';
export async function POST(request: Request, { params }: { params: Promise<{ classId: string; assignmentId: string }> }) {
  try { const { classId, assignmentId } = await params; return classGradebookJson(await changeClassResultsSharing(request, classId, assignmentId), 201); }
  catch (error) { return classGradebookFailure(error); }
}
