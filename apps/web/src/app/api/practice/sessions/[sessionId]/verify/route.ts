import { NextResponse } from 'next/server';
import { validateExecutionRequest, type ExecutionLanguage } from '@leetcode-app/domain';

import { getPracticeOwner } from '@/lib/auth/session';
import { buildGradedExecutionRequest, parseCodeGrade } from '@/lib/code-grading';
import { fromPersistedContentId } from '@/lib/content-id';
import { practiceItems } from '@/lib/content';
import { completePracticeSession, getPracticeSessionHistory } from '@/lib/practice-api';
import { takeRateLimit } from '@/lib/rate-limit';
import { executionLimits, validateExecutionPolicy } from '@/lib/sandbox/execution-policy';
import { createConfiguredSandbox } from '@/lib/sandbox/runtime';

type VerificationBody = { language?: unknown; source?: unknown };

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    if (process.env.CODE_EXECUTION_ENABLED !== 'true') {
      return NextResponse.json({ error: 'Verified code execution is unavailable' }, { status: 503 });
    }

    const owner = await getPracticeOwner();
    const { sessionId } = await params;
    const body = await request.json().catch(() => null) as VerificationBody | null;
    if (!body || (body.language !== 'typescript' && body.language !== 'python') || typeof body.source !== 'string') {
      return NextResponse.json({ error: 'A supported language and source are required' }, { status: 400 });
    }

    const language = body.language as ExecutionLanguage;
    const ungradedRequest = { language, source: body.source, limits: executionLimits };
    const errors = [...validateExecutionRequest(ungradedRequest), ...validateExecutionPolicy(ungradedRequest)];
    if (errors.length) return NextResponse.json({ error: 'Invalid execution request', details: errors }, { status: 400 });

    const history = await getPracticeSessionHistory({ owner, sessionId });
    const problemId = fromPersistedContentId(history.session.contentId);
    if (!practiceItems.some((item) => item.id === problemId)) {
      return NextResponse.json({ error: 'This practice item has no verified test specification' }, { status: 422 });
    }

    const rateLimit = takeRateLimit(`verified-execution:${owner.kind}:${owner.id}`, {
      limit: Number(process.env.EXECUTION_SUBMISSIONS_PER_TEN_MINUTES ?? 10),
      windowMs: 10 * 60_000,
    });
    if (!rateLimit.allowed) return NextResponse.json({ error: 'Too many verification attempts' }, {
      status: 429,
      headers: { 'retry-after': String(rateLimit.retryAfterSeconds) },
    });

    const result = await createConfiguredSandbox().execute(buildGradedExecutionRequest({
      problemId,
      language,
      source: body.source,
    }));

    if (result.status !== 'completed') {
      return NextResponse.json({
        status: result.status,
        error: result.stderr || 'The submitted code did not complete successfully.',
        durationMs: result.durationMs,
      });
    }

    const grade = parseCodeGrade(result.stdout);
    if (!grade || grade.problemId !== problemId) {
      return NextResponse.json({ error: 'The sandbox returned an invalid verification report' }, { status: 502 });
    }

    if (grade.passed) {
      await completePracticeSession({ owner, sessionId, completed: true, currentStage: 'evaluate' });
    }

    return NextResponse.json({ status: 'completed', grade, durationMs: result.durationMs });
  } catch (error) {
    if (error instanceof Error && error.message === 'Practice session not found') {
      return NextResponse.json({ error: 'Practice session not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Verified code execution failed' }, { status: 500 });
  }
}
