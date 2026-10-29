import { expect, test, type Page } from '@playwright/test';
import { defaultPracticeItem } from '../src/lib/content';

const workspaceEditor = (page: Page, label: string) => page.locator('[data-editor-ready="true"]').getByRole('textbox', { name: label, exact: true });
async function expectEditorSource(page: Page, label: string, expected: string | RegExp) {
  const input = workspaceEditor(page, label);
  await expect(input).toBeAttached();
  const actual = () => input.locator('.cm-line').evaluateAll(lines => lines.map(line => line.textContent ?? '').join('\n'));
  if (typeof expected === 'string') await expect.poll(actual).toBe(expected);
  else await expect.poll(actual).toMatch(expected);
}
const openStage = (page: Page, stage: 'approach' | 'feedback' | 'code') => page.getByRole('button', { name: stage === 'approach' ? '01 Approach' : stage === 'feedback' ? '02 Feedback' : '03 Code & test', exact: true }).click();

test.beforeEach(async ({ page }) => {
  await page.route('**/api/practice/owner', route => route.fulfill({ json: { owner: { kind: 'guest', id: 'test-guest' } } }));
});

const verifiedSource = 'def find_pair(values, target):\n    return [0, 1]';
const editedSource = 'def find_pair(values, target):\n    return []';
const receivedGrade = {
  problemId: 'pair-with-target-v1', version: 'code-tests-v3', passed: true,
  passedCount: 4, totalCount: 4,
  tests: ['basic pair', 'no match', 'duplicate values', 'negative values'].map(name => ({ name, passed: true })),
};
const verification = {
  requestId: 'verification-saved', language: 'python', source: verifiedSource,
  grade: receivedGrade, verifiedAt: '2026-10-26T00:00:00.000Z',
};
const cachedWorkspace = {
  draft: '', mode: 'text', language: 'python', code: verifiedSource,
  codeChecked: false, completed: false, evaluation: null, codeGrade: null,
};
const assignedPracticePath = '/practice?assignment=11111111-1111-4111-8111-111111111111';

async function mockOwnedPractice(page: Page, metadata: Record<string, unknown>, signedIn = true) {
  await page.route('**/api/practice/owner', route => route.fulfill({ json: { owner: { kind: signedIn ? 'user' : 'guest', id: signedIn ? 'verification-learner' : 'verification-guest' } } }));
  await page.route('**/api/viewer', route => route.fulfill({ json: { viewer: signedIn
    ? { id: 'verification-learner', email: 'learner@example.invalid', displayName: 'Learner', canAccessAdministration: false } : null } }));
  await page.route('**/api/practice/sessions**', async route => {
    const request = route.request();
    if (request.method() === 'GET') {
      await route.fulfill({ json: { session: { id: 'session-verified', revision: 3, latestRevisionNumber: 1, sessionMetadata: metadata } } });
    } else if (new URL(request.url()).pathname.endsWith('/sessions')) {
      await route.fulfill({ json: { session: { id: 'session-verified', revision: 3 } } });
    } else {
      const body = request.postDataJSON();
      if (body.state?.codeGrade) {
        await route.fulfill({ status: 500, json: { error: 'browser result autosave unavailable' } });
      } else {
        metadata.workspaceState = body.state;
        await route.fulfill({ json: { revision: { revisionNumber: 2 } } });
      }
    }
  });
}

test('guest restores a server verification without any browser result snapshot', async ({ page }) => {
  await mockOwnedPractice(page, { verification }, false);
  await page.goto(assignedPracticePath);
  await expectEditorSource(page, 'Python implementation', verifiedSource);
  await expect(page.locator('.grader-state')).toHaveText('Passed');
  await expect(page.getByText('Restored from account')).toBeVisible();
});

test('reload restores verification even when both browser result saves are missing', async ({ page }) => {
  const metadata: Record<string, unknown> = {};
  await mockOwnedPractice(page, metadata);
  await page.addInitScript(state => {
    const key = 'method:user:verification-learner:pair-with-target-v1:workspace-v2';
    const value = JSON.stringify({ version: 2, state, base: null });
    localStorage.setItem(key, value);
    for (const stored of Object.keys(localStorage)) if (stored.startsWith(`${key}:tab:`)) localStorage.setItem(stored, value);
  }, cachedWorkspace);
  await page.route('**/api/practice/sessions/*/verify', async route => {
    metadata.verification = verification;
    await route.fulfill({ json: { status: 'completed', grade: receivedGrade, durationMs: 20 } });
  });
  await page.goto(assignedPracticePath);
  await expectEditorSource(page, 'Python implementation', verifiedSource);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('method:user:verification-learner:pair-with-target-v1:remote-session'))).toBe('session-verified');
  await page.getByRole('button', { name: 'Run verified tests', exact: true }).click();
  await expect(page.locator('.grader-state')).toHaveText('Passed');
  await page.reload();
  await expectEditorSource(page, 'Python implementation', verifiedSource);
  await expect(page.locator('.grader-state')).toHaveText('Passed');
});

