import { expect, test } from '@playwright/test';

test('guest can open the workspace and autosave a draft locally', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Think in complements' })).toBeVisible();
  await expect(page.getByLabel('Pseudocode draft')).toBeVisible();

  await page.getByLabel('Pseudocode draft').fill('Create a map.\nCheck the complement.');

  await expect(page.getByText('Saved locally')).toBeVisible();

  const sessionValue = await page.evaluate(() => {
    const key = 'method:pair-with-target-v1:session';
    return window.localStorage.getItem(key);
  });

  expect(sessionValue).toContain('Create a map.');
  expect(sessionValue).toContain('Check the complement.');
});