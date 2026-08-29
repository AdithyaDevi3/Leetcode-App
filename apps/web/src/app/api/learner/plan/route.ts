import { NextResponse } from 'next/server';
import { buildInitialLearningPlan } from '@leetcode-app/domain';
import { requireAuth } from '@/lib/auth/session';
import { createPersonalizationStore } from '@/lib/personalization-store';

export async function GET() {
  try {
    const session = await requireAuth();
    const profile = await createPersonalizationStore().getProfile(session.user.id);
    if (!profile) return NextResponse.json({ error: 'Complete onboarding to build a learning plan' }, { status: 404 });
    return NextResponse.json({ profile, plan: buildInitialLearningPlan(profile) });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized: Authentication required') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    return NextResponse.json({ error: 'Failed to build learning plan' }, { status: 500 });
  }
}
