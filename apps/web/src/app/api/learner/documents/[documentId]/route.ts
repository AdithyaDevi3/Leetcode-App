import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { createStudyDocumentStore } from '@/lib/study-documents';

export async function DELETE(_: Request, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const session = await requireAuth();
    const document = await createStudyDocumentStore().remove(session.user.id, (await params).documentId);
    if (!document) return NextResponse.json({ error: 'Study document was not found' }, { status: 404 });
    return NextResponse.json({ document });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized: Authentication required') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    return NextResponse.json({ error: 'Could not remove the study document' }, { status: 500 });
  }
}