test('account verification preserves a newer local draft and does not grade its edited code', async ({ page }) => {
  await mockOwnedPractice(page, { verification });
  await page.addInitScript(state => {
    localStorage.setItem('method:user:verification-learner:pair-with-target-v1:workspace-v2', JSON.stringify({ version: 2, state, base: null }));
  }, { ...cachedWorkspace, draft: 'Keep this newer local reasoning.', code: editedSource, codeChecked: true, completed: true, codeGrade: receivedGrade });
  await page.goto(assignedPracticePath);
  await expectEditorSource(page, 'Python implementation', editedSource);
  await openStage(page, 'approach');
  await expectEditorSource(page, 'Pseudocode draft', 'Keep this newer local reasoning.');
  await openStage(page, 'code');
  await expect(page.locator('.grader-state')).toHaveText('Not run');
});

test('a verification response cannot mark code edited during the run as passed', async ({ page }) => {
  await mockOwnedPractice(page, {});
  let release!: () => void;
  const responseReady = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/practice/sessions/*/verify', async route => {
    await responseReady;
    await route.fulfill({ json: { status: 'completed', grade: receivedGrade, durationMs: 20 } });
  });
  await page.goto(assignedPracticePath);
  await workspaceEditor(page, 'Python implementation').fill(verifiedSource);
  await expect(page.getByText('Saved to server')).toBeVisible();
  await page.getByRole('button', { name: 'Run verified tests', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Running verified tests…' })).toBeVisible();
  await workspaceEditor(page, 'Python implementation').fill(editedSource);
  release();
  await expect(page.getByText('The earlier submission finished. Run your edited code to verify it.')).toBeVisible();
  await expectEditorSource(page, 'Python implementation', editedSource);
  await expect(page.locator('.grader-state')).toHaveText('Not run');
});

async function openHydratedWorkspace(page: Page) {
  await page.goto('/practice');
  await expect(
    page.getByRole('heading', { level: 1, name: defaultPracticeItem.problem.title }),
  ).toBeVisible();
  await expect(page.getByText('Ready', { exact: true })).toBeVisible();
  await expect(workspaceEditor(page, 'Pseudocode draft')).toBeVisible();
}

test('switching accounts opens only that owner’s cache and ignores delayed previous-owner responses', async ({ page }) => {
  let owner = 'account-a';
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/practice/owner', route => route.fulfill({ json: { owner: { kind: 'user', id: owner } } }));
  await page.addInitScript(state => {
    for (const id of ['account-a', 'account-b']) localStorage.setItem(`method:user:${id}:pair-with-target-v1:workspace-v2`, JSON.stringify({ version: 2, base: null, state: { ...state, draft: `${id} private draft` } }));
  }, cachedWorkspace);
  await page.route('**/api/practice/sessions**', async route => {
    if (route.request().method() === 'GET' && route.request().headers()['x-practice-owner'] === 'user:account-a') {
      await held;
      await route.fulfill({ json: { session: { id: 'old-account-session', revision: 7, latestRevisionNumber: 3, sessionMetadata: { workspaceState: { ...cachedWorkspace, draft: 'Delayed previous account response.' } } } } });
    } else await route.fulfill({ status: 503, json: { error: 'offline' } });
  });
  await page.goto('/practice');
  await expectEditorSource(page, 'Pseudocode draft', 'account-a private draft');
  await workspaceEditor(page, 'Pseudocode draft').fill('Unsaved edit belongs to account A.');
  owner = 'account-b';
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expectEditorSource(page, 'Pseudocode draft', 'account-b private draft');
  release();
  await expectEditorSource(page, 'Pseudocode draft', 'account-b private draft');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('method:user:account-a:pair-with-target-v1:workspace-v2')!).state.draft)).toBe('Unsaved edit belongs to account A.');
});

