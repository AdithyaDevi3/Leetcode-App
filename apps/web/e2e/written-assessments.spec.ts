import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { LearnerWrittenAssignment, WrittenAssessmentDraft, WrittenPublication } from '@leetcode-app/database';
import type { WrittenDraftCommand, WrittenDraftResponse, WrittenPublishCommand, WrittenPublishResponse, WrittenSaveCommand, WrittenSaveResponse, WrittenSubmitCommand, WrittenSubmitResponse } from '../src/lib/written-assessment-api-types';

const fixture = '/test-support/written-assessments';
const actorId = '11111111-1111-4111-8111-111111111111', classId = '33333333-3333-4333-8333-333333333333';
const draftId = '55555555-5555-4555-8555-555555555555', publicationId = '66666666-6666-4666-8666-666666666666';
const recipientId = '77777777-7777-4777-8777-777777777777', policyVersionId = '88888888-8888-4888-8888-888888888888', attemptId = '99999999-9999-4999-8999-999999999999';
const stamp = '2026-11-02T12:00:00.000Z';
function initialDraft(): WrittenAssessmentDraft {
  return { id: draftId, classId, createdBy: actorId, revision: 1, status: 'draft', title: 'Synthetic invariant explanation', instructions: 'Explain the preserved invariant.', prompt: 'Write pseudocode that preserves a synthetic loop invariant.',
    criteria: [{ id: 'reasoning', label: 'Reasoning and approach', maxUnits: 125 }, { id: 'correctness', label: 'Correctness and edge cases', maxUnits: 375 }], maxUnits: 500,
    availableAt: null, dueAt: null, closesAt: null, createdAt: stamp, updatedAt: stamp };
}
function model(workspace: 'teach' | 'admin' = 'teach') {
  const draft = initialDraft();
  const assignment: LearnerWrittenAssignment = { recipientId, classId, assignmentId: publicationId, policyVersionId, title: draft.title, instructions: draft.instructions, prompt: draft.prompt, criteria: structuredClone(draft.criteria), maxUnits: draft.maxUnits,
    availableAt: null, dueAt: null, closesAt: null, responseDraft: { revision: 0, text: '', updatedAt: null }, submission: null, releasedGrade: null, isOpen: true, isClosed: false, isExcused: false };
  return { workspace, draft, assignment, publication: null as WrittenPublication | null,
    learners: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', displayName: 'Synthetic learner A', email: null }, { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', displayName: 'Synthetic learner B', email: null }], fingerprint: 'a'.repeat(64),
    saves: [] as WrittenDraftCommand[], publishes: [] as WrittenPublishCommand[], responses: [] as WrittenSaveCommand[], submits: [] as WrittenSubmitCommand[],
    receipts: new Map<string, WrittenDraftResponse | WrittenPublishResponse | WrittenSaveResponse | WrittenSubmitResponse>(),
    abortAuthor: false, abortPublish: false, abortResponse: false, abortSubmit: false, changedAccount: false, malformed: false, holdResponse: false, release: null as (() => void) | null };
}
type Model = ReturnType<typeof model>;
function learnerView(state: Model) {
  const view = structuredClone(state.assignment);
  if (!view.isOpen || view.isExcused) { view.prompt = ''; view.criteria = []; view.responseDraft = { revision: 0, text: '', updatedAt: null }; view.submission = null; view.releasedGrade = null; }
  return view;
}
async function connect(page: Page, state: Model) {
  await page.route('**/api/assessments/written**', async route => {
    const request = route.request(), url = new URL(request.url()); expect(request.headers()['x-written-actor']).toBe(actorId); expect(url.searchParams.get('workspace')).toBe(state.workspace);
    if (state.changedAccount) { await route.fulfill({ status: 409, json: { error: 'owner_changed', message: 'Synthetic account changed.' } }); return; }
    if (request.method() === 'GET') {
      await route.fulfill({ json: url.pathname.endsWith('/written') ? { actorId, classId, drafts: [structuredClone(state.draft)] } : { actorId, author: { draft: structuredClone(state.draft), learners: structuredClone(state.learners), rosterFingerprint: state.fingerprint, publication: state.publication } } }); return;
    }
    const publishing = url.pathname.endsWith('/publications'), body = request.postDataJSON() as WrittenDraftCommand | WrittenPublishCommand;
    if (publishing) state.publishes.push(body as WrittenPublishCommand); else state.saves.push(body as WrittenDraftCommand);
    let accepted = state.receipts.get(body.requestKey);
    if (!accepted) {
      if (publishing) {
        const command = body as WrittenPublishCommand;
        if (command.expectedRevision !== state.draft.revision || command.expectedRosterFingerprint !== state.fingerprint) { await route.fulfill({ status: 409, json: { error: 'written_conflict', message: 'Synthetic saved content or roster changed.' } }); return; }
        state.publication = { id: publicationId, draftId, draftRevision: command.expectedRevision, classId, assignmentId: publicationId, policyVersionId, recipientCount: command.audience.learnerIds.length, audienceKind: command.audience.kind, publishedAt: stamp };
        accepted = { actorId, publication: structuredClone(state.publication) };
      } else {
        const command = body as WrittenDraftCommand;
        if (command.draftId && command.expectedRevision !== state.draft.revision) { await route.fulfill({ status: 409, json: { error: 'written_conflict', message: 'Synthetic saved content changed.' } }); return; }
        state.draft = { ...state.draft, ...structuredClone(command.draft), id: draftId, revision: command.draftId ? state.draft.revision + 1 : 1, maxUnits: command.draft.criteria.reduce((sum, item) => sum + item.maxUnits, 0) };
        accepted = { actorId, draft: structuredClone(state.draft), currentRevision: state.draft.revision };
      }
      state.receipts.set(body.requestKey, structuredClone(accepted));
    }
    const abort = publishing ? state.abortPublish : state.abortAuthor;
    if (publishing) state.abortPublish = false; else state.abortAuthor = false;
    if (abort) { await route.abort('failed'); return; }
    await route.fulfill({ json: 'draft' in accepted ? { ...accepted, currentRevision: state.draft.revision } : accepted });
  });
  await page.route('**/api/learner/assignments/*/written**', async route => {
    const request = route.request(), url = new URL(request.url()); expect(request.headers()['x-written-actor']).toBe(actorId);
    if (state.changedAccount) { await route.fulfill({ status: 409, json: { error: 'owner_changed', message: 'Synthetic account changed.' } }); return; }
    if (request.method() === 'GET') {
      const assignment = learnerView(state); if (state.malformed) Object.assign(assignment, { privateNote: 'FORGED_PRIVATE_WRITTEN_DATA' });
      await route.fulfill({ json: { actorId, assignment } }); return;
    }
    const submitting = url.pathname.endsWith('/submissions'), body = request.postDataJSON() as WrittenSaveCommand | WrittenSubmitCommand;
    if (submitting) state.submits.push(body); else state.responses.push(body as WrittenSaveCommand);
    let accepted = state.receipts.get(body.requestKey);
    if (!accepted) {
      if (state.assignment.isExcused || !state.assignment.isOpen || state.assignment.isClosed) { await route.fulfill({ status: 404, json: { error: 'not_found', message: 'Synthetic assignment is unavailable for new work.' } }); return; }
      if (body.expectedRevision !== state.assignment.responseDraft.revision || state.assignment.submission) { await route.fulfill({ status: 409, json: { error: 'written_conflict', message: 'Synthetic response changed.' } }); return; }
      if (submitting) {
        state.assignment.submission = { attemptId, responseRevisionId: publicationId, responseRevision: body.expectedRevision, submittedAt: stamp, isLate: false };
        accepted = { actorId, recipientId, submission: structuredClone(state.assignment.submission) };
      } else {
        const command = body as WrittenSaveCommand;
        state.assignment.responseDraft = { revision: command.expectedRevision + 1, text: command.text, updatedAt: stamp };
        accepted = { actorId, recipientId, responseDraft: structuredClone(state.assignment.responseDraft), currentRevision: state.assignment.responseDraft.revision };
      }
      state.receipts.set(body.requestKey, structuredClone(accepted));
    }
    if (!submitting && state.holdResponse) { state.holdResponse = false; await new Promise<void>(resolve => { state.release = resolve; }); }
    const abort = submitting ? state.abortSubmit : state.abortResponse;
    if (submitting) state.abortSubmit = false; else state.abortResponse = false;
    if (abort) { await route.abort('failed'); return; }
    await route.fulfill({ json: 'responseDraft' in accepted ? { ...accepted, currentRevision: state.assignment.responseDraft.revision } : accepted });
  });
}
async function open(page: Page, state: Model, mode: 'library' | 'new' | 'author' | 'learner' = 'author') {
  await connect(page, state); await page.goto(`${fixture}?mode=${mode}&workspace=${state.workspace}`);
  if (mode === 'author') await expect(page.getByLabel('Assignment title', { exact: true })).toHaveValue(state.draft.title);
  if (mode === 'new') await expect(page.getByLabel('Assignment title', { exact: true })).toBeVisible();
  if (mode === 'learner' && !state.assignment.isExcused && state.assignment.isOpen) await expect(page.getByLabel('Pseudocode or written response', { exact: true })).toBeVisible();
}
async function savedResponse(page: Page, value = 'Maintain the synthetic invariant.') {
  await page.getByLabel('Pseudocode or written response', { exact: true }).fill(value); await page.getByRole('button', { name: 'Save written response', exact: true }).click();
  await expect(page.getByLabel('Written response save status', { exact: true })).toContainText('Revision 1');
}
async function submit(page: Page) {
  await page.getByRole('button', { name: 'Review final submission', exact: true }).click(); await page.getByRole('checkbox', { name: 'I reviewed this saved response and am ready to submit.' }).check();
  await page.getByRole('button', { name: 'Submit written response', exact: true }).click();
}

