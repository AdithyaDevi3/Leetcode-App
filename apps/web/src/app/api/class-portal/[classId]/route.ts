import { readClassPortal, classPortalFailure, classPortalJson } from '@/lib/class-portal-api';

export const runtime = 'nodejs';
export async function GET(request: Request, { params }: { params: Promise<{ classId: string }> }) {
  try { const { classId } = await params; return classPortalJson(await readClassPortal(request, classId)); }
  catch (error) { return classPortalFailure(error); }
}