for (const choice of ['server', 'local'] as const) {
  test(`conflict recovery can continue the ${choice} draft and retains the other copy across reload`, async ({ page }) => {
    if (choice === 'server') await page.setViewportSize({ width: 390, height: 844 });
    const base = { ...cachedWorkspace, draft: 'Original shared plan.' };
    const local = { ...base, draft: 'Local unsaved plan.' };
    let server = { ...base, draft: 'Updated second-device plan.' };
    let revision = 2;
    const writes: Record<string, unknown>[] = [];
    await page.addInitScript(({ local, base }) => {
      if (!localStorage.getItem('method:guest:test-guest:pair-with-target-v1:workspace-v2')) localStorage.setItem('method:guest:test-guest:pair-with-target-v1:workspace-v2', JSON.stringify({ version: 2, state: local, base: { sessionId: 'session-conflict', revisionNumber: 1, state: base } }));
    }, { local, base });
    await page.route('**/api/practice/sessions**', async route => {
      if (route.request().method() === 'GET') await route.fulfill({ json: { session: { id: 'session-conflict', revision: revision + 1, latestRevisionNumber: revision, sessionMetadata: { workspaceState: server } } } });
      else {
        const body = route.request().postDataJSON();
        writes.push(body);
        if (body.expectedRevisionNumber !== revision) { await route.fulfill({ status: 409, json: { code: 'revision_conflict' } }); return; }
        server = body.state; revision += 1;
        await route.fulfill({ json: { revision: { revisionNumber: revision } } });
      }
    });
    await page.goto('/practice');
    await expect(page.getByRole('alert', { name: 'Resolve practice conflict' })).toBeVisible();
    if (choice === 'server') expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expectEditorSource(page, 'Pseudocode draft', local.draft);
    expect(writes).toHaveLength(0);
    await page.getByRole('button', { name: choice === 'server' ? 'Use server draft' : 'Continue with this draft', exact: true }).click();
    const selected = choice === 'server' ? server.draft : local.draft;
    const recovery = choice === 'server' ? local.draft : 'Updated second-device plan.';
    await expectEditorSource(page, 'Pseudocode draft', selected);
    if (choice === 'local') {
      await expect(page.getByText('Saved to server')).toBeVisible();
      expect(writes[0]).toMatchObject({ expectedRevisionNumber: 2, state: { draft: local.draft } });
    } else expect(writes).toHaveLength(0);
    await page.reload();
    await expectEditorSource(page, 'Pseudocode draft', selected);
    await page.getByText('Saved recovery copy', { exact: true }).click();
    await expect(page.getByText(recovery, { exact: false }).first()).toBeVisible();
  });
}

test('a lost save response can be retried after reload with its original receipt', async ({ page }) => {
  let server: typeof cachedWorkspace | null = null;
  let revision = 0;
  const requests: Record<string, unknown>[] = [];
  await page.route('**/api/practice/sessions**', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { session: { id: 'session-retry', revision: revision + 1, latestRevisionNumber: revision, sessionMetadata: server ? { workspaceState: server } : {} } } });
      return;
    }
    const body = route.request().postDataJSON();
    requests.push(body);
    if (requests.length === 1) {
      server = body.state; revision = 1;
      await route.fulfill({ status: 500, json: { error: 'response lost after commit' } });
    } else {
      expect(body.requestKey).toBe(requests[0].requestKey);
      await route.fulfill({ json: { revision: { revisionNumber: 1 } } });
    }
  });
  await openHydratedWorkspace(page);
  await workspaceEditor(page, 'Pseudocode draft').fill('Persist this even if the response is lost.');
  await expect(page.getByText('Offline draft')).toBeVisible();
  await page.reload();
  await expectEditorSource(page, 'Pseudocode draft', 'Persist this even if the response is lost.');
  await expect(page.getByText('Saved to server')).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
});

test('a delayed remote load cannot overwrite work typed while it was loading', async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let writes = 0;
  await page.route('**/api/practice/sessions**', async route => {
    if (route.request().method() !== 'GET') { writes += 1; await route.fulfill({ status: 500 }); return; }
    await held;
    await route.fulfill({ json: { session: { id: 'session-delayed', revision: 5, latestRevisionNumber: 3, sessionMetadata: { workspaceState: { ...cachedWorkspace, draft: 'Existing account plan.' } } } } });
  });
  await openHydratedWorkspace(page);
  await workspaceEditor(page, 'Pseudocode draft').fill('New plan typed before the server responded.');
  release();
  await expect(page.getByRole('alert', { name: 'Resolve practice conflict' })).toBeVisible();
  await expectEditorSource(page, 'Pseudocode draft', 'New plan typed before the server responded.');
  expect(writes).toBe(0);
});

test('an older unscoped draft is kept for explicit recovery and never imported into an account automatically', async ({ page }) => {
  await page.route('**/api/practice/owner', route => route.fulfill({ json: { owner: { kind: 'user', id: 'new-account' } } }));
  await page.addInitScript(state => localStorage.setItem('method:pair-with-target-v1:session', JSON.stringify({ ...state, draft: 'Unclaimed older browser work.' })), cachedWorkspace);
  await page.route('**/api/practice/sessions**', route => route.fulfill({ status: 503 }));
  await openHydratedWorkspace(page);
  await expectEditorSource(page, 'Pseudocode draft', '');
  await page.getByText('Older draft saved in this browser', { exact: true }).click();
  await page.getByRole('button', { name: 'Import older browser draft' }).click();
  await expectEditorSource(page, 'Pseudocode draft', 'Unclaimed older browser work.');
  expect(await page.evaluate(() => localStorage.getItem('method:pair-with-target-v1:session'))).toContain('Unclaimed older browser work.');
});

