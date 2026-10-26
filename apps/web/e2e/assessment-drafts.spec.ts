import { expect, test, type Page } from '@playwright/test';
import type { AssessmentDraftInput } from '@leetcode-app/database';

const fixturePath = '/test-support/assessment-drafts';
const classId = '11111111-1111-4111-8111-111111111111';
const authorId = '22222222-2222-4222-8222-222222222222';
const draftId = '33333333-3333-4333-8333-333333333333';
type SaveRequest = { draftId: string | null; expectedRevision: number | null; requestKey: string; draft: AssessmentDraftInput };
const savedDraft = (request: SaveRequest) => ({
  ...request.draft, id: request.draftId ?? draftId, revision: (request.expectedRevision ?? 0) + 1,
  status: 'draft', maxUnits: request.draft.questions.reduce((sum, question) => sum + question.maxUnits, 0),
  createdBy: authorId, createdAt: '2026-10-26T15:00:00.000Z', updatedAt: '2026-10-26T16:00:00.000Z',
});
const selectedQuestions = (page: Page) => page.getByRole('list', { name: 'Selected quiz questions' });

test('teacher searches the reviewed bank, orders questions, sets exact points, and previews without answer keys', async ({ page }) => {
  await page.goto(fixturePath);
  await page.getByLabel('Quiz title', { exact: true }).fill('Reasoning fundamentals quiz');
  await expect(page.getByText('20 matching questions', { exact: true })).toBeVisible();
  await page.getByLabel('Search questions', { exact: true }).fill('Pair With Target');
  await page.getByLabel('Concept', { exact: true }).selectOption('hash-maps');
  await page.getByLabel('Difficulty', { exact: true }).selectOption('intermediate');
  await expect(page.getByText('1 matching questions', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add Account for the map', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add Account for the map', exact: true })).toBeDisabled();
  await page.getByLabel('Search questions', { exact: true }).fill('');
  await page.getByLabel('Difficulty', { exact: true }).selectOption('');
  await page.getByLabel('Concept', { exact: true }).selectOption('tree-recursion');
  await expect(page.getByText('2 matching questions', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add Define the empty-tree depth', exact: true }).click();
  await expect(selectedQuestions(page).getByRole('listitem')).toHaveCount(2);
  await page.getByRole('button', { name: 'Move question 2 up', exact: true }).click();
  await expect(selectedQuestions(page).getByRole('listitem').first()).toContainText('Define the empty-tree depth');
  await page.getByLabel('Points for question 1', { exact: true }).fill('0.25');
  await page.getByLabel('Points for question 2', { exact: true }).fill('1.10');
  await expect(page.getByText('2 selected · 1.35 points', { exact: true })).toBeVisible();
  await page.getByText('Learner preview', { exact: true }).click();
  const preview = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^Learner preview$/ }) });
  await expect(preview).toContainText('Reasoning fundamentals quiz');
  await expect(preview).toContainText('A one-node tree has depth 1.');
  await expect(preview).toContainText('O(n) expected scan time and O(n) auxiliary storage.');
  const html = await page.content();
  for (const privateField of ['correctOptionId', 'misconceptionTags', 'automated-curriculum-author-v1', 'automated-curriculum-review-v1', 'self-matching-index']) {
    expect(html).not.toContain(privateField);
  }
  await page.getByRole('button', { name: 'Remove question 2', exact: true }).click();
  await expect(selectedQuestions(page).getByRole('listitem')).toHaveCount(1);
  await expect(page.getByText('1 selected · 0.25 points', { exact: true })).toBeVisible();
});

test('draft validation preserves entries and never sends fractional point units', async ({ page }) => {
  const requests: SaveRequest[] = [];
  await page.route('**/api/assessments/drafts**', async route => {
    const body = route.request().postDataJSON() as SaveRequest;
    requests.push(body);
    await route.fulfill({ json: { draft: savedDraft(body) } });
  });
  await page.goto(`${fixturePath}?edit=1`);
  await page.getByLabel('Quiz title', { exact: true }).fill('Exact points quiz');
  await page.getByLabel('Points for question 1', { exact: true }).fill('1.001');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'Quiz draft error' })).toContainText('at most two decimal places');
  await expect(page.getByLabel('Points for question 1', { exact: true })).toHaveValue('1.001');
  expect(requests).toHaveLength(0);
  await page.getByLabel('Points for question 1', { exact: true }).fill('0.25');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('Draft saved. Learners cannot see it.', { exact: true })).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ draftId, expectedRevision: 1, draft: { title: 'Exact points quiz', questions: [{ questionVersionId: 'pair-distinct-indices@1', maxUnits: 25 }] } });
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeDisabled();
});

