import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { ClassInsightsReport, LearnerQuestion } from '@leetcode-app/domain';
import type { ClassInsightsResponse } from '../src/lib/class-insights-api-types';

const fixture = '/test-support/class-insights';
const actorId = '11111111-1111-4111-8111-111111111111';
const otherActorId = '22222222-2222-4222-8222-222222222222';
const classId = '33333333-3333-4333-8333-333333333333';
const concepts = ['hash-maps', 'sliding-window', 'stack-state', 'tree-recursion'];
const endpoint = `/api/classes/${classId}/insights`;
type Workspace = 'teach' | 'admin';
function ownerReport(): ClassInsightsReport {
  return { algorithmVersion: 'class-insights-v1', classroom: { id: classId, name: 'Synthetic Algorithms Studio' }, generatedAt: '2026-10-30T12:00:00.000Z', view: 'owner', adminMinimumLearners: 5, rosterCount: 10,
    concepts: concepts.map((conceptId, index) => index === 0 ? { conceptId, coverageStatus: 'covered', answeredItems: 20, correctItems: 8, coveredLearners: 10, distinctQuestions: 4, observedCorrectPercent: 40, coveragePercent: 100 }
      : index === 1 ? { conceptId, coverageStatus: 'limited', answeredItems: 2, correctItems: 1, coveredLearners: 2, distinctQuestions: 1, observedCorrectPercent: 50, coveragePercent: 20 }
        : { conceptId, coverageStatus: 'unknown', answeredItems: 0, correctItems: 0, coveredLearners: 0, distinctQuestions: 0, observedCorrectPercent: null, coveragePercent: 0 }),
  };
}
function question(conceptId: string, index: number): LearnerQuestion {
  return { questionId: `synthetic-follow-up-${index}`, version: 1, versionId: `synthetic-follow-up-${index}@1`, kind: 'multiple_choice', title: `Fresh synthetic ${conceptId} question`, prompt: 'Which option preserves the synthetic invariant?', difficulty: 'foundation', conceptIds: [conceptId], activityIds: ['synthetic-practice'], options: [{ id: 'a', text: 'First synthetic statement.' }, { id: 'b', text: 'Second synthetic statement.' }] };
}
function model(workspace: Workspace = 'teach') {
  const report = ownerReport();
  if (workspace === 'admin') {
    report.view = 'administrator';
    report.concepts = report.concepts.map(concept => concept.coveredLearners! < 5 ? { ...concept,
      coverageStatus: concept.coverageStatus === 'unknown' ? 'unknown' : 'suppressed', answeredItems: null, correctItems: null, coveredLearners: null, distinctQuestions: null, observedCorrectPercent: null, coveragePercent: null } : concept);
  }
  return { workspace, report, reads: [] as (string | null)[], writes: [] as string[], errorStatus: null as number | null,
    errorCode: 'insights_unavailable', ownerChanged: false, foreignActor: false, exhausted: false, malformed: false, leakedAdminCount: false };
}
type Model = ReturnType<typeof model>;
function response(state: Model, focus: string[] = ['hash-maps']): ClassInsightsResponse {
  return { actorId: state.foreignActor ? otherActorId : actorId, report: structuredClone(state.report), suggestion: { focusConceptIds: [...focus], questions: state.exhausted ? [] : focus.map(question), unavailableConceptIds: state.exhausted ? [...focus] : [], reason: 'Synthetic proposal from released class quiz evidence. Review the exact questions before assigning.', emptyReason: state.exhausted ? 'No unused reviewed questions match this focus. Choose other concepts or create a quiz from the full question bank.' : null } };
}
async function connect(page: Page, state: Model) {
  await page.route(`**${endpoint}?*`, async route => {
    const request = route.request();
    expect(request.headers()['x-class-insights-owner']).toBe(actorId);
    if (request.method() !== 'GET') { state.writes.push(request.method()); throw new Error('Insight viewing must not mutate a class.'); }
    const url = new URL(request.url()); expect(url.searchParams.get('workspace')).toBe(state.workspace);
    const selected = url.searchParams.get('focus'); state.reads.push(selected);
    if (state.ownerChanged) { await route.fulfill({ status: 409, json: { code: 'owner_changed', error: 'The account changed.' } }); return; }
    if (state.errorStatus) { await route.fulfill({ status: state.errorStatus, json: { code: state.errorCode, error: 'Synthetic class insight outage.' } }); return; }
    const body = response(state, selected?.split(',') ?? undefined);
    if (state.malformed) Object.assign(body.report, { learners: [{ privateNote: 'FORGED_PRIVATE_GRADE' }] });
    if (state.leakedAdminCount) body.report.concepts[1].correctItems = 1;
    await route.fulfill({ json: body });
  });
}
async function open(page: Page, state: Model) { await connect(page, state); await page.goto(state.workspace === 'admin' ? `${fixture}?workspace=admin` : fixture); await expect(page.getByRole('heading', { name: 'Concept coverage', exact: true })).toBeVisible(); }
const proposal = (page: Page) => page.getByRole('region', { name: 'Follow-up quiz proposal' });
const conceptCard = (page: Page, name: string) => page.getByRole('list', { name: 'Class concept coverage' }).getByRole('listitem').filter({ has: page.getByRole('heading', { name, exact: true }) });

