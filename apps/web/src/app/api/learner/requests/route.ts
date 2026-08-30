import { NextResponse } from 'next/server';
import { getPracticeOwner } from '@/lib/auth/session';
import { createLearnerRequestsStore, parseLearnerRequestInput } from '@/lib/learner-requests';

export async function GET() {
  try { return NextResponse.json({ requests: await createLearnerRequestsStore().list(await getPracticeOwner()) }); }
  catch { return NextResponse.json({ error: 'Failed to fetch requests' }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const input = parseLearnerRequestInput(await request.json().catch(() => null));
    if (!input) return NextResponse.json({ error: 'Choose a type and provide a title (3–160 characters) and description (10–5000 characters).' }, { status: 400 });
    const item = await createLearnerRequestsStore().create(await getPracticeOwner(), input);
    return NextResponse.json({ request: item }, { status: 201 });
  } catch { return NextResponse.json({ error: 'Failed to submit request' }, { status: 500 }); }
}