test('work created without an account connection can be imported explicitly after reconnecting', async ({ page }) => {
  let connected = false;
  const server = { ...cachedWorkspace, draft: 'Existing account plan.' };
  await page.route('**/api/practice/owner', route => connected
    ? route.fulfill({ json: { owner: { kind: 'user', id: 'reconnected-user' } } })
    : route.fulfill({ status: 503 }));
  await page.route('**/api/practice/sessions**', route => route.request().method() === 'GET'
    ? route.fulfill({ json: { session: { id: 'session-connected', revision: 3, latestRevisionNumber: 2, sessionMetadata: { workspaceState: server } } } })
    : route.fulfill({ status: 503 }));
  await page.goto('/practice');
  await expect(page.getByText('Account connection unavailable.', { exact: false })).toBeVisible();
  await workspaceEditor(page, 'Pseudocode draft').fill('Offline work to retain.');
  await expect(page.getByText('Offline draft', { exact: true })).toBeVisible();
  connected = true;
  await page.getByRole('button', { name: 'Reconnect', exact: true }).click();
  await expectEditorSource(page, 'Pseudocode draft', 'Existing account plan.');
  await page.getByText('Offline draft from this browser', { exact: true }).click();
  await page.getByRole('button', { name: 'Import offline draft', exact: true }).click();
  await expectEditorSource(page, 'Pseudocode draft', 'Offline work to retain.');
  await page.getByText('Saved recovery copy', { exact: true }).click();
  await expect(page.getByText('Existing account plan.', { exact: false }).first()).toBeVisible();
});

test('another tab cannot silently advance the base of an unsaved local edit', async ({ page, context }) => {
  let server = { ...cachedWorkspace, draft: 'Shared starting plan.' };
  let revision = 1;
  let saving = false;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const writes: Record<string, unknown>[] = [];
  await context.route('**/api/practice/owner', route => route.fulfill({ json: { owner: { kind: 'guest', id: 'test-guest' } } }));
  await context.route('**/api/practice/sessions**', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { session: { id: 'session-tabs', revision: revision + 1, latestRevisionNumber: revision, sessionMetadata: { workspaceState: server } } } });
      return;
    }
    const body = route.request().postDataJSON();
    writes.push(body);
    if (body.draft === 'First tab changed plan.') { saving = true; await held; }
    if (body.expectedRevisionNumber !== revision) { await route.fulfill({ status: 409, json: { code: 'revision_conflict' } }); return; }
    server = body.state; revision += 1;
    await route.fulfill({ json: { revision: { revisionNumber: revision } } });
  });
  const other = await context.newPage();
  await page.goto('/practice');
  await other.goto('/practice');
  await expectEditorSource(page, 'Pseudocode draft', 'Shared starting plan.');
  await expectEditorSource(other, 'Pseudocode draft', 'Shared starting plan.');
  await workspaceEditor(page, 'Pseudocode draft').fill('First tab changed plan.');
  await expect.poll(() => saving).toBe(true);
  await workspaceEditor(other, 'Pseudocode draft').fill('Second tab unsaved plan.');
  release();
  await expect(page.getByText('Saved to server')).toBeVisible();
  await expect(other.getByRole('alert', { name: 'Resolve practice conflict' })).toBeVisible();
  await expectEditorSource(other, 'Pseudocode draft', 'Second tab unsaved plan.');
  await other.reload();
  await expectEditorSource(other, 'Pseudocode draft', 'Second tab unsaved plan.');
  await expect(other.getByRole('alert', { name: 'Resolve practice conflict' })).toBeVisible();
  expect(server.draft).toBe('First tab changed plan.');
  expect(writes).toHaveLength(1);
  await other.close();
});

test('home practice button performs a document navigation into the workspace', async ({ page }) => {
  await page.goto('/');

  const practiceLink = page.getByRole('link', { name: 'Start a practice session' });
  await expect(practiceLink).toHaveAttribute('href', '/practice');
  await page.evaluate(() => {
    document.documentElement.dataset.navigationSentinel = 'old-document';
  });

  const navigation = page.waitForEvent('framenavigated');
  await practiceLink.click();
  await navigation;

  await expect(page).toHaveURL(/\/practice$/);
  await expect(page.locator('html')).not.toHaveAttribute('data-navigation-sentinel');
  await expect(
    page.getByRole('heading', { level: 1, name: defaultPracticeItem.problem.title }),
  ).toBeVisible();
  await expect(page.getByText('Ready', { exact: true })).toBeVisible();
});

