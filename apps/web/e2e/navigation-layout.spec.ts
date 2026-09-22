import { expect, test, type Page } from '@playwright/test';

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
  if (report.underMobileNavigation.length) await page.evaluate(y => window.scrollTo(0, y), report.scrollY);
}

for (const viewport of [
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

      await expectCleanLayout(page);
      if (route === '/' || route === '/practice') {
        await page.screenshot({ path: testInfo.outputPath(`${route === '/' ? 'landing' : 'practice'}-${viewport.name}.png`), fullPage: true });
      }
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await expectCleanLayout(page);
    }
  });
}

test('instructors can discover signup and previews stay unavailable in production', async ({ page }) => {
  await page.goto('/teach');
  await expect(page).toHaveURL(/\/auth\?next=%2Fteach$/);
  await expect(page.getByRole('combobox', { name: 'I’m here to' })).toHaveValue('instructor');
  await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
  for (const path of ['/admin-preview', '/admin-preview/classes']) {
    expect((await page.goto(path))?.status()).toBe(404);
  }
});

test('shared navigation performs a reliable document navigation', async ({ page }) => {
  await page.goto('/learn');
  await page.evaluate(() => {
    document.documentElement.dataset.navigationSentinel = 'old-document';
  });

  const navigation = page.waitForEvent('framenavigated');
  await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Practice' }).click();
  await navigation;

  await expect(page).toHaveURL(/\/practice$/);
  await expect(page.locator('html')).not.toHaveAttribute('data-navigation-sentinel');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Remember what you have seen' }),
  ).toBeVisible();
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