test('teacher retries a lost response after reload with the original key and advances later saves from the receipt', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept());
  const requests: SaveRequest[] = [];
  await page.route('**/api/assessments/drafts**', async route => {
    const request = route.request().postDataJSON() as SaveRequest;
    requests.push(request);
    if (requests.length === 1) { await route.abort('failed'); return; }
    await route.fulfill({ json: { draft: savedDraft(request) } });
  });
  await page.goto(`${fixturePath}?edit=1`);
  await page.getByLabel('Quiz title', { exact: true }).fill('A resilient quiz draft');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'Quiz draft error' })).toBeVisible();
  await expect(page.getByLabel('Quiz title', { exact: true })).toHaveValue('A resilient quiz draft');
  await page.reload();
  await expect(page.getByText('An earlier save needs confirmation. Retry to recover its receipt.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Quiz title', { exact: true })).toHaveValue('A resilient quiz draft');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('Draft saved. Learners cannot see it.', { exact: true })).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
  await page.getByLabel('Instructions', { exact: false }).fill('Explain the state invariant before answering.');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('Revision 3 · Saved', { exact: true })).toBeVisible();
  expect(requests).toHaveLength(3);
  expect(requests[2].expectedRevision).toBe(2);
  expect(requests[2].requestKey).not.toBe(requests[1].requestKey);
});

test('an unsaved browser alternative survives a newer server revision and a second reload before recovery', async ({ page }) => {
  const cacheKey = `method:assessment:${authorId}:${classId}:${draftId}`;
  const initialInput: AssessmentDraftInput = {
    classId, title: 'Week one checkpoint', instructions: 'Choose the best answer.',
    questions: [{ questionVersionId: 'pair-distinct-indices@1', maxUnits: 500 }], availableAt: null, dueAt: null, closesAt: null,
  };
  const stored = savedDraft({ draftId, expectedRevision: 0, requestKey: 'initial-fixture', draft: initialInput });
  const form = {
    title: 'Keep this unsaved browser alternative', instructions: 'These instructions have not been saved to the server.',
    availableAt: '', dueAt: '', closesAt: '',
    questions: [{ questionVersionId: 'pair-distinct-indices@1', points: '5' }, { questionVersionId: 'window-incremental-sum@1', points: '3.25' }],
  };
  await page.addInitScript(({ key, cache }) => {
    if (!window.sessionStorage.getItem(key)) window.sessionStorage.setItem(key, JSON.stringify(cache));
  }, { key: cacheKey, cache: { form, stored, pending: null, savedSignature: JSON.stringify(initialInput) } });
  await page.goto(`${fixturePath}?edit=1&revision=3`);
  await expect(page.getByLabel('Quiz title', { exact: true })).toHaveValue('Week one checkpoint');
  await expect(page.getByText('Recover a different browser draft', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Quiz title', { exact: true })).toHaveValue('Week one checkpoint');
  await page.getByText('Recover a different browser draft', { exact: true }).click();
  await page.getByRole('button', { name: 'Restore browser draft', exact: true }).click();
  await expect(page.getByLabel('Quiz title', { exact: true })).toHaveValue(form.title);
  await expect(page.getByLabel('Instructions', { exact: false })).toHaveValue(form.instructions);
  await expect(selectedQuestions(page).getByRole('listitem')).toHaveCount(2);
  await expect(page.getByLabel('Points for question 2', { exact: true })).toHaveValue('3.25');
});

test('a definitive unavailable-question rejection allows a corrected form to use a fresh save key', async ({ page }) => {
  const requests: SaveRequest[] = [];
  await page.route('**/api/assessments/drafts**', async route => {
    const request = route.request().postDataJSON() as SaveRequest;
    requests.push(request);
    if (requests.length === 1) {
      await route.fulfill({ status: 400, json: { error: 'A selected question is unavailable. Choose a reviewed question.' } });
      return;
    }
    await route.fulfill({ json: { draft: savedDraft(request), currentRevision: 2 } });
  });
  await page.goto(`${fixturePath}?edit=1`);
  await page.getByLabel('Quiz title', { exact: true }).fill('Corrected class quiz');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'Quiz draft error' })).toHaveText('A selected question is unavailable. Choose a reviewed question.');
  await page.getByRole('button', { name: 'Remove question 1', exact: true }).click();
  await page.getByRole('button', { name: 'Add Define the empty-tree depth', exact: true }).click();
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('Draft saved. Learners cannot see it.', { exact: true })).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[1].expectedRevision).toBe(1);
  expect(requests[1].requestKey).not.toBe(requests[0].requestKey);
  expect(requests[1].draft.questions).toEqual([{ questionVersionId: 'tree-depth-empty-base@1', maxUnits: 500 }]);
  expect(requests[1].draft.title).toBe('Corrected class quiz');
});

