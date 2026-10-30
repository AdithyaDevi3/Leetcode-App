import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { DiagnosticView, DiagnosticSaveReceipt, DiagnosticSubmissionReceipt } from '@leetcode-app/database';

const learnerId = '44444444-4444-4444-8444-444444444444';
const diagnosticId = '99999999-9999-4999-8999-999999999999';
const fixture = '/test-support/diagnostic';
const endpoint = `/api/learner/diagnostics/${diagnosticId}`;
const cacheKey = `method:diagnostic:${learnerId}:${diagnosticId}`;
type Save = { expectedRevision: number; answers: Record<string, string | null>; requestKey: string };
type Submit = { expectedRevision: number; requestKey: string };
function initial(): DiagnosticView {
  const questions = Array.from({ length: 10 }, (_, index) => ({
    questionId: `synthetic-diagnostic-${index + 1}`, version: 1, versionId: `synthetic-diagnostic-${index + 1}@1`, kind: 'multiple_choice' as const,
    title: `Synthetic concept ${index + 1}`, prompt: `Which statement supports concept ${index + 1}?`, difficulty: 'foundation' as const,
    activityIds: [`synthetic-activity-${index + 1}`], conceptIds: [`synthetic-concept-${index + 1}`],
    options: [{ id: 'a', text: 'First synthetic choice' }, { id: 'b', text: 'Second synthetic choice' }, { id: 'c', text: 'Third synthetic choice' }],
  }));
  return { id: diagnosticId, selectionVersion: 'balanced-ten-v1', createdAt: '2026-10-29T16:00:00.000Z', questions,
    answerDraft: { revision: 0, answers: Object.fromEntries(questions.map(question => [question.versionId, null])), updatedAt: '2026-10-29T16:00:00.000Z' }, submission: null, feedback: null };
}
function model() { return { view: initial(), started: true, starts: 0, saves: [] as Save[], submits: [] as Submit[], saveReceipts: new Map<string, DiagnosticSaveReceipt>(), submitReceipts: new Map<string, DiagnosticSubmissionReceipt>(),
  loseSave: false, loseSubmit: false, badSave: null as 'missing' | 'mismatch' | null, oldHead: null as number | null, ownerChanged: false }; }
