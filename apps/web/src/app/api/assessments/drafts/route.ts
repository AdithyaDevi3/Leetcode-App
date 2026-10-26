import { NextResponse } from 'next/server';
import { AssessmentDraftAccessError, AssessmentDraftConflictError, AssessmentDraftValidationError } from '@leetcode-app/database';
import { readAssessmentAuthorData, type AssessmentWorkspace } from '@/lib/assessment-author';
import { AssessmentInputError, assessmentUuid, parseAssessmentDraftRequest } from '@/lib/assessment-draft-input';
import { getReviewedQuestionVersion } from '@/lib/question-bank.server';
import { requestIdHeader } from '@/lib/request-correlation';

const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
function workspace(request: Request): AssessmentWorkspace | null {
  const value = new URL(request.url).searchParams.get('workspace');
  return value === 'admin' || value === 'teach' ? value : null;
}
function failure(error: unknown) {
  if (error instanceof AssessmentDraftAccessError) return json({ error: 'Assessment draft or class not found.' }, 404);
  if (error instanceof AssessmentDraftConflictError) return json({ error: 'This draft changed elsewhere. Your entries are preserved. Open the latest saved draft to compare before saving again.', code: 'draft_conflict' }, 409);
  if (error instanceof AssessmentInputError || error instanceof AssessmentDraftValidationError) return json({ error: error.message }, 400);
  return json({ error: 'Assessment drafts are temporarily unavailable. Your entries are still here; retry saving.' }, 503);
}
export async function GET(request: Request) {
  const context = workspace(request);
  if (!context) return json({ error: 'Choose an authoring workspace.' }, 400);
  const params = new URL(request.url).searchParams;
  const draftId = params.get('draftId'), classId = params.get('classId');
  if (draftId ? !assessmentUuid.test(draftId) : !classId || !assessmentUuid.test(classId)) return json({ error: 'Choose a valid class or draft.' }, 400);
  try {
    const access = await readAssessmentAuthorData(context, async repository => draftId ? { draft: await repository.getDraft(draftId) } : { drafts: await repository.listDrafts(classId!) });
    if (access.status !== 'authorized') return json({ error: access.status === 'unauthenticated' ? 'Sign in to manage quiz drafts.' : 'Author permission is required.' }, access.status === 'unauthenticated' ? 401 : 403);
    return json(access.data);
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  const context = workspace(request);
  if (!context) return json({ error: 'Choose an authoring workspace.' }, 400);
  // Bound the request before constructing question snapshots or touching storage.
  const raw = await request.text();
  if (raw.length > 30_000) return json({ error: 'Assessment draft is too large.' }, 413);
  try {
    const input = parseAssessmentDraftRequest(JSON.parse(raw), getReviewedQuestionVersion);
    const access = await readAssessmentAuthorData(context, async (repository, _classes, author) => {
      if (request.headers.get('x-assessment-author') !== author.id) return { ownerChanged: true as const };
      const draft = input.draftId
        ? await repository.updateDraft({ draftId: input.draftId, expectedRevision: input.expectedRevision!, draft: input.draft, requestKey: input.requestKey, reason: 'Author updated a class quiz draft', requestId: request.headers.get(requestIdHeader) })
        : await repository.createDraft({ draft: input.draft, requestKey: input.requestKey, reason: 'Author created a class quiz draft', requestId: request.headers.get(requestIdHeader) });
      const current = await repository.getDraft(draft.id);
      return { draft, currentRevision: current.revision };
    });
    if (access.status !== 'authorized') return json({ error: access.status === 'unauthenticated' ? 'Sign in to save quiz drafts.' : 'Author permission is required.' }, access.status === 'unauthenticated' ? 401 : 403);
    if ('ownerChanged' in access.data) return json({ code: 'owner_changed', error: 'Your account changed. Reopen the class workspace to continue; this tab keeps its original draft.' }, 409);
    return json(access.data, input.draftId ? 200 : 201);
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: 'Use a valid assessment draft.' }, 400);
    return failure(error);
  }
}
