import { NextResponse } from 'next/server';
import { isExecutionLanguage, validateExecutionRequest } from '@leetcode-app/domain';

import { getPracticeOwner } from '@/lib/auth/session';
import { buildGradedExecutionRequest, gradeExecutionOutputs } from '@/lib/code-grading.server';
import { CodeRunInputError, decodeCodeExecutionBody } from '@/lib/code-running.server';
import { executionRateLimitOptions } from '@/lib/code-execution.server';
import { fromPersistedContentId } from '@/lib/content-id';
import { practiceItems } from '@/lib/content';
import { getPracticeSessionHistory } from '@/lib/practice-api';
import { beginPracticeVerification, finishPracticeVerification } from '@/lib/practice-verification';
import { takeRateLimit } from '@/lib/rate-limit';
import { executionLimits, validateExecutionPolicy } from '@/lib/sandbox/execution-policy';
import { createConfiguredSandbox } from '@/lib/sandbox/runtime';

export const runtime = 'nodejs';
export const maxDuration = 30;
const reply = (body: unknown, status = 200, extraHeaders: Record<string, string> = {}) => NextResponse.json(body, {
  status, headers: { 'cache-control': 'private, no-store', ...extraHeaders },
});

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    if (process.env.CODE_EXECUTION_ENABLED !== 'true') {
      return reply({ error: 'Verified code execution is unavailable' }, 503);
    }

    const owner = await getPracticeOwner();
    const { sessionId } = await params;
    const body = await decodeCodeExecutionBody(request);
    if (Object.keys(body).some(key => !['language', 'source'].includes(key)) || !isExecutionLanguage(body.language) || typeof body.source !== 'string') {
      return reply({ error: 'A supported language and source are required' }, 400);
    }

    const language = body.language;
    const ungradedRequest = { language, source: body.source, limits: executionLimits };
    const errors = [...validateExecutionRequest(ungradedRequest), ...validateExecutionPolicy(ungradedRequest)];
    if (errors.length) return reply({ error: 'Invalid execution request', details: errors }, 400);

    const history = await getPracticeSessionHistory({ owner, sessionId });
    const problemId = fromPersistedContentId(history.session.contentId);
    if (!practiceItems.some((item) => item.id === problemId)) {
      return reply({ error: 'This practice item has no verified test specification' }, 422);
    }

    const execution = buildGradedExecutionRequest({ problemId, language, source: body.source });
    if (validateExecutionPolicy(execution).length) return reply({ error: 'Code exceeds execution limits after adding the test harness. Shorten the submitted source.' }, 400);

    const rateLimit = await takeRateLimit(`verified-execution:${owner.kind}:${owner.id}`, executionRateLimitOptions());
    if (!rateLimit.allowed) return reply({ error: 'Too many execution attempts' }, 429, { 'retry-after': String(rateLimit.retryAfterSeconds) });

    const verification = await beginPracticeVerification({ owner, sessionId, source: body.source, language });
    const result = await createConfiguredSandbox().execute(execution);

    if (result.status !== 'completed') {
      return reply({
        status: result.status,
        error: 'The submitted code did not compile or finish. Use Run to inspect errors on your visible test cases.',
        durationMs: result.durationMs,
      });
    }

    const grade = gradeExecutionOutputs(problemId, result.stdout);
    if (!grade || grade.problemId !== problemId) {
      return reply({ error: 'The sandbox returned an invalid verification report' }, 502);
    }

    try {
      const saved = await finishPracticeVerification({ owner, sessionId, requestId: verification.requestId, grade });
      if (!saved) return reply({ error: 'A newer verification was started. Submit the current code again.' }, 409);
    } catch {
      return reply({ error: 'Verification finished, but its report could not be saved. Please retry.' }, 500);
    }

    return reply({ status: 'completed', grade, durationMs: result.durationMs });
  } catch (error) {
    if (error instanceof CodeRunInputError) return reply({ error: error.message }, error.status);
    if (error instanceof Error && error.message === 'Practice session not found') {
      return reply({ error: 'Practice session not found' }, 404);
    }
    return reply({ error: 'Verified code execution failed' }, 500);
  }
}
