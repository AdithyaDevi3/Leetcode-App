import { expect, test, type Page } from '@playwright/test';

const pageRoutes = [
  '/',
  '/admin',
  '/auth',
  '/dashboard',
  '/history',
  '/learn',
  '/library',
  '/offline',
  '/onboarding',
  '/practice',
  '/requests',
  '/settings',
  '/system-design',
] as const;

test('signed-out visitors are redirected away from administration', async ({ page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/auth\?next=%2Fadmin$/);
  await expect(page.getByRole('heading', { name: 'Save your progress' })).toBeVisible();
});

async function expectCleanLayout(page: Page) {
  const report = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const controls = Array.from(document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea'))
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
        return topElement !== element && !element.contains(topElement);
      })
      .map((element) => element.getAttribute('aria-label') || element.textContent?.trim() || element.tagName);

    return {
      horizontalOverflow: document.documentElement.scrollWidth - viewportWidth,
      outsideViewport,
      obstructed,
    };
  });

  expect(report.horizontalOverflow).toBeLessThanOrEqual(1);
  expect(report.outsideViewport).toEqual([]);
  expect(report.obstructed).toEqual([]);
}

for (const viewport of [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
] as const) {
  test(`all pages have usable routing without overlap on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);

    for (const route of pageRoutes) {
      const response = await page.goto(route);
      expect(response?.status(), `${route} should load`).toBeLessThan(400);

      const navigation = route === '/practice' && viewport.name === 'phone'
        ? page.getByRole('navigation', { name: 'Mobile navigation' })
        : page.getByRole('navigation', { name: 'Primary navigation' });
      await expect(navigation, `${route} should expose navigation`).toBeVisible();
      await expect(navigation.locator('a[href="/"]')).toBeVisible();
      await expect(navigation.locator('a[href="/practice"]')).toBeVisible();

      await expectCleanLayout(page);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await expectCleanLayout(page);
    }
  });
}

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
