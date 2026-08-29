import { NextResponse } from 'next/server';
import { buildInitialLearningPlan, validateLearnerProfile, type LearnerProfile } from '@leetcode-app/domain';
import { requireAuth } from '@/lib/auth/session';
import { createPersonalizationStore } from '@/lib/personalization-store';

export async function GET() {
  try {
    const session = await requireAuth();
    const profile = await createPersonalizationStore().getProfile(session.user.id);
    return NextResponse.json({ profile });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized: Authentication required') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    return NextResponse.json({ error: 'Failed to fetch learner profile' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requireAuth();
    const profile = await request.json().catch(() => null) as LearnerProfile | null;
    if (!profile) return NextResponse.json({ error: 'Learner profile is required' }, { status: 400 });
    const errors = validateLearnerProfile(profile);
    if (errors.length) return NextResponse.json({ error: 'Invalid learner profile', details: errors }, { status: 400 });
    const saved = await createPersonalizationStore().upsertProfile(session.user.id, profile);
    return NextResponse.json({ profile: saved, plan: buildInitialLearningPlan(saved) });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized: Authentication required') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    return NextResponse.json({ error: 'Failed to save learner profile' }, { status: 500 });
  }
}
