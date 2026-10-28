import { expect, test, type Page } from '@playwright/test';
import type { LearnerQuizAssignment, QuizAnswers } from '@leetcode-app/database';

const fixture = '/test-support/class-quizzes';
const classId = '11111111-1111-4111-8111-111111111111';
const authorId = '22222222-2222-4222-8222-222222222222';
const draftId = '33333333-3333-4333-8333-333333333333';
const learnerId = '44444444-4444-4444-8444-444444444444';
const otherLearnerId = '55555555-5555-4555-8555-555555555555';
const recipientId = '99999999-9999-4999-8999-999999999999';
const gradeId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const firstQuestion = 'pair-distinct-indices@1';
const secondQuestion = 'pair-hash-map-cost@1';
const cacheKey = `method:quiz:${learnerId}:${recipientId}:88888888-8888-4888-8888-888888888888`;
type Save = { expectedRevision: number; answers: QuizAnswers; requestKey: string };
type Submit = { expectedRevision: number; requestKey: string };
type Publish = { expectedRevision: number; audience: { kind: 'class' | 'selected'; learnerIds: string[] }; expectedRosterFingerprint: string; requestKey: string };

function initialAssignment(): LearnerQuizAssignment {
  return {
    recipientId, classId, assignmentId: '77777777-7777-4777-8777-777777777777', policyVersionId: '88888888-8888-4888-8888-888888888888', title: 'Class reasoning checkpoint', instructions: 'Choose the best answer for each question.',
    maxUnits: 1000, availableAt: null, dueAt: null, closesAt: null, questionCount: 2, isOpen: true, isClosed: false,
    questions: [
      { questionId: 'pair-distinct-indices', version: 1, versionId: firstQuestion, kind: 'multiple_choice', title: 'Avoid reusing the current index', prompt: 'Pair With Target must return two distinct indices. While scanning left to right with a map of previously seen values, which order prevents a single value 4 from incorrectly matching itself when the target is 8?', difficulty: 'foundation', activityIds: ['pair-with-target-v1'], conceptIds: ['hash-maps', 'complement-reasoning'], maxUnits: 500, options: [{ id: 'a', text: 'Store the current value and index, then search for its complement.' }, { id: 'b', text: 'Search the existing map for the complement, then store the current value and index.' }, { id: 'c', text: 'Return the current index twice whenever the current value is half the target.' }, { id: 'd', text: 'Ignore every value that is half the target, even if it occurs twice.' }] },
      { questionId: 'pair-hash-map-cost', version: 1, versionId: secondQuestion, kind: 'multiple_choice', title: 'Account for the map', prompt: 'A Pair With Target solution scans n values once and stores previously seen values in a hash map. Assuming expected constant-time map lookup and insertion, what expected running time and worst-case auxiliary storage should be reported?', difficulty: 'intermediate', activityIds: ['pair-with-target-v1'], conceptIds: ['hash-maps', 'complexity-analysis'], maxUnits: 500, options: [{ id: 'a', text: 'O(n) scan time and O(1) auxiliary storage.' }, { id: 'b', text: 'O(n²) scan time and O(n) auxiliary storage.' }, { id: 'c', text: 'O(n) expected scan time and O(n) auxiliary storage.' }, { id: 'd', text: 'O(log n) scan time and O(1) auxiliary storage.' }] },
    ],
    answerDraft: { revision: 0, answers: {}, updatedAt: null }, submission: null, releasedGrade: null,
  };
}

function model() {
  return {
    assignment: initialAssignment(), saves: [] as Save[], submits: [] as Submit[], publishes: [] as Publish[], releases: [] as { expectedPublicationSequence: number; requestKey: string }[],
    failSaveReply: false, failSubmitReply: false, failPublishReply: false, failReleaseReply: false, rejectSave: false, ownerChanged: false,
    oldSaveHead: null as number | null, publication: null as Record<string, unknown> | null, authorRevision: 1,
    saveReceipts: new Map<string, LearnerQuizAssignment['answerDraft']>(),
    submitReceipts: new Map<string, NonNullable<LearnerQuizAssignment['submission']>>(),
  };
}
type Model = ReturnType<typeof model>;