type Model = ReturnType<typeof model>;
async function connect(page: Page, state: Model) {
  page.on('dialog', dialog => dialog.accept());
  await page.route('**/api/learner/diagnostics**', async route => {
    const request = route.request();
    expect(request.headers()['x-diagnostic-owner']).toBe(learnerId);
    if (state.ownerChanged) { await route.fulfill({ status: 409, json: { code: 'owner_changed', error: 'Account changed.' } }); return; }
    const path = new URL(request.url()).pathname;
    if (request.method() === 'GET') { await route.fulfill({ json: path === '/api/learner/diagnostics' ? { learnerId, current: state.started ? state.view : null, history: [] } : { learnerId, diagnostic: state.view } }); return; }
    if (path === '/api/learner/diagnostics') { state.starts++; state.started = true; expect(request.postDataJSON()).toEqual({}); await route.fulfill({ json: { learnerId, diagnostic: state.view } }); return; }
    if (path === `${endpoint}/answers`) {
      const input = request.postDataJSON() as Save; state.saves.push(input);
      let receipt = state.saveReceipts.get(input.requestKey);
      if (!receipt) {
        if (state.view.answerDraft.revision !== input.expectedRevision) { await route.fulfill({ status: 409, json: { code: 'revision_changed', error: 'Saved answers changed.' } }); return; }
        state.view.answerDraft = { revision: input.expectedRevision + 1, answers: { ...input.answers }, updatedAt: '2026-10-29T16:01:00.000Z' };
        receipt = { diagnosticId, requestKey: input.requestKey, answerDraft: structuredClone(state.view.answerDraft), currentRevision: state.view.answerDraft.revision };
        state.saveReceipts.set(input.requestKey, receipt);
      }
      if (state.loseSave) { state.loseSave = false; await route.abort('failed'); return; }
      if (state.badSave) { const bad = state.badSave; state.badSave = null; await route.fulfill({ json: bad === 'missing' ? { learnerId } : { learnerId, receipt: { ...receipt, requestKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } } }); return; }
      await route.fulfill({ json: { learnerId, receipt: { ...receipt, currentRevision: state.oldHead ?? state.view.answerDraft.revision } } }); return;
    }
    if (path === `${endpoint}/submissions`) {
      const input = request.postDataJSON() as Submit; state.submits.push(input);
      let receipt = state.submitReceipts.get(input.requestKey);
      if (!receipt) {
        receipt = { diagnosticId, requestKey: input.requestKey, answerRevision: input.expectedRevision, submittedAt: '2026-10-29T16:02:00.000Z' };
        state.view.submission = receipt;
        const items = state.view.questions.map(question => ({ questionVersionId: question.versionId, selectedOptionId: state.view.answerDraft.answers[question.versionId], correct: state.view.answerDraft.answers[question.versionId] === 'b', correctOptionId: 'b', explanation: 'Synthetic explanation after final submission.' }));
        state.view.feedback = { answeredCount: items.filter(item => item.selectedOptionId !== null).length, correctCount: items.filter(item => item.correct).length, totalQuestions: 10, items };
        state.submitReceipts.set(input.requestKey, receipt);
      }
      if (state.loseSubmit) { state.loseSubmit = false; await route.abort('failed'); return; }
      await route.fulfill({ json: { learnerId, receipt } }); return;
    }
    throw new Error(`Unexpected synthetic diagnostic route ${path}`);
  });
}
const choose = (page: Page, option = 'b') => page.locator(`input[name="diagnostic-synthetic-diagnostic-1@1"][value="${option}"]`).check();
async function save(page: Page) { await page.getByRole('button', { name: 'Save answers', exact: true }).click(); await expect(page.getByRole('status', { name: 'Answer save status' })).toContainText('Revision 1'); }

