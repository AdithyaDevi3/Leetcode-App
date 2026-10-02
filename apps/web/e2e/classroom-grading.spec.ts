import { expect, test, type Page } from '@playwright/test';

const fixturePath = '/test-support/classroom-grading';

async function expectNoPageOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
}

test('instructor saves and publishes a private rubric draft', async ({ page }) => {
  const draftRequests: unknown[] = [];
  await page.route('**/api/instructor/submissions/*/draft-grade', async route => {
    draftRequests.push(await route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ grade: { id: '33333333-3333-4333-8333-333333333333', sequence: 1, earnedUnits: 850, kind: 'scored', attemptId: '22222222-2222-4222-8222-222222222222', criterionScores: { reasoning: 500, complexity: 350 }, learnerFeedback: 'Clear reasoning with the right complexity.', privateNote: 'Check the explanation wording.', createdAt: '2026-10-01T14:00:00.000Z' } }) });
  });
  await page.route('**/api/instructor/submissions/*/grades/*/publications', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ publication: { id: '99999999-9999-4999-8999-999999999999', sequence: 1 } }) });
  });

  await page.goto(fixturePath);
  await page.getByLabel('Reasoning').fill('5');
  await page.getByLabel('Complexity').fill('3.5');
  await page.getByLabel('Feedback for learner').fill('Clear reasoning with the right complexity.');
  await page.getByLabel('Private instructor notes').fill('Check the explanation wording.');
  await page.getByRole('button', { name: 'Save draft' }).click();

  await expect(page.getByText('Draft saved. Learners cannot see it until you publish.')).toBeVisible();
  expect(draftRequests).toHaveLength(1);
  expect(draftRequests[0]).toMatchObject({ criterionScores: { reasoning: 500, complexity: 350 }, expectedGradeRevisionId: null });

  await page.getByRole('button', { name: 'Publish grade' }).click();
  await expect(page.getByText('Grade published to the learner.')).toBeVisible();
});

test('instructor sees an optimistic conflict without losing entered feedback', async ({ page }) => {
  await page.route('**/api/instructor/submissions/*/draft-grade', route => route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'The grade changed. Refresh and try again.' }) }));
  await page.goto(fixturePath);
  await page.getByLabel('Reasoning').fill('5');
  await page.getByLabel('Complexity').fill('3');
  await page.getByLabel('Feedback for learner').fill('Keep this feedback after the conflict.');
  await page.getByRole('button', { name: 'Save draft' }).click();

  await expect(page.getByText('The grade changed. Refresh and try again.')).toBeVisible();
  await expect(page.getByLabel('Feedback for learner')).toHaveValue('Keep this feedback after the conflict.');
});

test('learner reviews the published grade and requests a review accessibly on phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/learner/assignments/*/grade-disputes', route => route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ dispute: { status: 'submitted' } }) }));
  await page.goto(`${fixturePath}?view=learner`);

  await expect(page.getByRole('heading', { level: 1, name: 'Algorithms Studio' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Published grade summary' })).toContainText('8.5 / 10');
  await expect(page.getByText('Clear map-based reasoning. Make the space tradeoff explicit.')).toBeVisible();
  await expect(page.getByText('Check the explanation wording.')).toHaveCount(0);
  await page.getByLabel('What should your instructor review?').fill('Please review the complexity score against the published rubric feedback.');
  await page.getByRole('button', { name: 'Request grade review' }).click();
  await expect(page.getByRole('status')).toHaveText('Your grade review request was sent.');
  await expectNoPageOverflow(page);
});