test('assigned task can be submitted from its practice workspace', async ({ page }) => {
  const recipientId = '11111111-1111-4111-8111-111111111111';
  const submissions: Record<string, unknown>[] = [];
  await page.route(`**/api/learner/assignments/${recipientId}/submissions`, async (route) => {
    submissions.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ attempt: { id: 'attempt-1', status: 'submitted' } }) });
  });

  await page.goto(`/practice?problem=pair-with-target-v1&assignment=${recipientId}`);
  await expect(page.getByRole('button', { name: 'Submit assigned task' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Complete your coding assignment' })).toBeVisible();
  await openStage(page, 'feedback');
  await expect(page.getByText('Assignment coding is open')).toBeVisible();
  await openStage(page, 'code');
  await expect(workspaceEditor(page, 'Python implementation')).toBeEnabled();
  await expect(page.getByRole('button', { name: /Run verified tests/i })).toBeEnabled();
  await page.getByRole('button', { name: 'Submit assigned task' }).click();

  await expect(page.getByRole('status').filter({ hasText: 'added to your instructor’s class review inbox' })).toBeVisible();
  expect(submissions[0]).toMatchObject({ language: 'python' });
  expect(submissions[0]?.source).toContain('def find_pair');
  expect(typeof submissions[0]?.requestKey).toBe('string');
});

test('automated assignment checks are reported separately from instructor rubric review', async ({ page }) => {
  const recipientId = '11111111-1111-4111-8111-111111111111';
  await page.route(`**/api/learner/assignments/${recipientId}/submissions`, route => route.fulfill({
    status: 202,
    contentType: 'application/json',
    body: JSON.stringify({ attempt: { id: 'attempt-2', status: 'queued' } }),
  }));

  await page.goto(`/practice?problem=pair-with-target-v1&assignment=${recipientId}`);
  await page.getByRole('button', { name: 'Submit assigned task' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Automated checks are processing' })).toBeVisible();
});

test('service worker leaves Next.js static assets on the network', async ({ request }) => {
  const response = await request.get('/sw.js');
  expect(response.ok()).toBe(true);

  const source = await response.text();
  expect(source).toContain("event.request.mode !== 'navigate'");
  expect(source).not.toContain("url.pathname.startsWith('/_next/static/')");
});

test('local preferences choose a working personalized algorithm', async ({ page }) => {
  await page.goto('/onboarding');

  await page.getByLabel('Goal').selectOption('exploration');
  await page.getByLabel('Experience').selectOption('experienced');
  await page.getByLabel('Preferred language').selectOption('python');
  await page.getByLabel('Weekly minutes').fill('360');
  await page.getByLabel('Include an optional diagnostic challenge in my plan').check();
  await page.getByRole('button', { name: 'Save plan' }).click();

  await expect(page.getByText('Saved on this device. Your first recommendation is Island Count.')).toBeVisible();
  const recommendation = page.getByRole('link', { name: 'Start recommended practice' });
  await expect(recommendation).toHaveAttribute('href', '/practice?problem=island-count-v1');

  await page.goto('/');
  const practiceLink = page.getByRole('link', { name: 'Start a practice session' });
  await expect(practiceLink).toHaveAttribute('href', '/practice?problem=island-count-v1');
  await practiceLink.click();

  await expect(page).toHaveURL(/\/practice\?problem=island-count-v1$/);
  await expect(page.getByRole('heading', { name: 'Island Count', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Insert example answer' }).click();
  await expectEditorSource(page, 'Pseudocode draft', /For each cell in the grid/);
  await page.getByRole('button', { name: 'Evaluate reasoning' }).click();
  await expect(page.getByText('Implementation unlocked')).toBeVisible();
  await openStage(page, 'code');
  await expectEditorSource(page, 'Python implementation', /def count_islands\(grid: list\[list\[int\]\]\):/);
  await page.getByRole('button', { name: /C\+\+ C\+\+20/ }).click();
  await expectEditorSource(page, 'C++ implementation', /int countIslands\(vector<vector<int>> grid\)/);
  await page.getByRole('button', { name: /Python 3 python3/ }).click();
  await expectEditorSource(page, 'Python implementation', /def count_islands/);
});

test('signed-in learner carries onboarding and completed practice into the dashboard', async ({ page }) => {
  const learnerId = '11111111-1111-4111-8111-111111111111';
  await page.route('**/api/viewer', route => route.fulfill({ json: { viewer: { id: learnerId, email: null, displayName: 'Sample Learner', canAccessAdministration: false } } }));
  let savedProfile: Record<string, unknown> | null = null;
  await page.route('**/api/learner/profile', async (route) => {
    if (route.request().method() === 'PUT') {
      savedProfile = route.request().postDataJSON() as Record<string, unknown>;
      expect(route.request().headers()['x-learning-owner']).toBe(learnerId);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ learnerId, profile: savedProfile }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ learnerId, profile: savedProfile }),
    });
  });
  await page.route('**/api/practice/history', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ sessions: [{
        session: { contentId: 'pair-with-target-v1', status: 'completed', updatedAt: '2026-10-11T12:00:00.000Z' },
        evaluation: { score: 92 },
      }] }),
    });
  });
  await page.route('**/api/learner/reviews', async (route) => {
    const review = { id: 'review-1', conceptId: 'hash-maps', dueAt: '2026-10-10T12:00:00.000Z', intervalDays: 2, repetitions: 1, practiceItemId: 'pair-with-target-v1', label: 'Pair With Target' };
    if (route.request().method() === 'POST') {
      expect(route.request().headers()['x-learning-owner']).toBe(learnerId);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ learnerId, review: { ...review, dueAt: new Date(Date.now() + 86_400_000).toISOString() } }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ learnerId, reviews: [review] }),
    });
  });
  await page.route('**/api/learner/learning', route => route.fulfill({ json: {
    learnerId,
    snapshot: { algorithmVersion: 'learning-evidence-v1', generatedAt: '2026-10-27T12:00:00.000Z', optOut: false, concepts: [], recentActivityIds: [], sourceSummary: { releasedQuizItems: 0, verifiedPracticeItems: 0, independentItems: 0 }, processing: { pending: false, processedSources: 0, remainingSources: 0 } },
    plan: { algorithmVersion: 'learning-evidence-v1', status: 'ready', recommendations: [{ practiceId: 'balanced-brackets-v1', label: 'Balanced Brackets', conceptIds: ['stack-lifo'], difficulty: 'foundation', estimatedMinutes: 20, reason: 'Build initial evidence for an unknown concept.', reasonKind: 'diagnostic', evidenceStatus: 'unknown' }] },
  } }));

  await page.goto('/onboarding');
  await page.getByLabel('Goal').selectOption('coursework');
  await page.getByLabel('Weekly minutes').fill('180');
  await page.getByRole('button', { name: 'Save plan' }).click();
  await expect(page.getByText(/Saved to your account\. Your first recommendation is/)).toBeVisible();
  expect(savedProfile).toMatchObject({ goal: 'coursework', weeklyMinutes: 180 });

  await page.goto('/dashboard');
  await expect(page.getByText('Plan synced with your account.')).toBeVisible();
  await expect(page.getByText('Completed').locator('..').getByText('1', { exact: true })).toBeVisible();
  const earlier = page.getByRole('region', { name: 'Earlier saved practice reviews' });
  await expect(earlier.getByText('1 earlier review due', { exact: false })).toBeVisible();
  await expect(earlier.getByRole('link', { name: 'Open earlier review Pair With Target' })).toHaveAttribute('href', '/practice?problem=pair-with-target-v1');
  await earlier.getByRole('button', { name: 'Move earlier review Pair With Target to tomorrow' }).click();
  await expect(page.getByText('Review moved to tomorrow. Your streak is unchanged.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Balanced Brackets' })).toBeVisible();
  await expect(earlier.getByText('Pair With Target', { exact: true })).toBeVisible();
  await expect(page.getByText('No account evidence yet.', { exact: false })).toBeVisible();
});