test('optional diagnostic starts explicitly, resumes across devices, and reveals feedback only after final submission', async ({ page, context }) => {
  const state = model(); state.started = false; await connect(page, state); await page.goto(fixture);
  await expect(page.getByRole('button', { name: 'Begin skills check' })).toBeVisible(); expect(state.starts).toBe(0);
  await page.getByRole('button', { name: 'Begin skills check' }).click(); expect(state.starts).toBe(1);
  await expect(page.getByRole('region', { name: 'Answer explanation' })).toHaveCount(0);
  await choose(page); await save(page);
  const resumed = await context.newPage(); await connect(resumed, state); await resumed.goto(fixture);
  await expect(resumed.locator('input[value="b"]')).toBeChecked();
  await resumed.getByRole('button', { name: 'Review and submit' }).click();
  await expect(resumed.getByRole('region', { name: 'Final submission review' })).toContainText('1 answered · 9 skipped');
  await resumed.getByRole('button', { name: 'Confirm final submission' }).click();
  await expect(resumed.getByRole('region', { name: 'Skills check results' })).toContainText('1 correct of 1 answered');
  await expect(resumed.getByRole('region', { name: 'Answer explanation' })).toContainText('Synthetic explanation after final submission.');
  expect((await new AxeBuilder({ page: resumed }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await resumed.screenshot({ path: '../../.local-docs/evidence/diagnostic-results-desktop.png', fullPage: true });
  await resumed.reload(); await expect(resumed.getByRole('region', { name: 'Skills check results' })).toContainText('9 skipped');
  await expect(resumed.getByRole('button', { name: 'Save answers', exact: true })).toHaveCount(0);
  await expect(resumed.getByRole('radio').first()).toBeDisabled(); expect(state.submits).toHaveLength(1); await resumed.close();
});

test('uncertain save survives reload and recovers its exact accepted receipt', async ({ page }) => {
  const state = model(); state.loseSave = true; await connect(page, state); await page.goto(fixture); await choose(page);
  await page.getByRole('button', { name: 'Save answers', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry save' })).toBeEnabled(); await page.reload();
  await page.getByRole('button', { name: 'Retry save' }).click();
  await expect(page.getByRole('status', { name: 'Answer save status' })).toContainText('Revision 1');
  expect(state.saves).toHaveLength(2); expect(state.saves[1]).toEqual(state.saves[0]);
});

for (const bad of ['missing', 'mismatch'] as const) test(`${bad} success receipt never claims saved and retains original retry identity`, async ({ page }) => {
  const state = model(); state.badSave = bad; await connect(page, state); await page.goto(fixture); await choose(page);
  await page.getByRole('button', { name: 'Save answers', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'Skills check request status' })).toContainText('not confirmed');
  await expect(page.getByRole('button', { name: 'Review and submit' })).toBeDisabled();
  await page.getByRole('button', { name: 'Retry save' }).click();
  await expect(page.getByRole('status', { name: 'Answer save status' })).toContainText('Revision 1'); expect(state.saves[1]).toEqual(state.saves[0]);
});

test('concurrent edits require comparison and preserve both answer sets', async ({ page }) => {
  const state = model(); await connect(page, state); await page.goto(fixture); await choose(page, 'a');
  state.view.answerDraft = { revision: 2, answers: { ...state.view.answerDraft.answers, 'synthetic-diagnostic-1@1': 'b' }, updatedAt: '2026-10-29T16:01:00.000Z' };
  await page.getByRole('button', { name: 'Save answers', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Answer conflict' })).toBeVisible();
  await page.getByRole('button', { name: 'Load latest saved answers' }).click();
  await expect(page.getByRole('region', { name: 'Answer conflict' })).toContainText('Server revision 2');
  await page.getByRole('button', { name: 'Keep my choices as the next edit' }).click();
  await page.getByRole('button', { name: 'Save answers', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Answer save status' })).toContainText('Revision 3'); expect(state.saves[1].expectedRevision).toBe(2);
  expect(state.saves[1].answers['synthetic-diagnostic-1@1']).toBe('a');
  await page.getByText('Recover different browser choices', { exact: true }).click();
  await expect(page.locator('details')).toContainText('Second synthetic choice');
});

test('older save receipt blocks final submission until newer answers are compared', async ({ page }) => {
  const state = model(); state.oldHead = 4; await connect(page, state); await page.goto(fixture); await choose(page);
  await page.getByRole('button', { name: 'Save answers', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Answer conflict' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review and submit' })).toBeDisabled();
  expect(state.submits).toHaveLength(0);
});

test('different unsaved browser choices survive repeated reloads over a newer server revision', async ({ page }) => {
  const state = model(); await connect(page, state); await page.goto(fixture); await choose(page, 'a');
  await page.waitForFunction(key => sessionStorage.getItem(key)?.includes('"a"'), cacheKey);
  state.view.answerDraft = { revision: 3, answers: { ...state.view.answerDraft.answers, 'synthetic-diagnostic-1@1': 'b' }, updatedAt: '2026-10-29T16:01:00.000Z' };
  await page.reload(); await expect(page.getByText('Recover different browser choices', { exact: true })).toBeVisible();
  await page.reload(); await page.getByText('Recover different browser choices', { exact: true }).click();
  await page.getByRole('button', { name: 'Restore browser choices' }).click();
  await expect(page.locator('input[value="a"]')).toBeChecked();
  await page.getByRole('button', { name: 'Save answers', exact: true }).click();
  expect(state.saves[0].expectedRevision).toBe(3);
});

test('uncertain final submission retries the same frozen revision and request key', async ({ page }) => {
  const state = model(); state.loseSubmit = true; await connect(page, state); await page.goto(fixture); await choose(page); await save(page);
  await page.getByRole('button', { name: 'Review and submit' }).click(); await page.getByRole('button', { name: 'Confirm final submission' }).click();
  await page.getByRole('button', { name: 'Retry submission' }).click();
  await expect(page.getByRole('region', { name: 'Skills check results' })).toContainText('1 correct of 1 answered');
  expect(state.submits).toHaveLength(2); expect(state.submits[1]).toEqual(state.submits[0]);
});

test('account changes on focus hide previous choices and prevent further writes', async ({ page }) => {
  const state = model(); await connect(page, state); await page.goto(fixture); await choose(page);
  state.ownerChanged = true; await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); });
  await expect(page.getByRole('alert').filter({ hasText: 'Saving and submission are paused' })).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(0); expect(state.saves).toHaveLength(0);
  expect(await page.evaluate(key => sessionStorage.getItem(key), cacheKey)).toContain('"b"');
});

test('a late earlier focus check cannot reveal answers after a later account switch', async ({ page }) => {
  const state = model(); await connect(page, state); await page.goto(fixture); await choose(page);
  let release: (() => void) | undefined;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  let reads = 0;
  await page.route(`**${endpoint}`, async route => {
    reads++;
    if (reads === 1) { const oldView = structuredClone(state.view); await waiting; await route.fulfill({ json: { learnerId, diagnostic: oldView } }); }
    else await route.fulfill({ status: 409, json: { code: 'owner_changed', error: 'Account changed.' } });
  });
  await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); });
  await expect.poll(() => reads).toBe(1);
  await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); });
  await expect(page.getByRole('alert').filter({ hasText: 'Saving and submission are paused' })).toBeVisible();
  release!(); await page.waitForTimeout(100);
  await expect(page.getByRole('radio')).toHaveCount(0); expect(reads).toBe(2); expect(state.saves).toHaveLength(0);
});