test('class written library opens drafts without writing or assigning', async ({ page }) => {
  const state = model(); await open(page, state, 'library');
  await expect(page.getByRole('region', { name: 'Written assignment drafts' })).toContainText(state.draft.title);
  await expect(page.getByRole('link', { name: 'Create written assignment' })).toHaveAttribute('href', `/teach/${classId}/written/new`);
  await expect(page.getByRole('link', { name: 'Open written draft', exact: true })).toHaveAttribute('href', `/teach/${classId}/written/${draftId}`);
  expect(state.saves).toHaveLength(0); expect(state.publishes).toHaveLength(0);
});
for (const workspace of ['teach', 'admin'] as const) test(`${workspace} saves ordered exact-point criteria then explicitly assigns selected learners`, async ({ page }) => {
  const state = model(workspace); await open(page, state);
  await page.getByLabel('Assignment title', { exact: true }).fill('Synthetic revised written task');
  await page.getByRole('button', { name: 'Move criterion 2 up', exact: true }).click();
  await page.getByLabel('Criterion 1 points', { exact: true }).fill('2.25');
  await expect(page.getByRole('button', { name: 'Assign written work', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Save private written draft', exact: true }).click();
  await expect(page.getByLabel('Written draft save status', { exact: true })).toContainText('Saved revision 2');
  expect(state.saves[0].draft.criteria.map(item => [item.id, item.maxUnits])).toEqual([['correctness', 225], ['reasoning', 125]]); expect(state.publishes).toHaveLength(0);
  await page.getByLabel('Assignment audience', { exact: true }).selectOption('selected'); await page.getByRole('checkbox', { name: 'Synthetic learner B', exact: true }).check();
  await page.getByRole('checkbox', { name: 'I reviewed this saved revision and the exact recipient list.' }).check(); await page.getByRole('button', { name: 'Assign written work', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Written publication receipt' })).toContainText('1 learners');
  expect(state.publishes[0]).toEqual({ expectedRevision: 2, expectedRosterFingerprint: 'a'.repeat(64), audience: { kind: 'selected', learnerIds: ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'] }, requestKey: expect.any(String) });
  if (workspace === 'admin') { await expect(page.getByText('Administrative class management does not grant private grading access.')).toBeVisible(); await expect(page.getByRole('link', { name: 'Review written submissions' })).toHaveCount(0); }
  else await expect(page.getByRole('link', { name: 'Review written submissions' })).toHaveAttribute('href', `/teach/${classId}/submissions`);
});
test('new draft lost response recovers the exact create receipt after reload without another draft', async ({ page }) => {
  const state = model(); state.abortAuthor = true; await open(page, state, 'new');
  await page.getByLabel('Assignment title', { exact: true }).fill('Synthetic new written task'); await page.getByLabel('Assignment prompt', { exact: true }).fill('Explain the synthetic invariant.');
  await page.getByRole('button', { name: 'Save private written draft', exact: true }).click(); await expect(page.getByRole('alert', { name: 'Written author error' })).toBeVisible();
  await page.reload(); await page.getByRole('button', { name: 'Retry earlier author request', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Open saved written draft' })).toHaveAttribute('href', `/teach/${classId}/written/${draftId}`); expect(state.saves[1]).toEqual(state.saves[0]);
  await page.reload(); await expect(page.getByRole('link', { name: 'Open saved written draft' })).toBeVisible(); expect(state.saves).toHaveLength(2); expect(state.publishes).toHaveLength(0);
});
test('escaped long prompt retains exact uncertain save after reload and later source edits', async ({ page }) => {
  const state = model(); state.abortAuthor = true; await open(page, state);
  const longPrompt = 'Explain ' + '"'.repeat(19_000) + ' synthetic invariant.';
  expect(longPrompt.length).toBeLessThanOrEqual(20_000);
  expect(JSON.stringify({ prompt: longPrompt }).length).toBeGreaterThan(30_000);
  await page.getByLabel('Assignment prompt', { exact: true }).fill(longPrompt); await page.getByRole('button', { name: 'Save private written draft', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'Written author error' })).toBeVisible(); state.draft = { ...state.draft, revision: 3, title: 'Synthetic newer saved task', prompt: 'Newer server content.' };
  await page.reload(); await page.getByRole('button', { name: 'Retry earlier author request', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Written author comparison' })).toBeVisible(); expect(state.saves[1]).toEqual(state.saves[0]);
  await expect(page.getByLabel('Assignment prompt', { exact: true })).toHaveValue(longPrompt);
  await page.getByRole('button', { name: 'Load saved content and keep browser copy' }).click(); await expect(page.getByLabel('Assignment prompt', { exact: true })).toHaveValue('Newer server content.');
  await page.getByText('Preserved assignment content', { exact: true }).click(); await expect(page.getByRole('button', { name: 'Restore assignment content' })).toBeEnabled();
});
test('uncertain publication recovers the original frozen audience after roster changes', async ({ page }) => {
  const state = model(); state.abortPublish = true; await open(page, state);
  await page.getByRole('checkbox', { name: 'I reviewed this saved revision and the exact recipient list.' }).check(); await page.getByRole('button', { name: 'Assign written work', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'Written author error' })).toBeVisible(); state.learners = []; state.fingerprint = 'b'.repeat(64);
  await page.reload(); await page.getByRole('button', { name: 'Retry earlier author request', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Written publication receipt' })).toContainText('2 learners'); expect(state.publishes[1]).toEqual(state.publishes[0]);
});
test('learner indentation, save, explicit final review and released-only grade complete the written task', async ({ page }) => {
  const state = model(); await open(page, state, 'learner');
  const editor = page.getByLabel('Pseudocode or written response', { exact: true });
  await editor.fill('if invariant:'); await editor.press('End'); await editor.press('Enter'); await editor.press('Tab'); await expect(editor).toHaveValue('if invariant:\n        '); await editor.press('Shift+Tab'); await expect(editor).toHaveValue('if invariant:\n    ');
  await editor.press('Escape'); await editor.press('Tab'); await expect(editor).not.toBeFocused();
  await editor.fill('Maintain the synthetic invariant.'); await page.getByRole('button', { name: 'Save written response', exact: true }).click(); await expect(page.getByLabel('Written response save status', { exact: true })).toContainText('Revision 1');
  await submit(page); await expect(page.getByRole('region', { name: 'Written submission receipt' })).toContainText('Your grade appears after your instructor releases it.'); await expect(page.getByRole('region', { name: 'Written response editor' })).toContainText('Maintain the synthetic invariant.');
  await expect(editor).toHaveCount(0); expect(state.submits).toHaveLength(1);
  state.assignment.releasedGrade = { gradeRevisionId: draftId, earnedUnits: 400, criterionScores: { reasoning: 125, correctness: 275 }, learnerFeedback: 'Synthetic published feedback.', publishedAt: stamp };
  await page.getByRole('button', { name: 'Refresh saved response', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Written submission receipt' })).toContainText('Published score: 4 / 5'); await expect(page.getByRole('region', { name: 'Written submission receipt' })).toContainText('Synthetic published feedback.');
});
test('empty saved response is allowed but cannot be finally submitted', async ({ page }) => {
  const state = model(); await open(page, state, 'learner'); await savedResponse(page);
  await page.getByLabel('Pseudocode or written response', { exact: true }).fill(''); await page.getByRole('button', { name: 'Save written response', exact: true }).click();
  await expect(page.getByLabel('Written response save status', { exact: true })).toContainText('Revision 2'); await expect(page.getByRole('button', { name: 'Review final submission', exact: true })).toBeDisabled(); expect(state.responses[1].text).toBe(''); expect(state.submits).toHaveLength(0);
});
test('lost learner save recovers its exact receipt and preserves comparison with a newer server revision', async ({ page }) => {
  const state = model(); state.abortResponse = true; await open(page, state, 'learner');
  await page.getByLabel('Pseudocode or written response', { exact: true }).fill('Earlier synthetic browser response.'); await page.getByRole('button', { name: 'Save written response', exact: true }).click(); await expect(page.getByRole('alert', { name: 'Written response error' })).toBeVisible();
  state.assignment.responseDraft = { revision: 2, text: 'Newer synthetic server response.', updatedAt: stamp }; await page.reload();
  await page.getByRole('button', { name: 'Retry earlier response request', exact: true }).click(); await expect(page.getByRole('region', { name: 'Written response comparison' })).toBeVisible(); expect(state.responses[1]).toEqual(state.responses[0]);
  await expect(page.getByRole('button', { name: 'Load saved response and keep browser copy' })).toBeEnabled();
  await expect(page.getByLabel('Pseudocode or written response', { exact: true })).toHaveValue('Earlier synthetic browser response.');
  await expect(page.getByRole('region', { name: 'Pending written response request' })).toHaveCount(0);
  await page.reload(); await expect(page.getByRole('region', { name: 'Written response comparison' })).toBeVisible();
  await expect(page.getByLabel('Pseudocode or written response', { exact: true })).toHaveValue('Earlier synthetic browser response.'); expect(state.responses).toHaveLength(2);
  await expect(page.getByRole('region', { name: 'Pending written response request' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Load saved response and keep browser copy' }).click(); await expect(page.getByLabel('Pseudocode or written response', { exact: true })).toHaveValue('Newer synthetic server response.');
  await page.getByText('Preserved browser response', { exact: true }).click(); await page.getByRole('button', { name: 'Restore browser response', exact: true }).click(); await expect(page.getByLabel('Pseudocode or written response', { exact: true })).toHaveValue('Earlier synthetic browser response.');
});
test('another-device finalization retains different browser work as an accessible read-only copy', async ({ page }) => {
  const state = model(); await open(page, state, 'learner'); await savedResponse(page, 'Original synthetic saved response.');
  await page.getByLabel('Pseudocode or written response', { exact: true }).fill('Different unsaved browser reasoning.');
  state.assignment.responseDraft = { revision: 2, text: 'Authoritative response submitted on another device.', updatedAt: stamp };
  state.assignment.submission = { attemptId, responseRevisionId: publicationId, responseRevision: 2, submittedAt: stamp, isLate: false };
  await page.getByRole('button', { name: 'Refresh saved response', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Written response editor' })).toContainText('Authoritative response submitted on another device.');
  await page.getByText('Preserved browser response', { exact: true }).click(); await expect(page.getByText('Different unsaved browser reasoning.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restore browser response', exact: true })).toHaveCount(0); await expect(page.getByRole('region', { name: 'Written submission receipt' })).toContainText(attemptId);
  expect(state.submits).toHaveLength(0);
});
test('accepted final receipt survives lost reply, later excusal, reload recovery and another reload', async ({ page }) => {
  const state = model(); state.abortSubmit = true; await open(page, state, 'learner'); await savedResponse(page); await submit(page); await expect(page.getByRole('alert', { name: 'Written response error' })).toBeVisible();
  state.assignment.isExcused = true; await page.reload(); await expect(page.getByRole('region', { name: 'Written assignment excused' })).toBeVisible(); await expect(page.getByRole('region', { name: 'Frozen assignment prompt' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Retry earlier response request', exact: true }).click(); await expect(page.getByRole('region', { name: 'Written submission receipt' })).toContainText(attemptId); expect(state.submits[1]).toEqual(state.submits[0]);
  await page.reload(); await expect(page.getByRole('region', { name: 'Written submission receipt' })).toContainText(attemptId); await expect(page.getByText('Maintain the synthetic invariant.', { exact: true })).toHaveCount(0); expect(state.submits).toHaveLength(2);
  await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await expect(page.getByRole('region', { name: 'Written submission receipt' })).toHaveCount(0);
  state.changedAccount = true; await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await expect(page.getByRole('alert', { name: 'Written access error' })).toContainText('Your account changed'); await expect(page.getByText(attemptId, { exact: true })).toHaveCount(0);
});
test('opening and closing eligibility hides future content and prevents new writes', async ({ page }) => {
  const state = model(); state.assignment.isOpen = false; await open(page, state, 'learner'); await expect(page.getByRole('region', { name: 'Frozen assignment prompt' })).toHaveCount(0); await expect(page.getByLabel('Pseudocode or written response', { exact: true })).toHaveCount(0);
  state.assignment.isOpen = true; state.assignment.isClosed = true; state.assignment.responseDraft = { revision: 1, text: 'Saved before closing.', updatedAt: stamp };
  await page.reload(); await expect(page.getByLabel('Pseudocode or written response', { exact: true })).toHaveValue('Saved before closing.'); await expect(page.getByRole('button', { name: 'Save written response', exact: true })).toBeDisabled(); expect(state.responses).toHaveLength(0);
});
test('malformed private learner projection is rejected before any content is rendered', async ({ page }) => {
  const state = model(); state.malformed = true; await connect(page, state); await page.goto(`${fixture}?mode=learner`);
  await expect(page.getByRole('alert', { name: 'Written access error' })).toContainText('could not be verified'); await expect(page.getByRole('region', { name: 'Frozen assignment prompt' })).toHaveCount(0); await expect(page.getByText('FORGED_PRIVATE_WRITTEN_DATA')).toHaveCount(0);
});
test('late accepted save cannot display old owner work after blur and account change', async ({ page }) => {
  const state = model(); state.holdResponse = true; await open(page, state, 'learner'); await page.getByLabel('Pseudocode or written response', { exact: true }).fill('Synthetic private old-owner response.'); await page.getByRole('button', { name: 'Save written response', exact: true }).click();
  await expect.poll(() => Boolean(state.release)).toBe(true); await page.evaluate(() => window.dispatchEvent(new Event('blur'))); state.changedAccount = true; await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await expect(page.getByRole('alert', { name: 'Written access error' })).toContainText('Your account changed'); state.release!();
  await expect(page.getByLabel('Pseudocode or written response', { exact: true })).toHaveCount(0); await expect(page.getByText('Synthetic private old-owner response.', { exact: true })).toHaveCount(0); await expect(page.getByRole('region', { name: 'Written submission receipt' })).toHaveCount(0);
});
for (const mode of ['author', 'learner'] as const) test(`${mode} written workspace supports phone reflow and accessible controls`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); const state = model(); await open(page, state, mode);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze(); expect(results.violations).toEqual([]);
});