test('guest can open the workspace and autosave a draft locally', async ({ page }) => {
  await openHydratedWorkspace(page);

  await expect(workspaceEditor(page, 'Pseudocode draft')).toBeVisible();

  await workspaceEditor(page, 'Pseudocode draft').fill('Create a map.\nCheck the complement.');

  await expect(page.getByText('Offline draft')).toBeVisible();

  const sessionValue = await page.evaluate(() => {
    const key = 'method:guest:test-guest:pair-with-target-v1:workspace-v2';
    return window.localStorage.getItem(key);
  });

  expect(sessionValue).toContain('Create a map.');
  expect(sessionValue).toContain('Check the complement.');
});

test('guest can reveal and use the reference pseudocode without replacing their draft automatically', async ({ page }) => {
  await openHydratedWorkspace(page);

  const editor = workspaceEditor(page, 'Pseudocode draft');
  await editor.fill('My own approach stays here.');
  await page.getByRole('button', { name: 'Show example answer' }).click();

  const answer = page.getByRole('region', { name: 'One accepted pseudocode approach' });
  await expect(answer).toBeVisible();
  await expect(answer).toContainText('Create an empty map from value to position.');
  await expect(answer).toContainText('Why it works');
  await expectEditorSource(page, 'Pseudocode draft', 'My own approach stays here.');

  await answer.getByRole('button', { name: 'Use as my draft' }).click();
  await expectEditorSource(page, 'Pseudocode draft', /Let complement be target minus value/);
  await page.getByRole('button', { name: 'Hide example answer' }).click();
  await expect(answer).toBeHidden();
});