test('an older accepted receipt cannot claim the current server draft is saved', async ({ page }) => {
  await page.route('**/api/assessments/drafts**', async route => {
    await route.fulfill({ json: { draft: savedDraft(route.request().postDataJSON() as SaveRequest), currentRevision: 4 } });
  });
  await page.goto(`${fixturePath}?edit=1`);
  await page.getByLabel('Quiz title', { exact: true }).fill('Keep the confirmed earlier revision here');
  await page.getByLabel('Instructions', { exact: false }).fill('Compare this with the newer server version before continuing.');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'Quiz draft error' })).toContainText('server has a newer draft');
  await expect(page.getByLabel('Quiz title', { exact: true })).toHaveValue('Keep the confirmed earlier revision here');
  await expect(page.getByLabel('Instructions', { exact: false })).toHaveValue('Compare this with the newer server version before continuing.');
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeDisabled();
  await expect(page.getByText('Revision 2 · Saved', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Draft saved. Learners cannot see it.', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Open latest saved draft in a new tab', exact: true })).toBeVisible();
});

test('an author-change rejection stops saves while preserving the original author’s entries', async ({ page }) => {
  const authors: (string | undefined)[] = [];
  await page.route('**/api/assessments/drafts**', async route => {
    authors.push(route.request().headers()['x-assessment-author']);
    await route.fulfill({ status: 409, json: { code: 'owner_changed', error: 'Your authoring account changed. Reopen the class workspace.' } });
  });
  await page.goto(`${fixturePath}?edit=1`);
  await page.getByLabel('Quiz title', { exact: true }).fill('This draft belongs to the original author');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'Quiz draft error' })).toHaveText('Your authoring account changed. Reopen the class workspace.');
  await expect(page.getByLabel('Quiz title', { exact: true })).toHaveValue('This draft belongs to the original author');
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeDisabled();
  expect(authors).toEqual([authorId]);
});

test('a revision conflict keeps the teacher’s entries and opens the saved comparison in another tab', async ({ page, context }) => {
  const comparisonPath = `/teach/${classId}/assessments/${draftId}`;
  await context.route(`**${comparisonPath}`, route => route.fulfill({ contentType: 'text/html', body: '<main><h1>Latest saved quiz revision</h1><p>Server comparison copy</p></main>' }));
  await page.route('**/api/assessments/drafts**', route => route.fulfill({ status: 409, json: { error: 'This quiz changed on another device.' } }));
  await page.goto(`${fixturePath}?edit=1`);
  await page.getByLabel('Quiz title', { exact: true }).fill('Keep this local title after conflict');
  await page.getByLabel('Instructions', { exact: false }).fill('Preserve this entered instruction.');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'Quiz draft error' })).toHaveText('This quiz changed on another device.');
  await expect(page.getByLabel('Quiz title', { exact: true })).toHaveValue('Keep this local title after conflict');
  await expect(page.getByLabel('Instructions', { exact: false })).toHaveValue('Preserve this entered instruction.');
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeDisabled();
  const compare = page.getByRole('link', { name: 'Open latest saved draft in a new tab', exact: true });
  await expect(compare).toHaveAttribute('target', '_blank');
  await expect(compare).toHaveAttribute('rel', 'noopener noreferrer');
  const opened = context.waitForEvent('page');
  await compare.click();
  const comparison = await opened;
  await expect(comparison.getByRole('heading', { name: 'Latest saved quiz revision' })).toBeVisible();
  await expect(page.getByLabel('Quiz title', { exact: true })).toHaveValue('Keep this local title after conflict');
  await comparison.close();
});

test('an administrator saves through the same builder with explicit admin workspace scope', async ({ page }) => {
  const workspaces: (string | null)[] = [];
  await page.route('**/api/assessments/drafts**', async route => {
    workspaces.push(new URL(route.request().url()).searchParams.get('workspace'));
    await route.fulfill({ json: { draft: savedDraft(route.request().postDataJSON() as SaveRequest) } });
  });
  await page.goto(`${fixturePath}?workspace=admin&edit=1`);
  await page.getByLabel('Quiz title', { exact: true }).fill('Admin class quiz draft');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('Draft saved. Learners cannot see it.', { exact: true })).toBeVisible();
  expect(workspaces).toEqual(['admin']);
  await expect(page.getByText('Saving keeps a private draft. It does not assign work or release grades.', { exact: true })).toBeVisible();
});

test('quiz authoring remains labeled, keyboard-operable, and within a phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${fixturePath}?edit=1`);
  await page.getByLabel('Quiz title', { exact: true }).focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('Mobile reasoning quiz');
  await expect(page.getByLabel('Quiz title', { exact: true })).toHaveValue('Mobile reasoning quiz');
  await page.getByLabel('Search questions', { exact: true }).fill('amount 6');
  await page.getByRole('button', { name: 'Add Choose a minimum coin combination', exact: true }).click();
  await expect(selectedQuestions(page).getByRole('listitem')).toHaveCount(2);
  await page.getByLabel('Points for question 2', { exact: true }).fill('2.50');
  await page.getByText('Learner preview', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mobile reasoning quiz', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
