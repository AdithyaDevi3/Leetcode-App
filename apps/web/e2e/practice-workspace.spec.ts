import { expect, test, type Page } from '@playwright/test';

async function openHydratedWorkspace(page: Page) {
  await page.goto('/practice');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Remember what you have seen' }),
  ).toBeVisible();
  await expect(page.getByText('Ready', { exact: true })).toBeVisible();
}

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
    page.getByRole('heading', { level: 1, name: 'Remember what you have seen' }),
  ).toBeVisible();
  await expect(page.getByText('Ready', { exact: true })).toBeVisible();
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

  await expect(page.getByText('Saved locally. Your first recommendation is Island Count.')).toBeVisible();
  const recommendation = page.getByRole('link', { name: 'Start recommended practice' });
  await expect(recommendation).toHaveAttribute('href', '/practice?problem=island-count-v1');

  await page.goto('/');
  const practiceLink = page.getByRole('link', { name: 'Start a practice session' });
  await expect(practiceLink).toHaveAttribute('href', '/practice?problem=island-count-v1');
  await practiceLink.click();

  await expect(page).toHaveURL(/\/practice\?problem=island-count-v1$/);
  await expect(page.getByRole('heading', { name: 'Island Count' })).toBeVisible();
  await page.getByRole('button', { name: 'Insert example answer' }).click();
  await expect(page.getByLabel('Pseudocode draft')).toHaveValue(/For each cell in the grid/);
  await page.getByRole('button', { name: 'Evaluate reasoning' }).click();
  await expect(page.getByText('Implementation unlocked')).toBeVisible();
  await expect(page.getByLabel('Python implementation')).toHaveValue(/def count_islands\(grid: list\[list\[int\]\]\):/);
  await page.getByRole('button', { name: /C\+\+ C\+\+20/ }).click();
  await expect(page.getByLabel('C++ implementation')).toHaveValue(/int countIslands\(vector<vector<int>> grid\)/);
  await page.getByRole('button', { name: /Python 3 python3/ }).click();
  await expect(page.getByLabel('Python implementation')).toHaveValue(/def count_islands/);
});

test('guest can open the workspace and autosave a draft locally', async ({ page }) => {
  await openHydratedWorkspace(page);

  await expect(page.getByLabel('Pseudocode draft')).toBeVisible();

  await page.getByLabel('Pseudocode draft').fill('Create a map.\nCheck the complement.');

  await expect(page.getByText('Offline draft')).toBeVisible();

  const sessionValue = await page.evaluate(() => {
    const key = 'method:pair-with-target-v1:session';
    return window.localStorage.getItem(key);
  });

  expect(sessionValue).toContain('Create a map.');
  expect(sessionValue).toContain('Check the complement.');
});

test('guest can reveal and use the reference pseudocode without replacing their draft automatically', async ({ page }) => {
  await openHydratedWorkspace(page);

  const editor = page.getByLabel('Pseudocode draft');
  await editor.fill('My own approach stays here.');
  await page.getByRole('button', { name: 'Show example answer' }).click();

  const answer = page.getByRole('region', { name: 'One accepted pseudocode approach' });
  await expect(answer).toBeVisible();
  await expect(answer).toContainText('Create an empty map from value to position.');
  await expect(answer).toContainText('Why it works');
  await expect(editor).toHaveValue('My own approach stays here.');

  await answer.getByRole('button', { name: 'Use as my draft' }).click();
  await expect(editor).toHaveValue(/Let complement be target minus value/);
  await page.getByRole('button', { name: 'Hide example answer' }).click();
  await expect(answer).toBeHidden();
});

test('guest can insert the example answer and pass the reasoning check', async ({ page }) => {
  await openHydratedWorkspace(page);

  await page.getByRole('button', { name: 'Insert example answer' }).click();
  await page.getByRole('button', { name: 'Evaluate reasoning' }).click();

  await expect(page.getByText('Implementation unlocked')).toBeVisible();
  await expect(page.getByRole('button', { name: /Run verified tests/i })).toBeEnabled();

  await page.getByRole('button', { name: /TypeScript Node\.js/ }).click();
  await page.getByLabel('TypeScript implementation').fill(`function findPair(values: number[], target: number) {
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
    window.localStorage.setItem('method:pair-with-target-v1:remote-session', 'session-1');
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

  await page.getByLabel('Pseudocode draft').fill('Create a map.\nStore values as you go.');
  await expect(page.getByText('Offline draft')).toBeVisible();

  await page.reload();

  await expect(page.getByLabel('Pseudocode draft')).toHaveValue('Create a map.\nStore values as you go.');
  await expect(page.getByText('Restored locally')).toBeVisible();
});

test('unavailable execution never records an unverified completion', async ({ page }) => {
  await openHydratedWorkspace(page);

  await page.getByRole('button', { name: 'Insert example answer' }).click();
  await page.getByRole('button', { name: 'Evaluate reasoning' }).click();

  await page.getByRole('button', { name: /TypeScript Node\.js/ }).click();
  await page.getByLabel('TypeScript implementation').fill(`function findPair(values: number[], target: number) {
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
    window.localStorage.setItem('method:pair-with-target-v1:remote-session', 'session-1');
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

  await page.getByLabel('Pseudocode draft').fill('Draft that stays local.');

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

  await page.getByLabel('Pseudocode draft').fill('Save this on the server.');

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

  await page.getByLabel('Pseudocode draft').fill('Conflict this draft.');

  await expect(page.getByText('Conflict')).toBeVisible();
  await expect(page.getByText('Resolve conflict')).toBeVisible();
});
