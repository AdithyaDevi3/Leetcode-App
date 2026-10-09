import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const criticalRoutes = ['/', '/auth', '/practice', '/roadmap'] as const;
const viewports = [
  { name: 'narrow-phone', width: 320, height: 568 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

for (const viewport of viewports) {
  for (const route of criticalRoutes) {
    test(`${route} has no automated WCAG A/AA violations on ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const response = await page.goto(route);
      expect(response?.status()).toBeLessThan(400);
      await page.waitForLoadState('networkidle');

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const violations = results.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        targets: violation.nodes.flatMap((node) => node.target),
      }));

      expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
    });
  }
}
