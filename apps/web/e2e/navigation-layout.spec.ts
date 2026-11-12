import { expect, test, type Page } from '@playwright/test';
import { defaultPracticeItem } from '../src/lib/content';

const pageRoutes = [
  '/',
  '/admin',
  '/auth',
  '/classes',
  '/dashboard',
  '/history',
  '/learn',
  '/library',
  '/offline',
  '/onboarding',
  '/practice',
  '/requests',
  '/roadmap',
  '/settings',
  '/system-design',
  '/teach',
  '/teach/start',
] as const;

async function openHydratedNavigation(page: Page, path: string) {
  const identityLoaded = page.waitForResponse(response => new URL(response.url()).pathname === '/api/viewer');
  await page.goto(path);
  await identityLoaded;
}

test('signed-out visitors are redirected away from administration', async ({ page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/auth\?next=%2Fadmin$/);
  await expect(page.getByRole('heading', { name: 'Your Method account' })).toBeVisible();
});

async function expectCleanLayout(page: Page) {
  const report = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const allControls = Array.from(document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea'));
    const mobileNavigation = document.querySelector('[aria-label="Mobile navigation"]');
    const underMobileNavigation: number[] = [];
    const insideWorkspaceScroll: number[] = [];
    const workspaceScrollPositions = Array.from(document.querySelectorAll<HTMLElement>('.practice-panels *'))
      .filter(element => /auto|scroll/.test(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight)
      .map((element, index) => {
        element.dataset.layoutScrollIndex = String(index);
        return { index, top: element.scrollTop, left: element.scrollLeft };
      });
    const controls = allControls
      .filter((element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
      });

    const outsideViewport = controls
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left < -1 || rect.right > viewportWidth + 1;
      })
      .map((element) => element.getAttribute('aria-label') || element.textContent?.trim() || element.tagName);

    const obstructed = controls
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const centerX = Math.max(0, Math.min(viewportWidth - 1, rect.left + rect.width / 2));
        const centerY = rect.top + rect.height / 2;
        // Practice now has bounded, independently scrolling panels. A control
        // outside its panel viewport must be reachable by scrolling that panel,
        // rather than being treated as an overlapping on-screen control.
        if (window.location.pathname === '/practice' && element.closest('.practice-panels')) {
          for (let parent = element.parentElement; parent?.closest('.practice-panels'); parent = parent.parentElement) {
            const bounds = parent.getBoundingClientRect();
            const style = getComputedStyle(parent);
            if (/auto|scroll/.test(style.overflowY) && (centerY < bounds.top || centerY >= bounds.bottom)) {
              const index = allControls.indexOf(element);
              element.dataset.layoutControlIndex = String(index);
              insideWorkspaceScroll.push(index);
              return false;
            }
          }
        }
        if (centerY < 0 || centerY >= window.innerHeight) return false;
        const topElement = document.elementFromPoint(centerX, centerY);
        // Persistent navigation clips the scrolling content viewport. Verify
        // covered controls can be scrolled into view and used below.
        if (mobileNavigation?.contains(topElement) && !mobileNavigation.contains(element)) {
          underMobileNavigation.push(allControls.indexOf(element));
          return false;
        }
        return topElement !== element && !element.contains(topElement);
      })
      .map((element) => element.getAttribute('aria-label') || element.textContent?.trim() || element.tagName);

    return {
      horizontalOverflow: document.documentElement.scrollWidth - viewportWidth,
      outsideViewport,
      obstructed,
      underMobileNavigation,
      insideWorkspaceScroll,
      workspaceScrollPositions,
      scrollY: window.scrollY,
    };
  });

  expect(report.horizontalOverflow).toBeLessThanOrEqual(1);
  expect(report.outsideViewport).toEqual([]);
  expect(report.obstructed).toEqual([]);
  for (const index of report.underMobileNavigation) {
    const control = page.locator('a[href], button, input, select, textarea').nth(index);
    await control.evaluate(element => element.scrollIntoView({ block: 'center' }));
    await control.click({ trial: true });
  }
  for (const index of report.insideWorkspaceScroll) {
    const control = page.locator(`[data-layout-control-index="${index}"]`);
    await control.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
    if (await control.isEnabled()) await control.click({ trial: true });
    else {
      expect(await control.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        const top = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
        return top === element || element.contains(top);
      }), 'Disabled workspace controls must still be visible without overlap').toBe(true);
    }
  }
  await page.evaluate(positions => {
    for (const { index, top, left } of positions) {
      const element = document.querySelector<HTMLElement>(`[data-layout-scroll-index="${index}"]`);
      if (element) element.scrollTo({ top, left });
    }
  }, report.workspaceScrollPositions);
  if (report.underMobileNavigation.length) await page.evaluate(y => window.scrollTo(0, y), report.scrollY);
}

