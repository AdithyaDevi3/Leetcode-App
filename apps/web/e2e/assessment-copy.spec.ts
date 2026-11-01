import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { AssessmentCopyPreview } from '../src/lib/assessment-copy-api-types';

const fixture = '/test-support/assessment-copy';
const actorId = '11111111-1111-4111-8111-111111111111';
const otherActor = '22222222-2222-4222-8222-222222222222';
const classId = '33333333-3333-4333-8333-333333333333';
const destinationId = '44444444-4444-4444-8444-444444444444';
const draftId = '55555555-5555-4555-8555-555555555555';
const copyId = '77777777-7777-4777-8777-777777777777';
const anotherCopyId = '88888888-8888-4888-8888-888888888888';
const endpoint = `/api/assessments/drafts/${draftId}/copy`;
type Command = { sourceClassId: string; destinationClassId: string; expectedRevision: number; requestKey: string };
const source = (): AssessmentCopyPreview => ({ actorId, source: { id: draftId, classId, className: 'Synthetic Algorithms Studio', title: 'Saved algorithms quiz', instructions: 'Choose the strongest synthetic invariant.', revision: 2,
  questions: [1, 2].map((number, index) => ({ questionVersionId: `synthetic-copy-item-${number}@1`, maxUnits: index ? 375 : 125, question: { questionId: `synthetic-copy-item-${number}`, version: 1, versionId: `synthetic-copy-item-${number}@1`, kind: 'multiple_choice', title: `Synthetic saved question ${number}`, prompt: `Which statement preserves synthetic invariant ${number}?`, difficulty: 'foundation', activityIds: ['synthetic-practice'], conceptIds: ['hash-maps'], options: [{ id: 'a', text: 'First synthetic statement.' }, { id: 'b', text: 'Second synthetic statement.' }] } })) }, destinations: [{ id: classId, name: 'Synthetic Algorithms Studio' }, { id: destinationId, name: 'Synthetic Next Class' }] });
function model(workspace: 'teach' | 'admin' = 'teach') { return { workspace, preview: source(), commands: [] as Command[], receipts: new Map<string, string>(), reads: 0, readStatus: 200, readCode: 'copy_unavailable', writeStatus: 201, writeCode: 'copy_unavailable', abortFirst: false, wrongReceipt: false, foreignReceipt: false, privateMarker: false, hold: false, release: null as (() => void) | null }; }
type Model = ReturnType<typeof model>;
async function connect(page: Page, state: Model) {
  await page.route(`**${endpoint}?*`, async route => {
    const request = route.request(); const url = new URL(request.url());
    expect(url.searchParams.get('workspace')).toBe(state.workspace);
    expect(request.headers()['x-assessment-author']).toBe(actorId);
    if (request.method() === 'GET') {
      state.reads++; expect(url.searchParams.get('classId')).toBe(classId);
      if (state.readStatus !== 200) { await route.fulfill({ status: state.readStatus, json: { code: state.readCode, error: 'Synthetic quiz access changed. Recheck access.' } }); return; }
      const preview = structuredClone(state.preview);
      if (state.privateMarker) Object.assign(preview.source, { privateNote: 'FORGED_PRIVATE_COPY_DATA' });
      await route.fulfill({ json: preview }); return;
    }
    expect(request.method()).toBe('POST'); expect(url.searchParams.has('classId')).toBe(false);
    const command = request.postDataJSON() as Command; state.commands.push(command);
    if (state.hold) { state.hold = false; await new Promise<void>(resolve => { state.release = resolve; }); }
    if (state.abortFirst && state.commands.length === 1) { await route.abort('failed'); return; }
    if (state.writeStatus !== 201) { await route.fulfill({ status: state.writeStatus, json: { code: state.writeCode, error: 'Synthetic copy could not be confirmed. Review the saved source.' } }); return; }
    const acceptedId = state.receipts.get(command.requestKey) ?? (state.receipts.size ? anotherCopyId : copyId);
    state.receipts.set(command.requestKey, acceptedId);
    await route.fulfill({ status: 201, json: { actorId: state.foreignReceipt ? otherActor : actorId, draftId: acceptedId, classId: state.wrongReceipt ? classId : command.destinationClassId } });
  });
}
async function open(page: Page, state: Model) { await connect(page, state); await page.goto(`${fixture}${state.workspace === 'admin' ? '?workspace=admin' : ''}`); await expect(page.getByRole('region', { name: 'Saved quiz to copy' })).toBeVisible(); }

