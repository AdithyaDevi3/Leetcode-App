import { expect, test, type Page } from '@playwright/test';
import { codeCheckLabels } from '../src/lib/code-grading';

const source = 'def find_pair(values, target):\n    return [1, 2]';
const path = '/practice?assignment=11111111-1111-4111-8111-111111111111';
const input = (page: Page, name = 'Python implementation') => page.locator('[data-editor-ready="true"]').getByRole('textbox', { name, exact: true });
const grade = { problemId: 'pair-with-target-v1', version: 'code-tests-v3', passed: true,
  passedCount: 4, totalCount: 4, tests: codeCheckLabels('pair-with-target-v1').map(name => ({ name, passed: true })) };

async function workspace(page: Page) {
  let revision = 1;
  const requests = { run: [] as Record<string, unknown>[], submit: [] as Record<string, unknown>[], handIn: 0 };
  const metadata: Record<string, unknown> = { workspaceState: {
    draft: '', mode: 'text', language: 'python', code: source, codeChecked: false, completed: false, evaluation: null, codeGrade: null,
  } };
  await page.route('**/api/practice/owner', route => route.fulfill({ json: { owner: { kind: 'guest', id: 'run-submit-guest' } } }));
  await page.route('**/api/viewer', route => route.fulfill({ json: { viewer: null } }));
  await page.route('**/api/learner/assignments/*/submissions', route => { requests.handIn += 1; return route.fulfill({ json: { attempt: { status: 'submitted' } } }); });
  await page.route('**/api/practice/sessions**', async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith('/run')) {
      const body = request.postDataJSON(); requests.run.push(body);
      return route.fulfill({ json: { run: { problemId: 'pair-with-target-v1', language: body.language,
        cases: body.cases.map((item: { id: string; input: string; expected: string }, index: number) => ({
          id: item.id, name: `Case ${index + 1}`, input: JSON.parse(item.input), actual: [1, 2],
          ...(item.expected.trim() ? { expected: JSON.parse(item.expected), passed: true } : { passed: null }),
        })), stdout: 'Synthetic debug output', stderr: '', durationMs: 12 } } });
    }
    if (pathname.endsWith('/verify')) {
      const body = request.postDataJSON(); requests.submit.push(body);
      metadata.verification = { requestId: 'submission-1', language: body.language, source: body.source, grade, verifiedAt: '2026-11-08T00:00:00.000Z' };
      return route.fulfill({ json: { status: 'completed', grade, durationMs: 15 } });
    }
    if (request.method() === 'GET') return route.fulfill({ json: { session: { id: 'session-run-submit', revision, latestRevisionNumber: revision, sessionMetadata: metadata } } });
    if (pathname.endsWith('/sessions')) return route.fulfill({ json: { session: { id: 'session-run-submit', revision } } });
    const body = request.postDataJSON(); metadata.workspaceState = body.state; revision += 1;
    return route.fulfill({ json: { revision: { revisionNumber: revision } } });
  });
  await page.goto(path);
  await expect(input(page)).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('method:guest:run-submit-guest:pair-with-target-v1:remote-session'))).toBe('session-run-submit');
  await page.getByRole('button', { name: 'Show results', exact: true }).click();
  return { requests, metadata };
}

