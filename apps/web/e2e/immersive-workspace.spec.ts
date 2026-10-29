import { expect, test, type Page } from '@playwright/test';
import { defaultPracticeItem, practiceItems } from '../src/lib/content';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const editor = (page: Page, label: string) => page.locator('[data-editor-ready="true"]').getByRole('textbox', { name: label, exact: true });
const text = (page: Page, label: string) => editor(page, label).locator('.cm-line').evaluateAll(lines => lines.map(line => line.textContent ?? '').join('\n'));

async function open(page: Page, query = '') {
  await page.route('**/api/viewer', route => route.fulfill({ json: { viewer: null } }));
  await page.route('**/api/practice/owner', route => route.fulfill({ json: { owner: { kind: 'guest', id: 'workspace-test' } } }));
  await page.route('**/api/practice/sessions**', route => route.fulfill({ status: route.request().method() === 'GET' ? 200 : 503, json: { session: null } }));
  await page.goto(`/practice?problem=${defaultPracticeItem.id}${query}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(defaultPracticeItem.problem.title);
}

async function code(page: Page) {
  await page.getByRole('button', { name: '03 Code & test', exact: true }).click();
  await page.getByRole('button', { name: 'Continue anyway', exact: true }).click();
  await expect(editor(page, 'Python implementation')).toBeEditable();
}

test('stages replace continuous scrolling and preserve edits through browser history', async ({ page }) => {
  await open(page);
  await editor(page, 'Pseudocode draft').fill('Keep this approach while changing pages.');
  await page.getByRole('button', { name: '02 Feedback', exact: true }).click();
  await expect(editor(page, 'Pseudocode draft')).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Reasoning checks' })).toBeVisible();
  await expect(page).toHaveURL(/stage=feedback/);
  await page.goBack();
  await expect(editor(page, 'Pseudocode draft')).toBeVisible();
  await expect.poll(() => text(page, 'Pseudocode draft')).toBe('Keep this approach while changing pages.');
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Reasoning checks' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
});

test('code language changes and reload preserve independent drafts without academic writes', async ({ page }) => {
  const academic: string[] = [];
  page.on('request', request => { if (request.method() === 'POST' && /\/(verify|complete|submissions)$/.test(new URL(request.url()).pathname)) academic.push(request.url()); });
  await open(page);
  await code(page);
  const python = 'def find_pair(values, target):\n    return [1, 2]';
  const cpp = 'vector<int> findPair(vector<int> values, int target) {\n  return {0, 1};\n}';
  await editor(page, 'Python implementation').fill(python);
  await page.getByRole('button', { name: /C\+\+ C\+\+20/ }).click();
  await editor(page, 'C++ implementation').fill(cpp);
  await page.getByRole('button', { name: /Python 3 python3/ }).click();
  await expect.poll(() => text(page, 'Python implementation')).toBe(python);
  await expect(page.getByText('Offline draft', { exact: true })).toBeVisible();
  await page.reload();
  await expect.poll(() => text(page, 'Python implementation')).toBe(python);
  await page.getByRole('button', { name: /C\+\+ C\+\+20/ }).click();
  await expect.poll(() => text(page, 'C++ implementation')).toBe(cpp);
  await expect(page.locator('.grader-state')).toHaveText('Not run');
  const editorBounds = await page.locator('.practice-code-stage .code-editor-host').boundingBox();
  expect(editorBounds?.height).toBeGreaterThanOrEqual(120);
  await page.screenshot({ path: '../../.local-docs/screens/workspace-desktop.png', fullPage: true });
  expect(academic).toEqual([]);
});

test('Tab, Shift+Tab, language-aware Enter and undo operate on actual editor source', async ({ page }) => {
  await open(page);
  await code(page);
  const input = editor(page, 'Python implementation');
  await input.fill('def sample():');
  await input.press('End');
  await input.press('Enter');
  await expect.poll(() => text(page, 'Python implementation')).toBe('def sample():\n    ');
  await input.press('Tab');
  await expect.poll(() => text(page, 'Python implementation')).toBe('def sample():\n        ');
  await input.press('Shift+Tab');
  await expect.poll(() => text(page, 'Python implementation')).toBe('def sample():\n    ');
  await input.fill('first\nsecond');
  await input.press('ControlOrMeta+a');
  await input.press('Tab');
  await expect.poll(() => text(page, 'Python implementation')).toBe('    first\n    second');
  await input.press('Shift+Tab');
  await expect.poll(() => text(page, 'Python implementation')).toBe('first\nsecond');
  await page.getByRole('button', { name: 'Undo in Python implementation', exact: true }).click();
  await expect.poll(() => text(page, 'Python implementation')).toBe('    first\n    second');
  await input.focus();
  await input.press('Escape');
  await input.press('Tab');
  await expect(input).not.toBeFocused();
});

test('panel resizing, collapse, run recovery and reset remain usable', async ({ page }) => {
  await open(page);
  await code(page);
  const separator = page.getByRole('separator', { name: 'Resize problem and workspace panels' });
  const before = Number(await separator.getAttribute('aria-valuenow'));
  await separator.focus();
  await separator.press('ArrowRight');
  await expect(separator).toHaveAttribute('aria-valuenow', String(before + 2));
  const dividerBounds = await separator.boundingBox();
  if (!dividerBounds) throw new Error('Resize divider is not visible');
  await page.mouse.move(dividerBounds.x + dividerBounds.width / 2, dividerBounds.y + 20);
  await page.mouse.down();
  await page.mouse.move(dividerBounds.x + 70, dividerBounds.y + 20);
  await page.mouse.up();
  expect(Number(await separator.getAttribute('aria-valuenow'))).toBeGreaterThan(before + 2);
  const resultsDivider = page.getByRole('separator', { name: 'Resize editor and results panels' });
  const editorHeight = Number(await resultsDivider.getAttribute('aria-valuenow'));
  await resultsDivider.focus();
  await resultsDivider.press('ArrowUp');
  expect(Number(await resultsDivider.getAttribute('aria-valuenow'))).toBeLessThan(editorHeight);
  await page.getByRole('button', { name: 'Hide results', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Test results', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Run verified tests', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Test results', exact: true })).toBeVisible();
  await expect(page.getByText('Save your practice session before running code.')).toBeVisible();
  await page.getByRole('button', { name: 'Reset panel layout' }).click();
  await expect(separator).toHaveAttribute('aria-valuenow', '42');
});

test('oversized rejected edits never leave displayed code different from saved source', async ({ page }) => {
  await open(page);
  await code(page);
  const valid = 'def find_pair(values, target):\n    return []';
  await editor(page, 'Python implementation').fill(valid);
  await editor(page, 'Python implementation').fill('x'.repeat(100001));
  await expect(page.locator('.practice-notices').getByRole('alert')).toContainText('100');
  await expect.poll(() => text(page, 'Python implementation')).toBe(valid);
  await page.reload();
  await expect.poll(() => text(page, 'Python implementation')).toBe(valid);
});

test('inactive language edits save before changing activities and can be restored', async ({ page }) => {
  await open(page);
  await code(page);
  const source = 'def find_pair(values, target):\n    return [0, 1]';
  await editor(page, 'Python implementation').fill(source);
  await page.getByRole('button', { name: /C\+\+ C\+\+20/ }).click();
  await page.getByRole('combobox', { name: 'Practice activity' }).selectOption(practiceItems[1].id);
  await expect(page).toHaveURL(new RegExp(`problem=${practiceItems[1].id}`));
  await page.goto(`/practice?problem=${defaultPracticeItem.id}&stage=code`);
  await page.getByRole('button', { name: /Python 3 python3/ }).click();
  await expect.poll(() => text(page, 'Python implementation')).toBe(source);
});

test('phone users can switch context, editor and results without losing their work', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await code(page);
  const input = editor(page, 'Python implementation');
  await input.fill('def sample():\n    pass');
  const panels = page.getByRole('navigation', { name: 'Workspace panels' });
  await panels.getByRole('button', { name: 'Problem', exact: true }).click();
  await expect(input).toBeHidden();
  await page.getByRole('tab', { name: 'My approach', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your current approach' })).toBeVisible();
  await panels.getByRole('button', { name: 'Workspace', exact: true }).click();
  await expect.poll(() => text(page, 'Python implementation')).toBe('def sample():\n    pass');
  await page.getByRole('button', { name: 'Run verified tests', exact: true }).click();
  await expect(panels.getByRole('button', { name: 'Results', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Save your practice session before running code.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
  await panels.getByRole('button', { name: 'Workspace', exact: true }).click();
  await page.screenshot({ path: '../../.local-docs/screens/workspace-phone.png', fullPage: true });
});

test('reset persists after reload and the recovery copy retains every language', async ({ page }) => {
  await open(page);
  await code(page);
  const python = 'def find_pair(values, target):\n    return [0, 1]';
  await editor(page, 'Python implementation').fill(python);
  await page.getByRole('button', { name: /C\+\+ C\+\+20/ }).click();
  await editor(page, 'C++ implementation').fill('int answer() { return 7; }');
  await page.getByRole('button', { name: '01 Approach', exact: true }).click();
  await editor(page, 'Pseudocode draft').fill('Keep the approach in the recovery copy.');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Reset session', exact: true }).click();
  await expect.poll(() => text(page, 'Pseudocode draft')).toBe('');
  await expect(page.getByText('Offline draft', { exact: true })).toBeVisible();
  await page.reload();
  await expect.poll(() => text(page, 'Pseudocode draft')).toBe('');
  await page.getByText('Saved recovery copy', { exact: true }).click();
  await page.getByRole('button', { name: 'Restore recovery copy', exact: true }).click();
  await expect.poll(() => text(page, 'Pseudocode draft')).toBe('Keep the approach in the recovery copy.');
  await page.getByRole('button', { name: '03 Code & test', exact: true }).click();
  await page.getByRole('button', { name: /Python 3 python3/ }).click();
  await expect.poll(() => text(page, 'Python implementation')).toBe(python);
});

test('a failed enhanced editor download retains an editable, savable keyboard fallback', async ({ page }) => {
  const manifest = JSON.parse(readFileSync(join(__dirname, '../.next/react-loadable-manifest.json'), 'utf8')) as Record<string, { files: string[] }>;
  const runtime = manifest['components/code-editor.tsx -> @/lib/code-editor-runtime'].files.at(-1);
  if (!runtime) throw new Error('Editor runtime chunk was not built');
  await page.route(`**/_next/${runtime}`, route => route.abort('failed'));
  await open(page);
  const fallback = page.getByRole('textbox', { name: 'Pseudocode draft', exact: true });
  await expect(page.locator('.practice-stage-panel:not([hidden])').getByText('The enhanced editor could not load.', { exact: false })).toBeVisible();
  await fallback.fill('plan');
  await fallback.press('End');
  await fallback.press('Tab');
  await expect(fallback).toHaveValue('plan  ');
  await fallback.press('Escape');
  await fallback.press('Tab');
  await expect(fallback).not.toBeFocused();
  await expect(page.getByText('Offline draft', { exact: true })).toBeVisible();
  await page.reload();
  await expect(fallback).toHaveValue('plan  ');
});