test('guest can insert the example answer and pass the reasoning check', async ({ page }) => {
  await openHydratedWorkspace(page);

  await page.getByRole('button', { name: 'Insert example answer' }).click();
  await page.getByRole('button', { name: 'Evaluate reasoning' }).click();

  await expect(page.getByText('Implementation unlocked')).toBeVisible();
  await openStage(page, 'code');
  await expect(page.getByRole('button', { name: /Run verified tests/i })).toBeEnabled();

  await page.getByRole('button', { name: /TypeScript Node\.js/ }).click();
  await workspaceEditor(page, 'TypeScript implementation').fill(`function findPair(values: number[], target: number) {
  const map = new Map<number, number>();
  for (let index = 0; index < values.length; index += 1) {
    const complement = target - values[index];
    if (map.has(complement)) {
      return [map.get(complement)!, index];
    }
    map.set(values[index], index);
  }
  return [];
}`);

  await page.evaluate(() => {
    window.localStorage.setItem('method:guest:test-guest:pair-with-target-v1:remote-session', 'session-1');
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      if (String(input).endsWith('/api/practice/sessions/session-1/verify')) {
        return new Response(JSON.stringify({
          status: 'completed',
          grade: {
            problemId: 'pair-with-target-v1',
            version: 'code-tests-v3',
            passed: true,
            passedCount: 4,
            totalCount: 4,
            tests: [
              { name: 'finds a normal pair', passed: true },
              { name: 'uses distinct duplicate positions', passed: true },
              { name: 'handles negative values', passed: true },
              { name: 'finds a pair late in the list', passed: true },
            ],
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return originalFetch(input, init);
    };
  });
  await page.getByRole('button', { name: /Run verified tests/i }).click();

  await expect(page.getByText('Verified and saved to your local progress.')).toBeVisible();
});

test('guest draft resumes after reload', async ({ page }) => {
  await openHydratedWorkspace(page);

  await workspaceEditor(page, 'Pseudocode draft').fill('Create a map.\nStore values as you go.');
  await expect(page.getByText('Offline draft')).toBeVisible();

  await page.reload();

  await expectEditorSource(page, 'Pseudocode draft', 'Create a map.\nStore values as you go.');
  await expect(page.getByText('Restored locally')).toBeVisible();
});

test('signed-in learner resumes the complete workspace from another device', async ({ page }) => {
  let revisionWrites = 0;
  await page.route('**/api/viewer', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ viewer: { id: 'learner-1', email: 'learner@example.com', displayName: 'Learner', canAccessAdministration: false } }),
    });
  });
  await page.route('**/api/practice/sessions**', async (route) => {
    if (route.request().method() !== 'GET') {
      revisionWrites += 1;
      await route.fulfill({ status: 500, body: 'unexpected restore write' });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        session: {
          id: 'session-remote',
          revision: 9,
          latestRevisionNumber: 7,
          sessionMetadata: {
            workspaceState: {
              draft: 'Restore the complete learner plan.',
              mode: 'text',
              language: 'typescript',
              code: 'function findPair(values: number[], target: number) { return []; }',
              codeChecked: false,
              completed: false,
              evaluation: null,
              codeGrade: null,
            },
          },
        },
      }),
    });
  });

  await page.goto('/practice');

  await expectEditorSource(page, 'Pseudocode draft', 'Restore the complete learner plan.');
  await openStage(page, 'code');
  await expectEditorSource(page, 'TypeScript implementation', /function findPair/);
  await expect(page.getByText('Restored from account')).toBeVisible();
  await page.waitForTimeout(600);
  expect(revisionWrites).toBe(0);
});

test('unavailable execution never records an unverified completion', async ({ page }) => {
  await openHydratedWorkspace(page);

  await page.getByRole('button', { name: 'Insert example answer' }).click();
  await page.getByRole('button', { name: 'Evaluate reasoning' }).click();

  await openStage(page, 'code');
  await page.getByRole('button', { name: /TypeScript Node\.js/ }).click();
  await workspaceEditor(page, 'TypeScript implementation').fill(`function findPair(values: number[], target: number) {
  const map = new Map<number, number>();
  for (let index = 0; index < values.length; index += 1) {
    const complement = target - values[index];
    if (map.has(complement)) {
      return [map.get(complement)!, index];
    }
    map.set(values[index], index);
  }
  return [];
}`);

  await page.evaluate(() => {
    window.localStorage.setItem('method:guest:test-guest:pair-with-target-v1:remote-session', 'session-1');
    window.fetch = async (input) => String(input).endsWith('/verify')
      ? new Response(JSON.stringify({ error: 'Verified execution is unavailable' }), { status: 503, headers: { 'Content-Type': 'application/json' } })
      : new Response('', { status: 401 });
  });
  await page.getByRole('button', { name: /Run verified tests/i }).click();

  await expect(page.getByText(/Verified execution is not enabled/)).toBeVisible();
  await expect(page.getByText('Verified and saved to your local progress.')).toHaveCount(0);
});