test('Run shows editable case outputs and Submit alone saves a full-suite result', async ({ page }) => {
  const { requests, metadata } = await workspace(page);
  await page.getByRole('tab', { name: 'Test cases', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Test case 1 input', exact: true })).toHaveValue('[[4,7,1,9],8]');
  await page.getByRole('button', { name: '+ Add case', exact: true }).click();
  await page.getByRole('textbox', { name: 'Test case 2 input', exact: true }).fill('[[2, 7, 3], 10]');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Run result', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Run complete. Submit to check the full suite and save a verified result.', { exact: true })).toBeVisible();
  await expect(page.getByText('Case 2 · Output ready', { exact: true })).toBeVisible();
  expect(requests.run).toHaveLength(1); expect(requests.submit).toHaveLength(0); expect(requests.handIn).toBe(0);
  expect(metadata).not.toHaveProperty('verification');
  await expect.poll(() => (metadata.workspaceState as { codeChecked: boolean }).codeChecked).toBe(false);
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(page.locator('.grader-state')).toHaveText('Passed');
  expect(requests.submit).toHaveLength(1); expect(requests.handIn).toBe(0);
  await page.reload();
  await expect(page.locator('.grader-state')).toHaveText('Passed');
  await page.getByRole('tab', { name: 'Test cases', exact: true }).click();
  await page.getByRole('button', { name: 'Case 2', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Test case 2 input', exact: true })).toHaveValue('[[2, 7, 3], 10]');
});

test('unfinished custom JSON survives reload and prevents an invalid execution', async ({ page }) => {
  const { requests, metadata } = await workspace(page);
  await page.getByRole('tab', { name: 'Test cases', exact: true }).click();
  await page.getByRole('textbox', { name: 'Test case 1 input', exact: true }).fill('[[1,');
  await expect.poll(() => (metadata.workspaceState as { runCaseDrafts?: { input: string }[] }).runCaseDrafts?.[0].input).toBe('[[1,');
  await page.reload();
  await expect(input(page)).toBeVisible();
  await page.getByRole('tab', { name: 'Test cases', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Test case 1 input', exact: true })).toHaveValue('[[1,');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByText(/Case 1: use a valid JSON array/)).toBeVisible();
  expect(requests.run).toHaveLength(0); expect(requests.submit).toHaveLength(0);
});

test('an old Run response cannot replace a result after code changes and changes back', async ({ page }) => {
  await workspace(page);
  let requested = false;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/practice/sessions/*/run', async route => {
    requested = true; await held;
    await route.fulfill({ json: { run: { problemId: 'pair-with-target-v1', language: 'python', cases: [], stdout: 'STALE_RUN_SENTINEL', stderr: '', durationMs: 5 } } });
  });
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect.poll(() => requested).toBe(true);
  await input(page).fill('def find_pair(values, target):\n    return []');
  await input(page).fill(source);
  const finished = page.waitForResponse('**/api/practice/sessions/*/run');
  release();
  await finished;
  await expect(page.getByText('STALE_RUN_SENTINEL', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeEnabled();
  await page.getByRole('tab', { name: 'Submission', exact: true }).click();
  await expect(page.locator('.grader-state')).toHaveText('Not submitted');
});

test('Java has its own saved draft and working four-space Tab and undo', async ({ page }) => {
  await workspace(page);
  await page.getByRole('button', { name: 'Java JVM', exact: true }).click();
  const java = input(page, 'Java implementation');
  await expect(java).toContainText('class Solution');
  await java.fill('class Solution {');
  await java.press('End'); await java.press('Enter');
  await expect.poll(() => java.locator('.cm-line').evaluateAll(lines => lines.map(line => line.textContent ?? '').join('\n'))).toBe('class Solution {\n    ');
  await java.press('Tab');
  await expect.poll(() => java.locator('.cm-line').evaluateAll(lines => lines.map(line => line.textContent ?? '').join('\n'))).toBe('class Solution {\n        ');
  await java.press('ControlOrMeta+z');
  await expect.poll(() => java.locator('.cm-line').evaluateAll(lines => lines.map(line => line.textContent ?? '').join('\n'))).toBe('class Solution {\n    ');
  await page.getByRole('button', { name: 'Python 3 python3', exact: true }).click();
  await expect(input(page)).toContainText('return [1, 2]');
  await page.getByRole('button', { name: 'Java JVM', exact: true }).click();
  await expect(java).toContainText('class Solution {');
  await page.reload();
  await expect(input(page, 'Java implementation')).toContainText('class Solution {');
});
