import { NextResponse } from 'next/server';
import { isExecutionLanguage, validateExecutionRequest } from '@leetcode-app/domain';

import { getPracticeOwner } from '@/lib/auth/session';
import { fromPersistedContentId } from '@/lib/content-id';
import { getPracticeSessionHistory } from '@/lib/practice-api';
import { takeRateLimit } from '@/lib/rate-limit';
import { buildRunExecutionRequest, CodeRunInputError, decodeCodeExecutionBody, makeCodeRunResult, parseRunCases } from '@/lib/code-running.server';
import { executionRateLimitOptions, hasCodeExecutionSpec } from '@/lib/code-execution.server';
import { executionLimits, validateExecutionPolicy } from '@/lib/sandbox/execution-policy';
import { createConfiguredSandbox } from '@/lib/sandbox/runtime';

export const runtime = 'nodejs';
export const maxDuration = 30;
const reply = (body: unknown, status = 200, extraHeaders: Record<string, string> = {}) => NextResponse.json(body, {
  status, headers: { 'cache-control': 'private, no-store', ...extraHeaders },
});

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    if (process.env.CODE_EXECUTION_ENABLED !== 'true') return reply({ error: 'Code execution is unavailable.' }, 503);
    const owner = await getPracticeOwner();
    const { sessionId } = await params;
    const body = await decodeCodeExecutionBody(request);
    if (Object.keys(body).some(key => !['language', 'source', 'cases'].includes(key))
      || !isExecutionLanguage(body.language) || typeof body.source !== 'string') {
      return reply({ error: 'A supported language, source and test cases are required.' }, 400);
    }
    const language = body.language;
    const ungraded = { language, source: body.source, limits: executionLimits };
    const errors = [...validateExecutionRequest(ungraded), ...validateExecutionPolicy(ungraded)];
    if (errors.length) return reply({ error: 'Invalid execution request.', details: errors }, 400);
    const history = await getPracticeSessionHistory({ owner, sessionId });
    const problemId = fromPersistedContentId(history.session.contentId);
    if (!hasCodeExecutionSpec(problemId)) return reply({ error: 'This practice item does not support code execution.' }, 422);
    const cases = parseRunCases(problemId, body.cases);
    const execution = buildRunExecutionRequest({ problemId, language, source: body.source, cases });
    if (validateExecutionPolicy(execution).length) return reply({ error: 'Code plus test inputs exceeds execution limits. Shorten the code or use fewer cases.' }, 400);
    const rateLimit = await takeRateLimit(`verified-execution:${owner.kind}:${owner.id}`, executionRateLimitOptions());
    if (!rateLimit.allowed) return reply({ error: 'Too many execution attempts. Try again shortly.' }, 429, { 'retry-after': String(rateLimit.retryAfterSeconds) });
    const result = await createConfiguredSandbox().execute(execution);
    // Run intentionally never reserves/saves verification, completion, evidence or an academic hand-in.
    return reply({ run: makeCodeRunResult({ problemId, language, cases, result }) });
  } catch (error) {
    if (error instanceof CodeRunInputError) return reply({ error: error.message }, error.status);
    if (error instanceof Error && error.message === 'Practice session not found') return reply({ error: 'Practice session not found' }, 404);
    return reply({ error: 'Code execution could not be completed. Please retry.' }, 500);
  }
}