async function connect(page: Page, state: Model) {
  page.on('dialog', dialog => dialog.accept());
  await page.route(`**/api/assessments/drafts/${draftId}/publications?*`, async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { draft: { id: draftId, classId, title: state.assignment.title, instructions: state.assignment.instructions, questions: [{ questionVersionId: firstQuestion, maxUnits: 500 }, { questionVersionId: secondQuestion, maxUnits: 500 }], availableAt: null, dueAt: null, closesAt: null, revision: state.authorRevision, maxUnits: 1000, status: 'draft', createdBy: authorId, createdAt: '2026-10-27T12:00:00.000Z', updatedAt: '2026-10-27T12:00:00.000Z' }, learners: [{ id: learnerId, displayName: 'Sample Learner' }, { id: otherLearnerId, displayName: 'Second Learner' }], rosterFingerprint: 'a'.repeat(64), publication: state.publication } });
      return;
    }
    expect(route.request().headers()['x-assessment-author']).toBe(authorId);
    const request = route.request().postDataJSON() as Publish;
    state.publishes.push(request);
    state.publication ??= { id: '66666666-6666-4666-8666-666666666666', draftId, draftRevision: request.expectedRevision, classId, assignmentId: state.assignment.assignmentId, policyVersionId: state.assignment.policyVersionId, recipientCount: request.audience.learnerIds.length, audienceKind: request.audience.kind, publishedAt: '2026-10-27T12:00:00.000Z' };
    if (state.failPublishReply) { state.failPublishReply = false; await route.abort('failed'); return; }
    await route.fulfill({ json: { publication: state.publication } });
  });
  await page.route(`**/api/learner/assignments/${recipientId}/quiz`, async route => {
    if (route.request().method() === 'GET') { await route.fulfill({ json: { learnerId, assignment: state.assignment } }); return; }
    expect(route.request().headers()['x-quiz-learner']).toBe(learnerId);
    const request = route.request().postDataJSON() as Save;
    state.saves.push(request);
    if (state.ownerChanged) { await route.fulfill({ status: 409, json: { code: 'owner_changed', error: 'The signed-in learner changed. Reopen the quiz.' } }); return; }
    if (state.rejectSave) { state.rejectSave = false; await route.fulfill({ status: 400, json: { error: 'An option is no longer valid for this request.' } }); return; }
    let answerDraft = state.saveReceipts.get(request.requestKey);
    if (!answerDraft) {
      if (request.expectedRevision !== state.assignment.answerDraft.revision) { await route.fulfill({ status: 409, json: { code: 'revision_changed', error: 'The saved answers changed.' } }); return; }
      answerDraft = { revision: request.expectedRevision + 1, answers: request.answers, updatedAt: '2026-10-27T12:00:00.000Z' };
      state.assignment.answerDraft = answerDraft; state.saveReceipts.set(request.requestKey, answerDraft);
    }
    if (state.failSaveReply) { state.failSaveReply = false; await route.abort('failed'); return; }
    await route.fulfill({ json: { answerDraft, currentRevision: state.oldSaveHead ?? state.assignment.answerDraft.revision } });
  });
  await page.route(`**/api/learner/assignments/${recipientId}/quiz/submissions`, async route => {
    expect(route.request().headers()['x-quiz-learner']).toBe(learnerId);
    const request = route.request().postDataJSON() as Submit;
    state.submits.push(request);
    let submission = state.submitReceipts.get(request.requestKey);
    if (!submission) {
      if (state.assignment.submission || request.expectedRevision !== state.assignment.answerDraft.revision) { await route.fulfill({ status: 409, json: { code: 'submitted', error: 'This quiz changed or was already submitted.' } }); return; }
      submission = { attemptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', responseRevisionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', answerRevision: request.expectedRevision, submittedAt: '2026-10-27T12:01:00.000Z', isLate: false };
      state.assignment.submission = submission; state.submitReceipts.set(request.requestKey, submission);
    }
    if (state.failSubmitReply) { state.failSubmitReply = false; await route.abort('failed'); return; }
    await route.fulfill({ json: { submission } });
  });
  await page.route(`**/api/instructor/submissions/${recipientId}/grades/${gradeId}/publications`, async route => {
    expect(route.request().headers()['x-assessment-author']).toBe(authorId);
    state.releases.push(route.request().postDataJSON());
    state.assignment.releasedGrade = { gradeRevisionId: gradeId, earnedUnits: 500, publishedAt: '2026-10-27T12:02:00.000Z' };
    if (state.failReleaseReply) { state.failReleaseReply = false; await route.abort('failed'); return; }
    await route.fulfill({ json: { publication: { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', sequence: 1, gradeRevisionId: gradeId, publishedAt: '2026-10-27T12:02:00.000Z' } } });
  });
}

const chooseFirst = (page: Page, value = 'b') => page.locator(`input[name="quiz-${firstQuestion}"][value="${value}"]`).check();
const capture = async (page: Page, name: string) => {
  if (process.env.METHOD_CAPTURE_UI === '1') await page.screenshot({ path: `../../.local-docs/e3-${name}.png`, fullPage: true });
};

test('admin assigns selected learners, learner resumes and submits, instructor releases a persistent score', async ({ page, context }) => {
  const state = model(); await connect(page, state);
  await page.goto(`${fixture}?workspace=admin`);
  await page.getByRole('button', { name: 'Load class audience' }).click();
  await page.getByRole('radio', { name: 'Selected learners', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Sample Learner', exact: true }).check();
  await expect(page.getByRole('status', { name: 'Quiz audience count' })).toHaveText('1 learner selected');
  await page.getByRole('checkbox', { name: /I confirm this saved version/ }).check();
  await capture(page, 'author-desktop');
  await page.getByRole('button', { name: 'Assign quiz', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Assigned to 1 learner', exact: true })).toBeVisible();
  expect(state.publishes[0]).toMatchObject({ expectedRevision: 1, audience: { kind: 'selected', learnerIds: [learnerId] }, expectedRosterFingerprint: 'a'.repeat(64) });
  await page.goto(`${fixture}?view=learner`);
  await chooseFirst(page);
  await expect(page.getByRole('button', { name: 'Review and submit' })).toBeDisabled();
  await page.getByRole('button', { name: 'Save answers', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Answer save status' })).toContainText('Revision 1');
  await capture(page, 'learner-desktop');
  const resumed = await context.newPage(); await connect(resumed, state);
  await resumed.goto(`${fixture}?view=learner`);
  await expect(resumed.locator(`input[name="quiz-${firstQuestion}"][value="b"]`)).toBeChecked();
  await resumed.getByRole('button', { name: 'Review and submit' }).click();
  await expect(resumed.getByText('1 unanswered question will earn zero points.', { exact: false })).toBeVisible();
  await resumed.getByRole('button', { name: 'Confirm final submission' }).click();
  await expect(resumed.getByRole('region', { name: 'Submission receipt' })).toContainText('Quiz submitted');
  await expect(resumed.getByText('Published score:', { exact: false })).toHaveCount(0);
  await expect(resumed.getByRole('button', { name: 'Save answers', exact: true })).toHaveCount(0);
  await page.goto(`${fixture}?view=instructor`);
  await expect(page.getByText('5 / 10', { exact: true })).toBeVisible();
  await capture(page, 'instructor-desktop');
  await page.getByRole('checkbox', { name: /I reviewed the saved submission/ }).check();
  await page.getByRole('button', { name: 'Release grade', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Quiz release status' })).toContainText('Grade released');
  await resumed.reload();
  await expect(resumed.getByText('Published score: 5 / 10', { exact: true })).toBeVisible();
  await resumed.reload();
  await expect(resumed.getByRole('region', { name: 'Submission receipt' })).toContainText('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  expect(state.submits).toHaveLength(1); expect(state.releases).toHaveLength(1);
  await resumed.close();
});

test('publication blocks unsaved edits and retries an uncertain request without changing its identity', async ({ page }) => {
  const state = model(); state.failPublishReply = true; await connect(page, state);
  await page.goto(fixture);
  await page.getByRole('button', { name: 'Load class audience' }).click();
  await page.getByRole('checkbox', { name: /I confirm this saved version/ }).check();
  await page.getByLabel('Quiz title', { exact: true }).fill('An unsaved changed quiz');
  await expect(page.getByRole('button', { name: 'Assign quiz', exact: true })).toBeDisabled();
  await page.getByLabel('Quiz title', { exact: true }).fill(state.assignment.title);
  await page.getByRole('button', { name: 'Assign quiz', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'Quiz publication error' })).toBeVisible();
  await expect(page.getByRole('radio', { name: /All current learners/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Retry assignment' }).click();
  await expect(page.getByRole('heading', { name: 'Assigned to 2 learners', exact: true })).toBeVisible();
  expect(state.publishes).toHaveLength(2); expect(state.publishes[1]).toEqual(state.publishes[0]);
});

test('lost answer-save response survives reload and retries the same payload/key', async ({ page }) => {
  const state = model(); state.failSaveReply = true; await connect(page, state);
  await page.goto(`${fixture}?view=learner`); await chooseFirst(page);
  await page.getByRole('button', { name: 'Save answers', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'Quiz request error' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Retry save', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Answer save status' })).toContainText('Revision 1');
  expect(state.saves).toHaveLength(2); expect(state.saves[1]).toEqual(state.saves[0]);
});

test('publication reload recovers an accepted assignment and clears its pending browser request', async ({ page }) => {
  const state = model(); state.failPublishReply = true; await connect(page, state);
  await page.goto(fixture); await page.getByRole('button', { name: 'Load class audience' }).click();
  await page.getByRole('checkbox', { name: /I confirm this saved version/ }).check();
  await page.getByRole('button', { name: 'Assign quiz', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'Quiz publication error' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('status', { name: 'Quiz publication status' })).toContainText('Assignment confirmed: revision 1, 2 learners');
  await expect(page.getByRole('heading', { name: 'Assigned to 2 learners', exact: true })).toBeVisible();
  expect(state.publishes).toHaveLength(1);
  expect(await page.evaluate(key => sessionStorage.getItem(key), `method:quiz-publication:${authorId}:${classId}:${draftId}`)).toBeNull();
});

for (const receipt of ['missing', 'mismatched'] as const) {
  test(`${receipt} successful save receipt keeps choices and the original retry identity`, async ({ page }) => {
    const state = model(); await connect(page, state);
    const requests: Save[] = [];
    await page.route(`**/api/learner/assignments/${recipientId}/quiz`, async route => {
      if (route.request().method() === 'GET') { await route.fulfill({ json: { learnerId, assignment: state.assignment } }); return; }
      const request = route.request().postDataJSON() as Save; requests.push(request);
      if (requests.length === 1) {
        await route.fulfill({ json: receipt === 'missing' ? {} : { answerDraft: { revision: 1, answers: { [firstQuestion]: 'a' }, updatedAt: '2026-10-27T12:00:00.000Z' }, currentRevision: 1 } }); return;
      }
      await route.fulfill({ json: { answerDraft: { revision: 1, answers: request.answers, updatedAt: '2026-10-27T12:00:00.000Z' }, currentRevision: 1 } });
    });
    await page.goto(`${fixture}?view=learner`); await chooseFirst(page);
    await page.getByRole('button', { name: 'Save answers', exact: true }).click();
    await expect(page.getByRole('alert', { name: 'Quiz request error' })).toContainText('confirm the saved answers');
    await expect(page.locator(`input[name="quiz-${firstQuestion}"][value="b"]`)).toBeChecked();
    await expect(page.getByRole('button', { name: 'Review and submit' })).toBeDisabled();
    await page.getByRole('button', { name: 'Retry save', exact: true }).click();
    await expect(page.getByRole('status', { name: 'Answer save status' })).toContainText('Revision 1');
    expect(requests[1]).toEqual(requests[0]);
  });
}

test('a closed quiz can recover an already accepted save without allowing new work', async ({ page }) => {
  const state = model(); await connect(page, state);
  const accepted = { revision: 1, answers: { [firstQuestion]: 'b', [secondQuestion]: null }, updatedAt: '2026-10-27T12:00:00.000Z' };
  state.assignment.answerDraft = accepted; state.assignment.isClosed = true;
  const pending: Save = { expectedRevision: 0, answers: accepted.answers, requestKey: 'accepted-before-close' };
  state.saveReceipts.set(pending.requestKey, accepted);
  await page.addInitScript(({ key, request }) => sessionStorage.setItem(key, JSON.stringify({ answers: request.answers, baseline: { revision: 0, answers: {}, updatedAt: null }, recovery: null, pendingSave: request, pendingSubmit: null })), { key: cacheKey, request: pending });
  await page.goto(`${fixture}?view=learner`);
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Answer save status' })).toContainText('Revision 1');
  await expect(page.getByRole('button', { name: 'Save answers', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Review and submit' })).toBeDisabled();
  expect(state.saves).toHaveLength(1); expect(state.saves[0]).toEqual(pending);
});

test('different unsaved browser choices survive repeated reloads against a newer server revision', async ({ page }) => {
  const state = model(); await connect(page, state);
  await page.goto(`${fixture}?view=learner`); await chooseFirst(page, 'a');
  await expect(page.getByRole('status', { name: 'Answer save status' })).toHaveText('Unsaved choices');
  await page.waitForFunction(key => Boolean(sessionStorage.getItem(key)?.includes('"a"')), cacheKey);
  state.assignment.answerDraft = { revision: 3, answers: { [firstQuestion]: 'b' }, updatedAt: '2026-10-27T12:03:00.000Z' };
  await page.reload();
  await expect(page.getByText('Recover different browser choices', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByText('Recover different browser choices', { exact: true }).click();
  await page.getByRole('button', { name: 'Restore browser choices' }).click();
  await expect(page.locator(`input[name="quiz-${firstQuestion}"][value="a"]`)).toBeChecked();
  await page.getByRole('button', { name: 'Save answers', exact: true }).click();
  expect(state.saves[0].expectedRevision).toBe(3);
});

test('revision conflicts preserve choices and require explicit comparison before replacing newer answers', async ({ page }) => {
  const state = model(); await connect(page, state);
  await page.goto(`${fixture}?view=learner`); await chooseFirst(page, 'a');
  state.assignment.answerDraft = { revision: 1, answers: { [firstQuestion]: 'b' }, updatedAt: '2026-10-27T12:00:00.000Z' };
  await page.getByRole('button', { name: 'Save answers', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Answer conflict' })).toBeVisible();
  await expect(page.locator(`input[name="quiz-${firstQuestion}"][value="a"]`)).toBeChecked();
  await page.getByRole('button', { name: 'Load latest saved answers for comparison' }).click();
  await expect(page.getByText('Server revision 1', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Keep my choices as the next edit' }).click();
  await page.getByRole('button', { name: 'Save answers', exact: true }).click();
  expect(state.saves[1].expectedRevision).toBe(1); expect(state.saves[1].requestKey).not.toBe(state.saves[0].requestKey);
});

test('older save receipts never claim the newest server revision or permit final submission', async ({ page }) => {
  const state = model(); state.oldSaveHead = 4; await connect(page, state);
  await page.goto(`${fixture}?view=learner`); await chooseFirst(page);
  await page.getByRole('button', { name: 'Save answers', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'Quiz request error' })).toContainText('server now has newer answers');
  await expect(page.getByRole('button', { name: 'Review and submit' })).toBeDisabled();
  await expect(page.locator(`input[name="quiz-${firstQuestion}"][value="b"]`)).toBeChecked();
});

test('definitive invalid answer rejection permits a corrected payload with a new request key', async ({ page }) => {
  const state = model(); state.rejectSave = true; await connect(page, state);
  await page.goto(`${fixture}?view=learner`); await chooseFirst(page, 'a');
  await page.getByRole('button', { name: 'Save answers', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'Quiz request error' })).toContainText('no longer valid');
  await chooseFirst(page, 'b');
  await page.getByRole('button', { name: 'Save answers', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Answer save status' })).toContainText('Revision 1');
  expect(state.saves[1].requestKey).not.toBe(state.saves[0].requestKey); expect(state.saves[1].answers[firstQuestion]).toBe('b');
});

test('account changes stop writes while retaining the original learner choices', async ({ page }) => {
  const state = model(); state.ownerChanged = true; await connect(page, state);
  await page.goto(`${fixture}?view=learner`); await chooseFirst(page);
  await page.getByRole('button', { name: 'Save answers', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'Quiz account changed' })).toBeVisible();
  await expect(page.locator(`input[name="quiz-${firstQuestion}"][value="b"]`)).toBeChecked();
  await expect(page.getByRole('button', { name: 'Retry save', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Review and submit' })).toBeDisabled();
  expect(state.saves).toHaveLength(1);
});

test('uncertain final submission retries the same saved revision and key', async ({ page }) => {
  const state = model(); state.failSubmitReply = true; await connect(page, state);
  await page.goto(`${fixture}?view=learner`); await chooseFirst(page);
  await page.getByRole('button', { name: 'Save answers', exact: true }).click();
  await page.getByRole('button', { name: 'Review and submit' }).click();
  await page.getByRole('button', { name: 'Confirm final submission' }).click();
  await expect(page.getByRole('button', { name: 'Retry submission', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Retry submission', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Submission receipt' })).toBeVisible();
  expect(state.submits).toHaveLength(2); expect(state.submits[1]).toEqual(state.submits[0]);
});

test('instructor grade release keeps its request key across an uncertain response and reload', async ({ page }) => {
  const state = model(); state.failReleaseReply = true; await connect(page, state);
  await page.goto(`${fixture}?view=instructor`);
  await page.getByRole('checkbox', { name: /I reviewed the saved submission/ }).check();
  await page.getByRole('button', { name: 'Release grade', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'Quiz release error' })).toBeVisible();
  await page.reload(); await page.getByRole('button', { name: 'Retry grade release' }).click();
  await expect(page.getByRole('status', { name: 'Quiz release status' })).toContainText('Grade released');
  expect(state.releases[1]).toEqual(state.releases[0]);
});

test('quiz links use recipient routes while coding cards keep their practice route', async ({ page }) => {
  await page.goto(`${fixture}?view=cards`);
  await expect(page.getByRole('link', { name: /Review submission/ })).toHaveAttribute('href', `/classes/${classId}/assignments/${recipientId}`);
  await expect(page.getByRole('link', { name: /Start task/ })).toHaveAttribute('href', '/practice?problem=pair-with-target');
  await page.goto(`${fixture}?view=grades`);
  await expect(page.getByRole('link', { name: 'View quiz and submission receipt' })).toHaveAttribute('href', `/classes/${classId}/assignments/${recipientId}`);
  await page.goto(`${fixture}?view=gradebook`);
  await expect(page.getByRole('link', { name: "Review Sample Learner's Class reasoning checkpoint" })).toHaveAttribute('href', `/teach/${classId}/assessments/recipients/${recipientId}`);
});

test('scheduled quizzes withhold questions and mobile choice controls stay keyboard accessible', async ({ page }) => {
  const state = model(); const questions = state.assignment.questions;
  state.assignment = { ...state.assignment, isOpen: false, availableAt: '2099-01-01T12:00:00.000Z', questions: [] };
  await connect(page, state); await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${fixture}?view=learner`);
  await expect(page.getByText('Questions and answer entry will be available then.', { exact: false })).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(0);
  state.assignment = { ...state.assignment, isOpen: true, questions };
  await page.reload();
  const first = page.locator(`input[name="quiz-${firstQuestion}"][value="a"]`);
  await first.focus(); await page.keyboard.press('ArrowDown');
  await expect(page.locator(`input[name="quiz-${firstQuestion}"][value="b"]`)).toBeChecked();
  await expect(page.getByRole('link', { name: 'Question 1, answered', exact: true })).toBeVisible();
  const html = await page.content();
  for (const marker of ['correctOptionId', 'misconceptionTags', 'automated-curriculum-author-v1', 'automated-curriculum-review-v1', 'self-matching-index']) expect(html).not.toContain(marker);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await capture(page, 'learner-mobile');
});

test('a malformed publication cache cannot leave assignment controls stuck', async ({ page }) => {
  const state = model(); await connect(page, state);
  const publicationKey = `method:quiz-publication:${authorId}:${classId}:${draftId}`;
  await page.addInitScript(key => sessionStorage.setItem(key, JSON.stringify({ pending: { requestKey: 'incomplete-cache', expectedRevision: 1 } })), publicationKey);
  await page.goto(fixture);
  await page.getByRole('button', { name: 'Load class audience' }).click();
  await page.getByRole('checkbox', { name: /I confirm this saved version/ }).check();
  await expect(page.getByRole('button', { name: 'Assign quiz', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Assign quiz', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Assigned to 2 learners', exact: true })).toBeVisible();
});

test('a newer saved author revision offers a separate comparison without discarding entries', async ({ page }) => {
  const state = model(); state.authorRevision = 2; await connect(page, state);
  await page.goto(`${fixture}?workspace=admin`);
  await page.getByRole('button', { name: 'Load class audience' }).click();
  const latest = page.getByRole('link', { name: 'Open latest saved draft for comparison' });
  await expect(latest).toHaveAttribute('href', `/admin/classes/${classId}/assessments/${draftId}`);
  await expect(latest).toHaveAttribute('target', '_blank');
  await expect(page.getByRole('button', { name: 'Assign quiz', exact: true })).toBeDisabled();
});

test('using the latest submitted answers also adopts the released score and closed state', async ({ page }) => {
  const state = model(); await connect(page, state);
  await page.goto(`${fixture}?view=learner`); await chooseFirst(page, 'a');
  state.assignment.answerDraft = { revision: 1, answers: { [firstQuestion]: 'b' }, updatedAt: '2026-10-27T12:00:00.000Z' };
  await page.getByRole('button', { name: 'Save answers', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Answer conflict' })).toBeVisible();
  state.assignment.isClosed = true;
  state.assignment.submission = { attemptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', responseRevisionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', answerRevision: 1, submittedAt: '2026-10-27T12:01:00.000Z', isLate: false };
  state.assignment.releasedGrade = { gradeRevisionId: gradeId, earnedUnits: 500, publishedAt: '2026-10-27T12:02:00.000Z' };
  await page.getByRole('button', { name: 'Load latest saved answers for comparison' }).click();
  await page.getByRole('button', { name: 'Use server answers', exact: true }).click();
  await expect(page.getByText('Published score: 5 / 10', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save answers', exact: true })).toHaveCount(0);
});
