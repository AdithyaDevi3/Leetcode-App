import { expect, test, type Page } from '@playwright/test';
import { defaultPracticeItem, practiceItems } from '../src/lib/content';
import { evaluatePseudocode } from '../src/lib/evaluator';

const source = defaultPracticeItem.starterDraft;
const currentPath = `/practice?problem=${defaultPracticeItem.id}`;

async function openPractice(page: Page) {
  await page.route('**/api/practice/owner', route => route.fulfill({ json: { owner: { kind: 'guest', id: 'reasoning-learner' } } }));
  await page.route('**/api/viewer', route => route.fulfill({ json: { viewer: null } }));
  await page.route('**/api/practice/sessions**', route => route.fulfill({ status: route.request().method() === 'GET' ? 200 : 503, json: { session: null } }));
  await page.goto(currentPath);
  await expect(page.getByLabel('Pseudocode draft')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue anyway', exact: true })).toBeVisible();
}

test('optimal pseudocode can advance to another question while preserving the current work', async ({ page }) => {
  await openPractice(page);
  await page.getByLabel('Pseudocode draft').fill(source);
  await page.getByRole('button', { name: 'Evaluate reasoning', exact: true }).click();
  await expect(page.getByText('Implementation unlocked', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next practice question', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`problem=${practiceItems[1].id}`));
  await expect(page.getByLabel('Pseudocode draft')).toHaveValue('');
  await page.goto(currentPath);
  await expect(page.getByLabel('Pseudocode draft')).toHaveValue(source);
  await expect(page.locator('.grader-state')).toHaveText('Not run');
});

test('close pseudocode unlocks continuation without pretending every reasoning check passed', async ({ page }) => {
  await openPractice(page);
  await page.getByLabel('Pseudocode draft').fill(source.replace(/return/gi, 'report'));
  await page.getByRole('button', { name: 'Evaluate reasoning', exact: true }).click();
  await expect(page.getByText('Close enough to continue', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next practice question', exact: true })).toBeEnabled();
  await expect(page.getByLabel('Python implementation')).toBeEnabled();
  await expect(page.locator('.finding.revise')).not.toHaveCount(0);
  await expect(page.locator('.grader-state')).toHaveText('Not run');
});

test('manual continuation bypasses navigation checks without submitting or passing code', async ({ page }) => {
  const academicWrites: string[] = [];
  page.on('request', request => { if (request.method() === 'POST' && /\/(?:verify|complete|submissions)$/.test(new URL(request.url()).pathname)) academicWrites.push(request.url()); });
  await openPractice(page);
  await page.getByLabel('Pseudocode draft').fill(`${source}\nSort the list.`);
  await page.getByRole('button', { name: 'Evaluate reasoning', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Next practice question', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Continue anyway', exact: true }).click();
  await expect(page.getByText('Continued manually', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Python implementation')).toBeEnabled();
  await expect(page.locator('.grader-state')).toHaveText('Not run');
  await page.getByRole('button', { name: 'Next practice question', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`problem=${practiceItems[1].id}`));
  expect(academicWrites).toEqual([]);
});

test('manual continuation survives reload and resets after edits or an explicit reset', async ({ page }) => {
  await openPractice(page);
  await page.getByLabel('Pseudocode draft').fill('Start with a rough plan.');
  await page.getByRole('button', { name: 'Continue anyway', exact: true }).click();
  await page.reload();
  await expect(page.getByText('Continued manually', { exact: true })).toBeVisible();
  await page.getByLabel('Pseudocode draft').fill('A different unfinished plan.');
  await expect(page.getByRole('button', { name: 'Continue anyway', exact: true })).toBeVisible();
  await expect(page.getByLabel('Python implementation')).toBeDisabled();
  await page.getByRole('button', { name: 'Continue anyway', exact: true }).click();
  await page.getByRole('button', { name: 'Reset session', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continue anyway', exact: true })).toBeVisible();
  await expect(page.getByLabel('Python implementation')).toBeDisabled();
});

test('a stale approved cache cannot qualify a different current pseudocode draft', async ({ page }) => {
  await page.addInitScript(({ state, evaluation }) => localStorage.setItem('method:guest:reasoning-learner:pair-with-target-v1:workspace-v2', JSON.stringify({ version: 2, base: null,
    state: { draft: state, mode: 'text', language: 'python', code: 'def find_pair(values, target):\n    pass', codeChecked: false, completed: false, evaluation, codeGrade: null } })),
  { state: 'Return any number.', evaluation: evaluatePseudocode(source) });
  await openPractice(page);
  await expect(page.getByLabel('Pseudocode draft')).toHaveValue('Return any number.');
  await expect(page.getByLabel('Python implementation')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Next practice question', exact: true })).toHaveCount(0);
});