test('class owners inspect released-only aggregates and preview an editable follow-up without creating an assignment', async ({ page }) => {
  const state = model(); await open(page, state);
  await expect(conceptCard(page, 'Hash Maps')).toContainText('40% observed correct');
  await expect(conceptCard(page, 'Hash Maps')).toContainText('8 correct / 20');
  await expect(conceptCard(page, 'Sliding Window')).toContainText('Limited coverage');
  await expect(conceptCard(page, 'Tree Recursion')).toContainText('This does not indicate a weakness.');
  await expect(page.getByRole('region', { name: 'Class evidence scope' })).toContainText('Personal practice and skills checks are excluded.');
  const link = page.getByRole('link', { name: 'Open editable quiz draft' });
  await expect(link).toHaveAttribute('href', `/teach/${classId}/assessments/new?focus=hash-maps`);
  await proposal(page).getByText('Preview Fresh synthetic hash-maps question', { exact: true }).click();
  await expect(proposal(page)).toContainText('Which option preserves the synthetic invariant?');
  for (const marker of ['correctOptionId', 'misconceptionTags', 'privateNote', 'learnerId', 'FORGED_PRIVATE_GRADE']) expect(await page.content()).not.toContain(marker);
  expect(state.writes).toEqual([]);
});

test('focus is bounded to three concepts and confirmed against the preview before navigation', async ({ page }) => {
  const state = model(); await open(page, state);
  await page.getByRole('checkbox', { name: 'Focus on Sliding Window' }).check();
  await page.getByRole('checkbox', { name: 'Focus on Tree Recursion' }).check();
  await expect(page.getByRole('checkbox', { name: 'Focus on Stack State' })).toBeDisabled();
  await expect(page.getByRole('link', { name: 'Open editable quiz draft' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Preview selected concepts' }).click();
  await expect(page.getByRole('link', { name: 'Open editable quiz draft' })).toHaveAttribute('href', `/teach/${classId}/assessments/new?focus=hash-maps%2Csliding-window%2Ctree-recursion`);
  expect(state.reads.at(-1)).toBe('hash-maps,sliding-window,tree-recursion');
  await page.getByLabel('Find a concept', { exact: true }).fill('Tree');
  await expect(page.getByRole('list', { name: 'Class concept coverage' }).getByRole('listitem')).toHaveCount(1);
  await expect(page.getByRole('checkbox', { name: 'Focus on Tree Recursion' })).toBeChecked();
  await expect(page.getByRole('status', { name: 'Focus selection' })).toContainText('3 of 3');
  await page.getByLabel('Find a concept', { exact: true }).fill('');
  await page.getByRole('checkbox', { name: 'Focus on Hash Maps' }).uncheck();
  await expect(page.getByRole('checkbox', { name: 'Focus on Stack State' })).toBeEnabled();
  expect(state.writes).toEqual([]);
});

test('a refresh adopts current release and enrollment facts while preserving the selected focus', async ({ page }) => {
  const state = model(); await open(page, state);
  state.report.rosterCount = 9;
  state.report.concepts[0] = { ...state.report.concepts[0], coveredLearners: 9, correctItems: 12, observedCorrectPercent: 60, coveragePercent: 100 };
  state.report.concepts = state.report.concepts.map(concept => ({ ...concept, coveragePercent: Math.round(concept.coveredLearners! / state.report.rosterCount * 100) }));
  await page.getByRole('button', { name: 'Refresh insights', exact: true }).click();
  await expect(conceptCard(page, 'Hash Maps')).toContainText('60% observed correct');
  await expect(conceptCard(page, 'Hash Maps')).toContainText('9 of 9');
  await expect(page.getByRole('checkbox', { name: 'Focus on Hash Maps' })).toBeChecked();
  expect(state.reads.at(-1)).toBe('hash-maps'); expect(state.writes).toEqual([]);
});

test('explicitly clearing the focus survives verification and resets only on a suggested-focus action', async ({ page }) => {
  const state = model(); await open(page, state);
  await page.getByRole('checkbox', { name: 'Focus on Hash Maps' }).uncheck();
  await page.getByRole('button', { name: 'Refresh insights', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Focus selection' })).toContainText('0 of 3');
  await expect(page.getByRole('checkbox', { name: 'Focus on Hash Maps' })).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Preview selected concepts' })).toBeDisabled();
  await page.getByRole('button', { name: 'Use suggested focus' }).click();
  await expect(page.getByRole('checkbox', { name: 'Focus on Hash Maps' })).toBeChecked();
  await expect(page.getByRole('link', { name: 'Open editable quiz draft' })).toBeVisible();
});

test('no answered class evidence stays unknown and permits a coverage-building proposal', async ({ page }) => {
  const state = model(); state.report.rosterCount = 0;
  state.report.concepts = state.report.concepts.map(concept => ({ ...concept, coverageStatus: 'unknown', answeredItems: 0, correctItems: 0, coveredLearners: 0, distinctQuestions: 0, observedCorrectPercent: null, coveragePercent: 0 }));
  await open(page, state);
  await expect(page.getByText('observed correct', { exact: true })).toHaveCount(0);
  await expect(conceptCard(page, 'Hash Maps')).toContainText('No eligible answered evidence yet.');
  await expect(page.getByRole('link', { name: 'Open editable quiz draft' })).toBeVisible();
});

test('an exhausted question pool gives an explicit manual-bank path instead of silently repeating items', async ({ page }) => {
  const state = model(); state.exhausted = true; await open(page, state);
  await expect(proposal(page)).toContainText('No unused reviewed questions match this focus.');
  await expect(page.getByRole('link', { name: 'Open editable quiz draft' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Create a quiz from the full bank' })).toHaveAttribute('href', `/teach/${classId}/assessments/new`);
  expect(state.writes).toEqual([]);
});

test('administrators see suppressed small-cohort concepts and their own class-authoring route', async ({ page }) => {
  const state = model('admin'); await open(page, state);
  await expect(page.getByRole('region', { name: 'Class evidence scope' })).toContainText('Administrator aggregate view');
  await expect(conceptCard(page, 'Sliding Window')).toContainText('Numbers hidden');
  await expect(conceptCard(page, 'Sliding Window')).not.toContainText('50%');
  await expect(conceptCard(page, 'Tree Recursion')).not.toContainText('0%');
  await expect(page.getByRole('link', { name: 'Open editable quiz draft' })).toHaveAttribute('href', `/admin/classes/${classId}/assessments/new?focus=hash-maps`);
  await page.getByLabel('Coverage filter', { exact: true }).selectOption('suppressed');
  await expect(page.getByRole('list', { name: 'Class concept coverage' }).getByRole('listitem')).toHaveCount(1);
  await expect(conceptCard(page, 'Sliding Window')).toBeVisible();
});

test('an unsuppressed upstream admin field cannot become a verified class view', async ({ page }) => {
  const state = model('admin'); state.leakedAdminCount = true; await connect(page, state); await page.goto(`${fixture}?workspace=admin`);
  await expect(page.getByRole('alert', { name: 'Class insights error' })).toContainText('could not be verified');
  await expect(page.getByRole('list', { name: 'Class concept coverage' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Open editable quiz draft' })).toHaveCount(0);
  state.leakedAdminCount = false; await page.getByRole('button', { name: 'Retry class insights' }).click();
  await expect(conceptCard(page, 'Sliding Window')).toContainText('Numbers hidden');
});

test('outages and malformed responses hide old insights without substituting device grades', async ({ page }) => {
  const state = model(); await page.addInitScript(() => localStorage.setItem('forged-class-insights', JSON.stringify({ observedCorrectPercent: 100, privateNote: 'FORGED_PRIVATE_GRADE' })));
  await open(page, state); state.errorStatus = 503;
  await page.getByRole('button', { name: 'Refresh insights', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'Class insights error' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Class concept coverage' })).toHaveCount(0);
  expect(await page.content()).not.toContain('FORGED_PRIVATE_GRADE');
  state.errorStatus = null; state.malformed = true; await page.getByRole('button', { name: 'Retry class insights' }).click();
  await expect(page.getByRole('alert', { name: 'Class insights error' })).toContainText('could not be verified');
  state.malformed = false; await page.getByRole('button', { name: 'Retry class insights' }).click();
  await expect(conceptCard(page, 'Hash Maps')).toContainText('40%');
});

test('revoked class access clears the report and follow-up navigation until access is restored', async ({ page }) => {
  const state = model(); await open(page, state); state.errorStatus = 403; state.errorCode = 'forbidden';
  await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); });
  await expect(page.getByRole('alert', { name: 'Class insights error' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Class concept coverage' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Open editable quiz draft' })).toHaveCount(0);
  state.errorStatus = null; await page.getByRole('button', { name: 'Retry class insights' }).click();
  await expect(conceptCard(page, 'Hash Maps')).toContainText('40%');
});

test('a later account switch wins over an earlier delayed focus verification', async ({ page }) => {
  const state = model(); await open(page, state);
  let release!: () => void; const waiting = new Promise<void>(resolve => { release = resolve; }); let reads = 0;
  await page.route(`**${endpoint}?*`, async route => {
    reads++;
    if (reads === 1) { const old = response(state); await waiting; await route.fulfill({ json: old }); }
    else await route.fulfill({ status: 409, json: { code: 'owner_changed', error: 'The account changed.' } });
  });
  await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); }); await expect.poll(() => reads).toBe(1);
  await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); });
  await expect(page.getByRole('region', { name: 'Class account changed' })).toBeVisible();
  release(); await page.waitForTimeout(100);
  await expect(page.getByRole('list', { name: 'Class concept coverage' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Open editable quiz draft' })).toHaveCount(0);
  expect(await page.content()).not.toContain('Synthetic Algorithms Studio'); expect(state.writes).toEqual([]);
});

test('a successful response naming another account hides the old report and pauses navigation', async ({ page }) => {
  const state = model(); await open(page, state); state.foreignActor = true;
  await page.getByRole('button', { name: 'Refresh insights', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Class account changed' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open editable quiz draft' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Refresh insights', exact: true })).toBeDisabled();
});

test('phone keyboard users can select, filter and preview without clipping or accessibility violations', async ({ page }) => {
  const state = model(); await page.setViewportSize({ width: 390, height: 844 }); await open(page, state);
  const choice = page.getByRole('checkbox', { name: 'Focus on Sliding Window' }); await choice.focus(); await page.keyboard.press('Space'); await expect(choice).toBeChecked();
  await page.getByRole('button', { name: 'Preview selected concepts' }).click();
  await expect(page.getByRole('link', { name: 'Open editable quiz draft' })).toHaveAttribute('href', `/teach/${classId}/assessments/new?focus=hash-maps%2Csliding-window`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: '../../.local-docs/evidence/class-insights-phone.png', fullPage: true });
});

test('administrator aggregate view has a complete accessible desktop layout', async ({ page }) => {
  const state = model('admin'); await open(page, state);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: '../../.local-docs/evidence/class-insights-admin-desktop.png', fullPage: true });
});