test('sync helper reports offline draft without a signed-in session', async ({ page }) => {
  await openHydratedWorkspace(page);

  await page.evaluate(() => {
    window.fetch = async () => new Response('', { status: 401 });
  });

  await workspaceEditor(page, 'Pseudocode draft').fill('Draft that stays local.');

  await expect(page.getByText('Offline draft')).toBeVisible();
});

test('guest sees a server save when sync succeeds', async ({ page }) => {
  await openHydratedWorkspace(page);

  await page.evaluate(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = String(input);
      if (url.includes('/api/practice/sessions') && init?.method === 'POST') {
        if (url.endsWith('/api/practice/sessions')) {
          return new Response(JSON.stringify({ session: { id: 'session-1', revision: 1 } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ revision: { revisionNumber: 2 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return originalFetch(input, init);
    };
  });

  await workspaceEditor(page, 'Pseudocode draft').fill('Save this on the server.');

  await expect(page.getByText('Saved to server')).toBeVisible();
});

test('guest sees a conflict when sync reports one', async ({ page }) => {
  await openHydratedWorkspace(page);

  await page.evaluate(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/practice/sessions') && init?.method === 'POST') {
        return new Response(JSON.stringify({ session: { id: 'session-1', revision: 1 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.includes('/api/practice/sessions/session-1') && init?.method === 'POST') {
        return new Response('', { status: 409 });
      }

      return originalFetch(input, init);
    };
  });

  await workspaceEditor(page, 'Pseudocode draft').fill('Conflict this draft.');

  await expect(page.locator('.status-pill')).toContainText('Conflict');
  await expect(page.getByText('Resolve conflict')).toBeVisible();
});

test('queued evaluation cannot be submitted twice', async ({ page }) => {
  await openHydratedWorkspace(page);
  await page.getByRole('button', { name: 'Insert example answer' }).click();

  await page.evaluate(() => {
    window.localStorage.setItem('method:guest:test-guest:pair-with-target-v1:remote-session', 'session-1');
    const testWindow = window as typeof window & { evaluationRequests?: number };
    testWindow.evaluationRequests = 0;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/practice/sessions/session-1/evaluate') && init?.method === 'POST') {
        testWindow.evaluationRequests = (testWindow.evaluationRequests ?? 0) + 1;
        return new Response(JSON.stringify({ jobId: 'job-1', status: 'queued' }), {
          status: 202,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/api/practice/sessions/session-1/evaluate/job-1')) {
        return new Response(JSON.stringify({ status: 'queued' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return originalFetch(input, init);
    };
  });

  const evaluateButton = page.getByRole('button', { name: 'Evaluate reasoning' });
  await evaluateButton.dblclick();

  await expect(page.getByText('Implementation unlocked')).toBeVisible();
  await openStage(page, 'approach');
  await expect(page.getByRole('button', { name: 'Saving evaluation…' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Cancel evaluation' })).toBeVisible();
  await openStage(page, 'code');
  await expect(workspaceEditor(page, 'Python implementation')).toBeEnabled();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { evaluationRequests?: number }).evaluationRequests)).toBe(1);
});

test('rate-limited evaluation exposes a retry that recovers', async ({ page }) => {
  await openHydratedWorkspace(page);
  await page.getByRole('button', { name: 'Insert example answer' }).click();

  await page.evaluate(() => {
    window.localStorage.setItem('method:guest:test-guest:pair-with-target-v1:remote-session', 'session-1');
    const testWindow = window as typeof window & { evaluationRequests?: number };
    testWindow.evaluationRequests = 0;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/practice/sessions/session-1/evaluate') && init?.method === 'POST') {
        testWindow.evaluationRequests = (testWindow.evaluationRequests ?? 0) + 1;
        if (testWindow.evaluationRequests === 1) {
          return new Response(JSON.stringify({ error: 'Too many submissions' }), {
            status: 429,
            headers: { 'Content-Type': 'application/json', 'Retry-After': '2' },
          });
        }
        return new Response(JSON.stringify({ jobId: 'job-2', status: 'queued' }), {
          status: 202,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/api/practice/sessions/session-1/evaluate/job-2')) {
        return new Response(JSON.stringify({
          status: 'completed',
          result: {
            evaluation: {
              approved: true,
              score: 95,
              summary: 'Recovered evaluation completed.',
              rubricVersion: 'reasoning-v1',
              findings: [],
            },
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return originalFetch(input, init);
    };
  });

  await page.getByRole('button', { name: 'Evaluate reasoning' }).click();

  await expect(page.getByText('Too many submissions. Try again in 2 seconds. Your on-device evaluation is still available.')).toBeVisible();
  await page.getByRole('button', { name: 'Retry evaluation' }).click();

  await openStage(page, 'feedback');
  await expect(page.locator('.feedback-summary')).toHaveText('Recovered evaluation completed.');
  await expect.poll(() => page.evaluate(() => (window as typeof window & { evaluationRequests?: number }).evaluationRequests)).toBe(2);
});
