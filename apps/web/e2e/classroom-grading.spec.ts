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
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ publication: { id: '99999999-9999-4999-8999-999999999999', sequence: 1, gradeRevisionId: '33333333-3333-4333-8333-333333333333', publishedAt: '2026-10-01T14:00:00.000Z' } }) });
  });

  await page.goto(fixturePath);
  await expect(page.getByText('python · Attempt 1')).toBeVisible();
  await expect(page.getByText('Scan once while storing each value in a map. Return when the complement has already been seen.')).toBeVisible();
  await expect(page.getByText('awaiting review')).toBeVisible();
  await expect(page.getByText('Is the solution’s approach appropriate, well-reasoned, and explained clearly enough to follow?')).toBeVisible();
  await expect(page.getByText('The analysis is accurate and the relevant tradeoff is explained.')).toBeVisible();
  await expect(page.getByText('Tie feedback to evidence in the submission. This is shared with the learner when you publish.')).toBeVisible();
  await page.getByLabel('Reasoning').fill('5');
  await page.getByLabel('Complexity').fill('3.5');
  await page.getByLabel('Feedback for learner').fill('Clear reasoning with the right complexity.');
  await page.getByLabel('Private instructor notes').fill('Check the explanation wording.');
  await page.getByRole('button', { name: 'Save draft' }).click();

  await expect(page.getByText('Draft saved. Learners cannot see it until you publish.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save draft' })).toBeDisabled();
  expect(draftRequests).toHaveLength(1);
  expect(draftRequests[0]).toMatchObject({ criterionScores: { reasoning: 500, complexity: 350 }, expectedGradeRevisionId: null });

  await page.getByRole('button', { name: 'Publish grade' }).click();
  await expect(page.getByText('Grade published to the learner.')).toBeVisible();
  await expect(page.getByText('published', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publish grade' })).toBeDisabled();
});

test('instructor must save changed scores and can publish a correction without refreshing', async ({ page }) => {
  const draftRequests: Record<string, unknown>[] = [];
  const publicationRequests: Record<string, unknown>[] = [];
  await page.route('**/api/instructor/submissions/*/draft-grade', async route => {
    const body = route.request().postDataJSON();
    draftRequests.push(body);
    await route.fulfill({ json: { grade: {
      id: `grade-${draftRequests.length}`, sequence: draftRequests.length,
      attemptId: '22222222-2222-4222-8222-222222222222', kind: 'scored', earnedUnits: 800,
      criterionScores: body.criterionScores, learnerFeedback: body.learnerFeedback, privateNote: body.privateNote,
      createdAt: '2026-10-01T14:00:00.000Z',
    } } });
  });
  await page.route('**/api/instructor/submissions/*/grades/*/publications', async route => {
    publicationRequests.push(route.request().postDataJSON());
    await route.fulfill({ json: { publication: {
      id: `publication-${publicationRequests.length}`, sequence: publicationRequests.length,
      gradeRevisionId: route.request().url().split('/grades/')[1].split('/')[0], publishedAt: '2026-10-01T14:00:00.000Z',
    } } });
  });
  await page.goto(fixturePath);
  await page.getByLabel('Reasoning').fill('5');
  await page.getByLabel('Complexity').fill('3');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('button', { name: 'Publish grade' })).toBeEnabled();
  await page.getByLabel('Complexity').fill('4');
  await expect(page.getByRole('button', { name: 'Publish grade' })).toBeDisabled();
  await expect(page.getByText('Unsaved changes. Save draft before publishing.')).toBeVisible();
  await page.getByLabel('Complexity').fill('3');
  await page.getByRole('button', { name: 'Publish grade' }).click();
  await expect(page.getByText('published', { exact: true })).toBeVisible();
  await page.getByLabel('Feedback for learner').fill('Corrected feedback after review.');
  await expect(page.getByText('Grade published to the learner.')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Publish grade' })).toBeDisabled();
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('button', { name: 'Publish grade' })).toBeEnabled();
  await page.getByRole('button', { name: 'Publish grade' }).click();
  await expect(page.getByText('published', { exact: true })).toBeVisible();
  expect(draftRequests[1]).toMatchObject({ expectedGradeRevisionId: 'grade-1' });
  expect(publicationRequests.map(request => request.expectedPublicationSequence)).toEqual([0, 1]);
});

test('instructor retries a lost save and publication response with the same request keys', async ({ page }) => {
  const draftRequests: Record<string, unknown>[] = [];
  const publicationRequests: Record<string, unknown>[] = [];
  await page.route('**/api/instructor/submissions/*/draft-grade', async route => {
    const body = route.request().postDataJSON();
    draftRequests.push(body);
    if (draftRequests.length === 1) { await route.abort('failed'); return; }
    await route.fulfill({ json: { grade: {
      id: 'grade-retry', sequence: 1, attemptId: '22222222-2222-4222-8222-222222222222', kind: 'scored',
      earnedUnits: 800, criterionScores: body.criterionScores, learnerFeedback: body.learnerFeedback,
      privateNote: body.privateNote, createdAt: '2026-10-01T14:00:00.000Z',
    } } });
  });
  await page.route('**/api/instructor/submissions/*/grades/*/publications', async route => {
    publicationRequests.push(route.request().postDataJSON());
    if (publicationRequests.length === 1) { await route.abort('failed'); return; }
    await route.fulfill({ json: { publication: { id: 'publication-retry', sequence: 1, gradeRevisionId: 'grade-retry', publishedAt: '2026-10-01T14:00:00.000Z' } } });
  });
  await page.goto(fixturePath);
  await page.getByLabel('Reasoning').fill('5');
  await page.getByLabel('Complexity').fill('3');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('button', { name: 'Save draft' })).toBeEnabled();
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('button', { name: 'Publish grade' })).toBeEnabled();
  expect(draftRequests).toHaveLength(2);
  expect(draftRequests[1]).toEqual(draftRequests[0]);
  await page.getByRole('button', { name: 'Publish grade' }).click();
  await expect(page.getByRole('button', { name: 'Publish grade' })).toBeEnabled();
  await page.getByRole('button', { name: 'Publish grade' }).click();
  await expect(page.getByText('published', { exact: true })).toBeVisible();
  expect(publicationRequests).toHaveLength(2);
  expect(publicationRequests[1]).toEqual(publicationRequests[0]);
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

test('instructor filters, sorts, and exports the class gradebook', async ({ page }) => {
  await page.goto(`${fixturePath}?view=gradebook`);

  await expect(page.getByText('Showing 3 of 3 learners')).toBeVisible();
  await page.getByLabel('Find a learner').fill('sample');
  await expect(page.getByText('Showing 1 of 3 learners')).toBeVisible();
  await expect(page.getByRole('rowheader', { name: /Sample Learner/ })).toBeVisible();
  await expect(page.getByRole('rowheader', { name: /Avery Ranked/ })).toHaveCount(0);

  await page.getByLabel('Find a learner').fill('');
  await page.getByLabel('Show').selectOption('ranked');
  await expect(page.getByRole('rowheader', { name: /Avery Ranked/ })).toBeVisible();
  await expect(page.getByRole('rowheader', { name: /Sample Learner/ })).toHaveCount(0);

  await page.getByLabel('Show').selectOption('all');
  await page.getByLabel('Sort by').selectOption('total_desc');
  const names = await page.getByRole('rowheader').allTextContents();
  expect(names[0]).toContain('Avery Ranked');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download current view' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('algorithms-studio-gradebook.csv');
});
