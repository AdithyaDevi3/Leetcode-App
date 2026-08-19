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

test('guest can use the guided start and pass the reasoning check', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Use guided start' }).click();
  await page.getByRole('button', { name: 'Evaluate reasoning' }).click();

  await expect(page.getByText('Implementation unlocked')).toBeVisible();
  await expect(page.getByRole('button', { name: /Check translation/i })).toBeEnabled();

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

  await page.getByRole('button', { name: /Check translation/i }).click();

  await expect(page.getByText('Saved to your local progress.')).toBeVisible();
});

test('guest draft resumes after reload', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('Pseudocode draft').fill('Create a map.\nStore values as you go.');
  await expect(page.getByText('Saved locally')).toBeVisible();

  await page.reload();

  await expect(page.getByLabel('Pseudocode draft')).toHaveValue('Create a map.\nStore values as you go.');
  await expect(page.getByText('Restored locally')).toBeVisible();
});