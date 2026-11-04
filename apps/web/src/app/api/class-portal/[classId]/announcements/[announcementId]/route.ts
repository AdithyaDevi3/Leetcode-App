import { readClassAnnouncement, classPortalFailure, classPortalJson } from '@/lib/class-portal-api';

export const runtime = 'nodejs';
export async function GET(request: Request, { params }: { params: Promise<{ classId: string; announcementId: string }> }) {
  try { const { classId, announcementId } = await params; return classPortalJson(await readClassAnnouncement(request, classId, announcementId)); }
  catch (error) { return classPortalFailure(error); }
}
