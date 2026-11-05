import { saveClassAnnouncement, classPortalFailure, classPortalJson } from '@/lib/class-portal-api';

export const runtime = 'nodejs';
export async function POST(request: Request, { params }: { params: Promise<{ classId: string; announcementId: string }> }) {
  try { const { classId, announcementId } = await params; return classPortalJson(await saveClassAnnouncement(request, classId, announcementId), 201); }
  catch (error) { return classPortalFailure(error); }
}
