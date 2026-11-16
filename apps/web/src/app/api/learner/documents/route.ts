import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { createStudyDocumentStore, parseStudyDocumentInput } from '@/lib/study-documents';

const unauthorized = (error: unknown) => error instanceof Error && error.message === 'Unauthorized: Authentication required';

export async function GET() {
  try {
    const session = await requireAuth();
    return NextResponse.json({ documents: await createStudyDocumentStore().list(session.user.id) });
  } catch (error) {
    if (unauthorized(error)) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    return NextResponse.json({ error: 'Could not load study documents' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAuth();
    const input = parseStudyDocumentInput(await request.json().catch(() => null), session.user.id);
    if (!input) return NextResponse.json({ error: 'Use a supported file that is 15 MB or smaller.' }, { status: 400 });
    return NextResponse.json({ document: await createStudyDocumentStore().create(session.user.id, input) }, { status: 201 });
  } catch (error) {
    if (unauthorized(error)) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    return NextResponse.json({ error: 'Could not save the study document' }, { status: 500 });
  }
}
