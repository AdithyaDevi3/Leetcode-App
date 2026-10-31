import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { AssessmentDraftInput, StoredAssessmentDraft } from '@leetcode-app/database';
const fixture = '/test-support/class-follow-up';
const actorId = '11111111-1111-4111-8111-111111111111';
const classId = '33333333-3333-4333-8333-333333333333';
const draftId = '77777777-7777-4777-8777-777777777777';
const genericKey = `method:assessment:${actorId}:${classId}:new`;
const focusedKey = `${genericKey}:focus:hash-maps`;
type Save = { draftId: string | null; expectedRevision: number | null; requestKey: string; draft: AssessmentDraftInput };
const selected = (page: Page) => page.getByRole('list', { name: 'Selected quiz questions' });
const snapshot = (request: Save): StoredAssessmentDraft => ({ ...request.draft, id: draftId, revision: 1, status: 'draft', maxUnits: request.draft.questions.reduce((sum, item) => sum + item.maxUnits, 0),
  createdBy: actorId, createdAt: '2026-10-30T12:00:00.000Z', updatedAt: '2026-10-30T12:00:00.000Z' });

test('suggested questions remain editable and create only an ordinary private draft after explicit save', async ({ page }) => {
  const saves: Save[] = []; let publications = 0;
  await page.route('**/api/assessments/drafts?workspace=teach', async route => {
    expect(route.request().headers()['x-assessment-author']).toBe(actorId);
    const input = route.request().postDataJSON() as Save; saves.push(input);
    await route.fulfill({ json: { draft: snapshot(input), currentRevision: 1 } });
  });
  await page.route('**/api/assessments/drafts/*/publications*', async route => { publications++; await route.abort(); });
  await page.goto(`${fixture}?focus=hash-maps`);
  await expect(page.getByLabel('Quiz title', { exact: true })).toHaveValue('Concept practice quiz');
  await expect(selected(page).getByRole('listitem')).toHaveCount(2); expect(saves).toHaveLength(0);
  await page.getByLabel('Quiz title', { exact: true }).fill('Edited class follow-up');
  await page.getByLabel('Points for question 1', { exact: true }).fill('0.25');
  await page.getByText('Learner preview', { exact: true }).click();
  await expect(page.locator('details').filter({ hasText: 'Learner preview' }).last()).toContainText('Edited class follow-up');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect.poll(() => saves.length).toBe(1);
  expect(saves[0]).toMatchObject({ draftId: null, expectedRevision: null, draft: { classId, title: 'Edited class follow-up', availableAt: null, dueAt: null, closesAt: null } });
  expect(saves[0].draft.questions.map(item => item.maxUnits)).toEqual([25, 500]);
  expect(saves[0].draft).not.toHaveProperty('audience'); expect(publications).toBe(0);
});

test('follow-up work never overwrites an unrelated unsaved new quiz', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept());
  await page.goto(fixture);
  await page.getByLabel('Quiz title', { exact: true }).fill('Unrelated browser quiz');
  await page.waitForFunction(key => sessionStorage.getItem(key)?.includes('Unrelated browser quiz'), genericKey);
  await page.goto(`${fixture}?focus=hash-maps`);
  await expect(page.getByLabel('Quiz title', { exact: true })).toHaveValue('Concept practice quiz');
  await page.getByLabel('Quiz title', { exact: true }).fill('My focused quiz');
  await page.waitForFunction(key => sessionStorage.getItem(key)?.includes('My focused quiz'), focusedKey);
  expect(await page.evaluate(key => sessionStorage.getItem(key), genericKey)).toContain('Unrelated browser quiz');
  await page.goto(fixture); await expect(page.getByLabel('Quiz title', { exact: true })).toHaveValue('Unrelated browser quiz');
  await page.goto(`${fixture}?focus=hash-maps`); await expect(page.getByLabel('Quiz title', { exact: true })).toHaveValue('My focused quiz');
});

test('source changes and repeated reloads preserve existing focus edits rather than replacing them with a fresh proposal', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept());
  await page.goto(`${fixture}?focus=hash-maps`);
  await page.getByLabel('Quiz title', { exact: true }).fill('Preserved focused edit');
  await page.getByRole('button', { name: 'Remove question 1', exact: true }).click();
  await page.waitForFunction(key => sessionStorage.getItem(key)?.includes('Preserved focused edit'), focusedKey);
  await page.goto(`${fixture}?focus=hash-maps&changed=1`); await page.reload();
  await expect(page.getByLabel('Quiz title', { exact: true })).toHaveValue('Preserved focused edit');
  await expect(selected(page).getByRole('listitem')).toHaveCount(1);
});

test('lost creation replies retry the exact command after fresh suggestions arrive', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept());
  const saves: Save[] = [];
  await page.route('**/api/assessments/drafts?workspace=teach', async route => {
    const input = route.request().postDataJSON() as Save; saves.push(input);
    if (saves.length === 1) { await route.abort('failed'); return; }
    await route.fulfill({ json: { draft: snapshot(saves[0]), currentRevision: 1 } });
  });
  await page.goto(`${fixture}?focus=hash-maps`); await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'Quiz draft error' })).toBeVisible();
  await page.goto(`${fixture}?focus=hash-maps&changed=1`);
  await expect(page.getByRole('status', { name: 'Quiz draft status' })).toContainText('earlier save needs confirmation');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect.poll(() => saves.length).toBe(2); expect(saves[1]).toEqual(saves[0]);
});

test('canonical focus order resumes the same quiz while different focuses keep separate edits', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept());
  await page.goto(`${fixture}?focus=hash-maps,complexity-analysis`);
  await page.getByLabel('Quiz title', { exact: true }).fill('Canonical focused work');
  await page.waitForFunction(key => sessionStorage.getItem(key)?.includes('Canonical focused work'), `${genericKey}:focus:complexity-analysis:hash-maps`);
  await page.goto(`${fixture}?focus=complexity-analysis,hash-maps`);
  await expect(page.getByLabel('Quiz title', { exact: true })).toHaveValue('Canonical focused work');
  await page.goto(`${fixture}?focus=sliding-window`);
  await expect(page.getByLabel('Quiz title', { exact: true })).toHaveValue('Concept practice quiz');
});

test('administrator suggestions use the same explicit, owner-guarded save contract', async ({ page }) => {
  const saves: Save[] = [];
  await page.route('**/api/assessments/drafts?workspace=admin', async route => {
    expect(route.request().headers()['x-assessment-author']).toBe(actorId);
    saves.push(route.request().postDataJSON() as Save);
    await route.fulfill({ status: 409, json: { code: 'owner_changed', error: 'Your account changed. Reopen the class workspace.' } });
  });
  await page.goto(`${fixture}?focus=hash-maps&workspace=admin`);
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'Quiz draft error' })).toContainText('account changed');
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeDisabled();
  expect(saves).toHaveLength(1);
  expect(await page.evaluate(key => sessionStorage.getItem(key), focusedKey)).toContain(saves[0].requestKey);
});

test('mobile follow-up authoring preserves keyboard controls and private answer projections', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`${fixture}?focus=hash-maps`);
  await page.getByLabel('Points for question 1', { exact: true }).focus(); await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type('2.25');
  await expect(page.getByLabel('Points for question 1', { exact: true })).toHaveValue('2.25');
  const html = await page.content(); for (const marker of ['correctOptionId', 'misconceptionTags', 'automated-curriculum-review-v2']) expect(html).not.toContain(marker);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: '../../.local-docs/evidence/class-follow-up-mobile.png', fullPage: true });
});