test('an equal-revision cache with different baseline answers cannot masquerade as saved work', async ({ page }) => {
  const state = model(); state.view.answerDraft = { ...state.view.answerDraft, revision: 1, answers: { ...state.view.answerDraft.answers, 'synthetic-diagnostic-1@1': 'b' } };
  const conflicting = { ...state.view.answerDraft, answers: { ...state.view.answerDraft.answers, 'synthetic-diagnostic-1@1': 'a' } };
  await page.addInitScript(({ key, baseline }) => sessionStorage.setItem(key, JSON.stringify({ answers: baseline.answers, baseline, recovery: null, pendingSave: null, pendingSubmit: null })), { key: cacheKey, baseline: conflicting });
  await connect(page, state); await page.goto(fixture);
  await expect(page.locator('input[value="b"]')).toBeChecked();
  await page.getByText('Recover different browser choices', { exact: true }).click();
  await expect(page.locator('details')).toContainText('First synthetic choice');
  await page.getByRole('button', { name: 'Restore browser choices' }).click();
  await expect(page.getByRole('status', { name: 'Answer save status' })).toContainText('Unsaved choices');
  await expect(page.getByRole('button', { name: 'Review and submit' })).toBeDisabled();
});

test('mobile questions use native radio keyboard controls, page navigation and clean bounds', async ({ page }) => {
  const state = model(); await connect(page, state); await page.setViewportSize({ width: 390, height: 844 }); await page.goto(fixture);
  await page.locator('input[value="a"]').focus(); await page.keyboard.press('ArrowDown'); await expect(page.locator('input[value="b"]')).toBeChecked();
  await page.getByRole('button', { name: 'Next question', exact: true }).click();
  await expect(page.getByRole('heading', { name: '2. Synthetic concept 2' })).toBeFocused();
  await page.getByRole('button', { name: 'Question 1, answered', exact: true }).click(); await expect(page.locator('input[value="b"]')).toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const marker of ['correctOptionId', 'misconceptionTags', 'Synthetic explanation after final submission.']) expect(await page.content()).not.toContain(marker);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: '../../.local-docs/evidence/diagnostic-mobile.png', fullPage: true });
});