for (const viewport of [
  { name: 'narrow-phone', width: 320, height: 568 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
] as const) {
  test(`all pages have usable routing without overlap on ${viewport.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);

    for (const route of pageRoutes) {
      const response = await page.goto(route);
      expect(response?.status(), `${route} should load`).toBeLessThan(400);

      const menu = page.getByRole('button', { name: 'Menu', exact: true });
      const hasMobileMenu = await menu.isVisible();
      if (hasMobileMenu) {
        await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible();
        await menu.click();
        await expect(page.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true');
      }
      const navigation = page.getByRole('navigation', { name: 'Primary navigation' });
      await expect(navigation, `${route} should expose navigation`).toBeVisible();
      await expect(navigation.locator('a[href="/"]')).toBeVisible();
      await expect(navigation.locator('a[href="/practice"]')).toBeVisible();

      if (hasMobileMenu) await page.getByRole('button', { name: 'Close menu' }).click();

      if (route === '/practice') await expect(page.locator('.code-editor-frame[data-editor-ready="true"]').first()).toBeVisible();
      await expectCleanLayout(page);
      if (route === '/' || route === '/practice') {
        await page.screenshot({ path: testInfo.outputPath(`${route === '/' ? 'landing' : 'practice'}-${viewport.name}.png`), fullPage: true });
      }
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await expectCleanLayout(page);
    }
  });
}

test('mobile navigation and skip link work with a keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/learn');

  const skipLink = page.getByRole('link', { name: 'Skip to content' });
  await page.keyboard.press('Tab');
  await expect(skipLink).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#page-content')).toBeFocused();

  await page.reload();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Method' }).first()).toBeFocused();
  await page.keyboard.press('Tab');

  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  await expect(menu).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true');

  await page.keyboard.press('Tab');
  const homeLink = page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Home' });
  await expect(homeLink).toBeFocused();
  await Promise.all([
    page.waitForURL(/\/$/),
    page.keyboard.press('Enter'),
  ]);
});

test('instructors can discover signup and previews stay unavailable in production', async ({ page }) => {
  await page.goto('/teach');
  await expect(page).toHaveURL(/\/auth\?next=%2Fteach$/);
  await expect(page.getByRole('combobox', { name: 'I’m here to' })).toHaveValue('instructor');
  await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
  for (const path of ['/admin-preview', '/admin-preview/classes']) {
    expect((await page.goto(path))?.status()).toBe(404);
  }
});

for (const mobile of [false, true]) {
  test(`navigation keeps the document and restores a practice draft on ${mobile ? 'phone' : 'desktop'}`, async ({ page }) => {
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
    await page.route('**/api/practice/owner', route => route.fulfill({ json: { owner: { kind: 'guest', id: 'navigation-guest' } } }));
    await page.route('**/api/viewer', route => route.fulfill({ json: { viewer: null } }));
    // A navigation must preserve a device draft even while server saves are unavailable.
    await page.route('**/api/practice/sessions**', route => route.fulfill({ status: 503, json: { error: 'offline for navigation regression' } }));
    await openHydratedNavigation(page, '/learn');
    await page.evaluate(() => { document.documentElement.dataset.navigationSentinel = 'same-document'; });
    const documentRequests: string[] = [];
    page.on('request', request => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentRequests.push(request.url()); });

    const navigation = page.getByRole('navigation', { name: mobile ? 'Mobile navigation' : 'Primary navigation', exact: true });
    await navigation.getByRole('link', { name: 'Practice', exact: true }).click();
    await expect(page).toHaveURL(/\/practice$/);
    await expect(page.getByRole('heading', { level: 1, name: defaultPracticeItem.problem.title })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-navigation-sentinel', 'same-document');

    const draft = 'Remember each number and check its complement before adding it.';
    const editor = page.locator('[data-editor-ready="true"]').getByRole('textbox', { name: 'Pseudocode draft', exact: true });
    await expect(editor).toBeVisible();
    await editor.fill(draft);
    const cacheKey = `method:guest:navigation-guest:${defaultPracticeItem.id}:workspace-v2`;
    await expect.poll(() => page.evaluate(key => {
      const cached = localStorage.getItem(key);
      return cached ? JSON.parse(cached).state.draft : null;
    }, cacheKey)).toBe(draft);

    await page.getByRole('link', { name: 'Questions', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Question roadmap', exact: true })).toBeVisible();
    if (mobile) await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await page.getByRole('navigation', { name: 'Primary navigation', exact: true }).getByRole('link', { name: 'Practice', exact: true }).click();
    await expect(page).toHaveURL(/\/practice$/);
    await expect(editor).toBeVisible();
    await expect.poll(() => editor.locator('.cm-line').evaluateAll(lines => lines.map(line => line.textContent ?? '').join('\n'))).toBe(draft);
    await expect(page.locator('html')).toHaveAttribute('data-navigation-sentinel', 'same-document');
    expect(documentRequests).toEqual([]);
  });
}

test('home practice entry and browser history keep client navigation', async ({ page }) => {
  await page.route('**/api/practice/owner', route => route.fulfill({ json: { owner: { kind: 'guest', id: 'navigation-home' } } }));
  await openHydratedNavigation(page, '/');
  await page.evaluate(() => { document.documentElement.dataset.navigationSentinel = 'home-document'; });
  await page.getByRole('link', { name: 'Start a practice session', exact: false }).click();
  await expect(page.getByRole('heading', { level: 1, name: defaultPracticeItem.problem.title })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-navigation-sentinel', 'home-document');
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Good code starts');
  await expect(page.locator('html')).toHaveAttribute('data-navigation-sentinel', 'home-document');
  await page.goForward();
  await expect(page).toHaveURL(/\/practice/);
  await expect(page.getByRole('heading', { level: 1, name: defaultPracticeItem.problem.title })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-navigation-sentinel', 'home-document');
});

test('the retained shell refreshes sign-in identity and ignores an earlier account response', async ({ page }) => {
  const firstViewer = { id: 'navigation-first', email: 'first@example.invalid', displayName: 'First learner', canAccessAdministration: false };
  const nextViewer = { id: 'navigation-next', email: 'next@example.invalid', displayName: 'Next learner', canAccessAdministration: false };
  let viewer: typeof firstViewer | null = null;
  let delayNext = false;
  let started!: () => void;
  const delayedStarted = new Promise<void>(resolve => { started = resolve; });
  let release!: () => void;
  const delayedReply = new Promise<void>(resolve => { release = resolve; });
  let finished!: () => void;
  const delayedFinished = new Promise<void>(resolve => { finished = resolve; });
  await page.route('**/api/viewer', async route => {
    const snapshot = viewer;
    if (delayNext) {
      delayNext = false;
      started();
      await delayedReply;
      await route.fulfill({ json: { viewer: snapshot } });
      finished();
      return;
    }
    await route.fulfill({ json: { viewer: snapshot } });
  });
  await openHydratedNavigation(page, '/learn');
  await expect(page.locator('.shell-identity')).toContainText('Guest learner');
  await page.evaluate(() => { document.documentElement.dataset.navigationSentinel = 'identity-document'; });

  // Server-action sign-in changes cookies before navigating, while the layout stays mounted.
  viewer = firstViewer;
  await page.getByRole('navigation', { name: 'Primary navigation', exact: true }).getByRole('link', { name: 'Dashboard', exact: true }).click();
  await expect(page.locator('.shell-identity')).toContainText('First learner');
  await expect(page.locator('html')).toHaveAttribute('data-navigation-sentinel', 'identity-document');

  delayNext = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await delayedStarted;
  await expect(page.locator('.shell-identity')).toContainText('First learner');
  viewer = nextViewer;
  await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'sb-navigation-auth-token' })));
  await expect(page.locator('.shell-identity')).toContainText('Next learner');
  release();
  await delayedFinished;
  await expect(page.locator('.shell-identity')).toContainText('Next learner');
  await expect(page.locator('.shell-identity')).not.toContainText('First learner');

  viewer = null;
  await page.evaluate(() => window.dispatchEvent(new Event('practice-owner-changed')));
  await expect(page.locator('.shell-identity')).toContainText('Guest learner');
  await expect(page.locator('html')).toHaveAttribute('data-navigation-sentinel', 'identity-document');
});

test('guest can browse both question tracks and save a system-design analysis', async ({ page }) => {
  await page.goto('/roadmap');
  await expect(page.getByRole('heading', { name: 'Question roadmap' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Pair with target/ })).toBeVisible();

  await page.getByRole('button', { name: 'System design' }).click();
  await expect(page.getByRole('button', { name: /Scope a short-link service/ })).toBeVisible();
  await page.getByRole('button', { name: /Scope a short-link service/ }).click();
  await page.getByLabel('1. Describe your architecture').fill('Create and shorten links through an API, then redirect each read through a durable mapping store. Set explicit latency and availability goals.');
  await page.getByLabel('2. Handle a failure or abuse case').fill('Reject an invalid or expired link and prevent abuse or key collisions.');
  await page.getByLabel('3. Quantify scale and a tradeoff').fill('Plan for 10 million links with a 100 to 1 read to write ratio.');
  await page.getByRole('button', { name: 'Check my analysis' }).click();
  await expect(page.getByRole('heading', { name: 'Analysis complete' })).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'System design' }).click();
  await expect(page.getByRole('button', { name: /Scope a short-link service[\s\S]*Analysis complete/ })).toBeVisible();
});
