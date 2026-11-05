export type ClassPortalWorkspace = 'learner' | 'teach' | 'admin';
export type ClassPortalContext = { id: string; name: string; description: string; instructorName: string; learnerCount: number };
export type AnnouncementContent = { revisionId: string; revisionNumber: number; title: string; body: string; createdAt: string; authorName: string };
export type AnnouncementStatus = 'draft' | 'published' | 'archived';
export type AnnouncementCursor = { at: string; id: string };
export type AnnouncementSummary = {
  id: string; title: string; excerpt: string; publishedAt: string | null; publicationSequence: number | null; unread: boolean;
  authorState?: { sequence: number; revisionNumber: number; status: AnnouncementStatus; hasUnpublishedChanges: boolean };
};
export type AnnouncementList = { classroom: ClassPortalContext; items: AnnouncementSummary[]; nextCursor: AnnouncementCursor | null };
export type AnnouncementListOptions = { limit?: number; cursor?: AnnouncementCursor; state?: 'current' | 'archived' | 'all' };
export type AnnouncementView = {
  classroom: ClassPortalContext;
  announcement: { id: string; sequence: number; status: AnnouncementStatus; draft: AnnouncementContent | null;
    published: { id: string; sequence: number; content: AnnouncementContent; publishedAt: string } | null; unread: boolean };
};
export type AnnouncementReceipt = { id: string; actorId: string; classId: string; announcementId: string;
  action: 'save' | 'publish' | 'archive' | 'read'; sequence: number; revisionId: string | null; publicationSequence: number | null; createdAt: string };
export type SaveAnnouncementInput = { classId: string; announcementId: string; expectedSequence: number; title: string; body: string; requestKey: string };
export type PublishAnnouncementInput = { classId: string; announcementId: string; expectedSequence: number; revisionId: string; requestKey: string };
export type ArchiveAnnouncementInput = { classId: string; announcementId: string; expectedSequence: number; requestKey: string };
export type MarkAnnouncementReadInput = { classId: string; announcementId: string; publicationSequence: number; requestKey: string };