test('preview is ordered, explicit and creates one private copy in the selected class', async ({ page }) => {
  const state = model(); await open(page, state);
  const questions = page.getByRole('list', { name: 'Questions to copy' }).getByRole('listitem');
  await expect(questions).toHaveCount(2); await expect(questions.nth(0)).toContainText('1.25 points'); await expect(questions.nth(1)).toContainText('3.75 points');
  await page.getByText('Preview question 1', { exact: true }).click();
  await expect(questions.nth(0)).toContainText('Which statement preserves synthetic invariant 1?');
  await expect(page.getByRole('region', { name: 'Private quiz copy' })).toContainText('Dates are cleared');
  expect(state.commands).toHaveLength(0);
  await page.getByLabel('Destination class', { exact: true }).selectOption(destinationId);
  await page.getByRole('button', { name: 'Create private copy', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Open copied draft' })).toHaveAttribute('href', `/teach/${destinationId}/assessments/${copyId}`);
  expect(state.commands).toHaveLength(1); expect(state.commands[0]).toEqual({ sourceClassId: classId, destinationClassId: destinationId, expectedRevision: 2, requestKey: expect.any(String) });
  await page.reload(); await expect(page.getByRole('link', { name: 'Open copied draft' })).toBeVisible();
  expect(state.commands).toHaveLength(1); await expect(page.getByRole('button', { name: 'Create private copy', exact: true })).toHaveCount(0);
});

test('uncertain replies keep the exact destination, revision and key across reload and source retirement', async ({ page }) => {
  const state = model(); state.abortFirst = true; await open(page, state);
  await page.getByLabel('Destination class', { exact: true }).selectOption(destinationId);
  await page.getByRole('button', { name: 'Create private copy', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'Quiz copy error' })).toBeVisible();
  state.preview.source.revision = 3; state.preview.source.title = 'Newer saved algorithms quiz'; state.preview.source.questions[0].question = null;
  await page.reload();
  await expect(page.getByRole('status', { name: 'Quiz copy status' })).toContainText('earlier copy needs confirmation');
  await expect(page.getByLabel('Destination class', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Retry earlier copy', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Open copied draft' })).toBeVisible();
  expect(state.commands).toHaveLength(2); expect(state.commands[1]).toEqual(state.commands[0]);
});

test('stale source conflicts require a refreshed preview and a new explicit copy command', async ({ page }) => {
  const state = model(); state.writeStatus = 409; state.writeCode = 'source_conflict'; await open(page, state);
  await page.getByRole('button', { name: 'Create private copy', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Saved quiz to copy' })).toHaveCount(0);
  state.preview.source.revision = 3; state.writeStatus = 201;
  await page.getByRole('button', { name: 'Retry quiz preview', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Saved quiz to copy' })).toContainText('Saved revision 3');
  await page.getByRole('button', { name: 'Create private copy', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Open copied draft' })).toBeVisible();
  expect(state.commands[1].expectedRevision).toBe(3); expect(state.commands[1].requestKey).not.toBe(state.commands[0].requestKey);
});

test('unavailable question versions block new copies and offer a source repair link', async ({ page }) => {
  const state = model(); state.preview.source.questions[0].question = null; await open(page, state);
  await expect(page.getByRole('button', { name: 'Create private copy', exact: true })).toBeDisabled();
  await expect(page.getByRole('link', { name: 'Edit source to replace unavailable questions' })).toHaveAttribute('href', `/teach/${classId}/assessments/${draftId}`);
  expect(state.commands).toHaveLength(0);
});

test('administrator copies use the same explicit owner-guarded contract', async ({ page }) => {
  const state = model('admin'); await open(page, state);
  await page.getByLabel('Destination class', { exact: true }).selectOption(destinationId);
  await page.getByRole('button', { name: 'Create private copy', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Open copied draft' })).toHaveAttribute('href', `/admin/classes/${destinationId}/assessments/${copyId}`);
  expect(state.commands).toHaveLength(1);
});

test('another copy requires an explicit new review and receives a new request identity', async ({ page }) => {
  const state = model(); await open(page, state);
  await page.getByRole('button', { name: 'Create private copy', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Open copied draft' })).toBeVisible();
  state.preview.source.revision = 3;
  await page.getByRole('button', { name: 'Prepare another copy', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Saved quiz to copy' })).toContainText('Saved revision 3');
  await page.getByLabel('Destination class', { exact: true }).selectOption(destinationId);
  await page.getByRole('button', { name: 'Create private copy', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Open copied draft' })).toHaveAttribute('href', `/teach/${destinationId}/assessments/${anotherCopyId}`);
  expect(state.commands).toHaveLength(2); expect(state.commands[1].requestKey).not.toBe(state.commands[0].requestKey);
  expect(state.commands[1]).toMatchObject({ expectedRevision: 3, destinationClassId: destinationId });
});

test('permission loss hides the old preview and disables copy actions', async ({ page }) => {
  const state = model(); await open(page, state); state.readStatus = 404;
  await page.getByRole('button', { name: 'Refresh saved version', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'Quiz copy error' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Saved quiz to copy' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Create private copy', exact: true })).toHaveCount(0);
  expect(state.commands).toHaveLength(0);
});

test('an account switch stops further reads and hides previous source and copy navigation', async ({ page }) => {
  const state = model(); await open(page, state); state.readStatus = 409; state.readCode = 'owner_changed';
  await page.getByRole('button', { name: 'Refresh saved version', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Quiz copy account changed' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Saved quiz to copy' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Refresh saved version', exact: true })).toBeDisabled();
  const reads = state.reads; await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await page.waitForTimeout(100);
  expect(state.reads).toBe(reads); expect(state.commands).toHaveLength(0);
});

test('a mismatched destination receipt preserves the pending command instead of opening a different class', async ({ page }) => {
  const state = model(); state.wrongReceipt = true; await open(page, state);
  await page.getByLabel('Destination class', { exact: true }).selectOption(destinationId);
  await page.getByRole('button', { name: 'Create private copy', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'Quiz copy error' })).toContainText('verify the saved copy');
  await expect(page.getByRole('link', { name: 'Open copied draft' })).toHaveCount(0);
  state.wrongReceipt = false; await page.getByRole('button', { name: 'Retry earlier copy', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Open copied draft' })).toBeVisible(); expect(state.commands[1]).toEqual(state.commands[0]);
});

test('a copy reply after losing focus stays hidden until the exact command is recovered', async ({ page }) => {
  const state = model(); state.hold = true; await open(page, state);
  await page.getByRole('button', { name: 'Create private copy', exact: true }).click();
  await expect.poll(() => Boolean(state.release)).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  state.release!(); await expect(page.getByRole('button', { name: 'Retry quiz preview', exact: true })).toBeEnabled();
  await expect(page.getByRole('link', { name: 'Open copied draft' })).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.getByRole('button', { name: 'Retry earlier copy', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Open copied draft' })).toBeVisible(); expect(state.commands[1]).toEqual(state.commands[0]);
});

test('forged private fields are rejected before a preview or copy action appears', async ({ page }) => {
  const state = model(); state.privateMarker = true; await connect(page, state); await page.goto(fixture);
  await expect(page.getByRole('alert', { name: 'Quiz copy error' })).toContainText('could not be verified');
  await expect(page.getByRole('region', { name: 'Saved quiz to copy' })).toHaveCount(0);
  expect(await page.content()).not.toContain('FORGED_PRIVATE_COPY_DATA'); expect(state.commands).toHaveLength(0);
});

test('mobile authoring is keyboard accessible and preserves safe question projections', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); const state = model(); await open(page, state);
  await page.getByLabel('Destination class', { exact: true }).focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Create private copy', exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const marker of ['correctOptionId', 'misconceptionTags', 'privateNote', 'joinCode', 'learnerId']) expect(await page.content()).not.toContain(marker);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: '../../.local-docs/evidence/assessment-copy-mobile.png', fullPage: true });
});
