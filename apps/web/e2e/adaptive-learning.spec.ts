import { expect, test, type Page } from '@playwright/test';
import type { LearningApiResponse, LearningRecommendationReceipt, LearningRecommendationRequest, LearningReviewReceipt, LearningReviewRequest } from '../src/lib/learning-api-types';

const fixture = '/test-support/adaptive-learning';
const first = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';
const cacheKey = `method:learning-review:${first}`;
const selectionCacheKey = `method:learning-selection:${first}`;
const generatedAt = '2026-10-27T12:00:00.000Z';
const profile = { goal: 'coursework', experience: 'new', weeklyMinutes: 180, preferredLanguage: 'python', timezone: 'UTC', diagnosticOptIn: false, personalizationOptOut: false };

function learning(learnerId = first, kind: 'mixed' | 'initial' | 'disabled' = 'mixed'): LearningApiResponse {
  return {
    learnerId,
    snapshot: {
      algorithmVersion: 'learning-evidence-v1', generatedAt, optOut: kind === 'disabled',
      concepts: kind === 'initial' ? [] : [
        { conceptId: 'hash-maps', score: 42, confidence: 0.2, uncertainty: { lower: 20, upper: 65 }, evidenceStatus: 'limited', independentItems: 1, lastEvidenceAt: '2026-10-25T12:00:00.000Z', reviewDueAt: '2026-10-26T12:00:00.000Z', reviewRevision: 3 },
        { conceptId: 'tree-traversal', score: 88, confidence: 0.78, uncertainty: { lower: 76, upper: 95 }, evidenceStatus: 'established', independentItems: 10, lastEvidenceAt: '2026-10-24T12:00:00.000Z', reviewDueAt: '2026-10-31T12:00:00.000Z', reviewRevision: 2 },
      ],
      recentActivityIds: [], sourceSummary: kind === 'initial' ? { releasedQuizItems: 0, verifiedPracticeItems: 0, independentItems: 0 } : { releasedQuizItems: 9, verifiedPracticeItems: 2, independentItems: 11 },
      processing: { pending: false, processedSources: 0, remainingSources: 0 },
    },
    plan: {
      algorithmVersion: 'learning-evidence-v1', status: kind === 'disabled' ? 'disabled' : 'ready',
      recommendations: kind === 'disabled' ? [] : [
        { practiceId: 'pair-with-target-v1', label: 'Pair With Target', conceptIds: ['hash-maps'], difficulty: 'foundation', estimatedMinutes: 20, reason: kind === 'initial' ? 'Build initial evidence for hash maps with a diagnostic activity.' : 'Build hash maps with targeted practice. This estimate uses one independent item and can change.', reasonKind: kind === 'initial' ? 'diagnostic' : 'recovery', evidenceStatus: kind === 'initial' ? 'unknown' : 'limited' },
        { practiceId: 'max-window-sum-v1', label: 'Max Window Sum', conceptIds: ['sliding-window'], difficulty: 'intermediate', estimatedMinutes: 25, reason: 'Explore an unknown concept with another practice activity.', reasonKind: 'diagnostic', evidenceStatus: 'unknown' },
        { practiceId: 'tree-max-depth-v1', label: 'Tree Max Depth', conceptIds: ['tree-traversal'], difficulty: 'foundation', estimatedMinutes: 20, reason: 'Broaden the evidence for tree traversal in a different situation.', reasonKind: kind === 'initial' ? 'diagnostic' : 'broaden', evidenceStatus: kind === 'initial' ? 'unknown' : 'established' },
      ],
    },
  };
}

function model() {
  return { accounts: new Map([[first, learning()], [second, learning(second, 'initial')]]), requests: [] as LearningReviewRequest[], receipts: new Map<string, LearningReviewReceipt>(), failReply: false };
}
type Model = ReturnType<typeof model>;

async function connect(page: Page, state: Model) {
  await page.route('**/api/learner/learning', async route => {
    const owner = route.request().headers()['x-learning-owner'];
    expect([first, second]).toContain(owner);
    await route.fulfill({ json: state.accounts.get(owner)! });
  });
  await page.route('**/api/learner/learning/reviews', async route => {
    const owner = route.request().headers()['x-learning-owner'];
    expect([first, second]).toContain(owner);
    const request = route.request().postDataJSON() as LearningReviewRequest;
    state.requests.push(request);
    expect(Object.keys(request).sort()).toEqual(['conceptId', 'days', 'expectedRevision', 'requestKey']);
    let receipt = state.receipts.get(request.requestKey);
    const account = state.accounts.get(owner)!;
    if (!receipt) {
      const concept = account.snapshot.concepts.find(item => item.conceptId === request.conceptId)!;
      if (concept.reviewRevision !== request.expectedRevision) {
        await route.fulfill({ status: 409, json: { code: 'review_conflict', error: 'The saved review schedule changed on another device.' } });
        return;
      }
      receipt = { conceptId: request.conceptId, requestKey: request.requestKey, previousRevision: request.expectedRevision, revision: request.expectedRevision + 1, dueAt: '2026-10-28T12:00:00.000Z' };
      concept.reviewRevision = receipt.revision;
      concept.reviewDueAt = receipt.dueAt;
      state.receipts.set(request.requestKey, receipt);
    }
    if (state.failReply) { state.failReply = false; await route.abort('failed'); return; }
    await route.fulfill({ json: { ...account, reviewReceipt: receipt } });
  });
}

async function connectSelections(page: Page, state: Model) {
  state.accounts.get(first)!.decisionKey = 'a'.repeat(64);
  const selections = { requests: [] as LearningRecommendationRequest[], receipts: new Map<string, LearningRecommendationReceipt>(),
    reply: 'ok' as 'ok' | 'lost' | 'missing' | 'mismatch' | 'owner' | 'foreign' | 'stale' };
  await connect(page, state);
  await page.route('**/practice?problem=*', route => route.fulfill({ contentType: 'text/html', body: '<h1>Practice destination</h1>' }));
  await page.route('**/api/learner/learning/recommendations', async route => {
    const owner = route.request().headers()['x-learning-owner'];
    expect(owner).toBe(first);
    const request = route.request().postDataJSON() as LearningRecommendationRequest;
    expect(Object.keys(request).sort()).toEqual(['expectedDecisionKey', 'practiceId', 'requestKey']);
    selections.requests.push(request);
    if (selections.reply === 'owner') {
      await route.fulfill({ status: 409, json: { code: 'owner_changed', error: 'Your signed-in account changed.' } }); return;
    }
    if (selections.reply === 'stale') {
      selections.reply = 'ok'; state.accounts.get(first)!.decisionKey = 'b'.repeat(64);
      await route.fulfill({ status: 409, json: { code: 'recommendation_conflict', error: 'Your recommended practice changed. Load the latest plan.' } }); return;
    }
    let receipt = selections.receipts.get(request.requestKey);
    if (!receipt) {
      receipt = { requestKey: request.requestKey, decisionKey: request.expectedDecisionKey, practiceId: request.practiceId,
        selectionId: '33333333-3333-4333-8333-333333333333', selectedAt: '2026-10-29T12:00:00.000Z' };
      selections.receipts.set(request.requestKey, receipt);
    }
    const reply = selections.reply; selections.reply = 'ok';
    if (reply === 'lost') { await route.abort('failed'); return; }
    await route.fulfill({ json: { learnerId: reply === 'foreign' ? second : first, ...(reply === 'missing' ? {} : { receipt: reply === 'mismatch' ? { ...receipt, requestKey: 'wrong-key' } : receipt }) } });
  });
  return selections;
}

test('recommendation viewing and plan refresh do not record choices; an explicit start confirms its receipt before navigation', async ({ page }) => {
  const state = model(); const selections = await connectSelections(page, state);
  await page.goto(fixture);
  await expect(page.getByRole('link', { name: 'Open skills check', exact: true })).toHaveAttribute('href', '/diagnostic');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Refresh plan', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Recommended algorithms', exact: true })).toBeVisible();
  expect(selections.requests).toHaveLength(0);
  await page.getByRole('link', { name: 'Start Pair With Target', exact: true }).click();
  await expect(page).toHaveURL(/\/practice\?problem=pair-with-target-v1$/);
  expect(selections.requests).toHaveLength(1); expect(selections.receipts.size).toBe(1);
  expect(selections.requests[0]).toMatchObject({ practiceId: 'pair-with-target-v1', expectedDecisionKey: 'a'.repeat(64) });
  expect(await page.evaluate(key => sessionStorage.getItem(key), selectionCacheKey)).toBeNull();
});

test('an accepted recommendation with a lost reply resumes the exact command after reload', async ({ page }) => {
  const state = model(); const selections = await connectSelections(page, state); selections.reply = 'lost';
  await page.goto(fixture); await page.getByRole('link', { name: 'Start Pair With Target', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'Practice selection error' })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(fixture + '$'));
  const original = selections.requests[0];
  expect(await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)!), selectionCacheKey)).toEqual(original);
  await page.reload();
  await expect(page.getByRole('link', { name: 'Open practice without confirming selection' })).toHaveAttribute('href', '/practice?problem=pair-with-target-v1');
  await page.getByRole('button', { name: 'Retry practice selection' }).click();
  await expect(page).toHaveURL(/\/practice\?problem=pair-with-target-v1$/);
  expect(selections.requests).toEqual([original, original]); expect(selections.receipts.size).toBe(1);
  expect(await page.evaluate(key => sessionStorage.getItem(key), selectionCacheKey)).toBeNull();
});

for (const reply of ['missing', 'mismatch'] as const) {
  test(`${reply} recommendation receipts preserve a retry and cannot trigger navigation`, async ({ page }) => {
    const state = model(); const selections = await connectSelections(page, state); selections.reply = reply;
    await page.goto(fixture); await page.getByRole('link', { name: 'Start Pair With Target', exact: true }).click();
    await expect(page.getByRole('alert', { name: 'Practice selection error' })).toContainText('could not confirm');
    await expect(page).toHaveURL(new RegExp(fixture + '$'));
    await page.getByRole('button', { name: 'Retry practice selection' }).click();
    await expect(page).toHaveURL(/\/practice\?problem=pair-with-target-v1$/);
    expect(selections.requests[1]).toEqual(selections.requests[0]); expect(selections.receipts.size).toBe(1);
  });
}

test('a rejected stale recommendation requires a refreshed plan and records only its later accepted selection', async ({ page }) => {
  const state = model(); const selections = await connectSelections(page, state); selections.reply = 'stale';
  await page.goto(fixture); await page.getByRole('link', { name: 'Start Pair With Target', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'Practice selection error' })).toContainText('changed');
  await expect(page.getByRole('button', { name: 'Retry practice selection' })).toHaveCount(0);
  expect(await page.evaluate(key => sessionStorage.getItem(key), selectionCacheKey)).toBeNull();
  await page.getByRole('button', { name: 'Load latest practice plan' }).click();
  await expect(page.getByRole('heading', { name: 'Recommended algorithms', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Start Pair With Target', exact: true }).click();
  await expect(page).toHaveURL(/\/practice\?problem=pair-with-target-v1$/);
  expect(selections.requests[1].expectedDecisionKey).toBe('b'.repeat(64));
  expect(selections.requests[1].requestKey).not.toBe(selections.requests[0].requestKey);
  expect(selections.receipts.size).toBe(1);
});

for (const reply of ['owner', 'foreign'] as const) {
  test(`${reply} account response denies recommendation navigation and retains only the original owner recovery command`, async ({ page }) => {
    const state = model(); const selections = await connectSelections(page, state); selections.reply = reply;
    await page.goto(fixture); await page.getByRole('link', { name: 'Start Pair With Target', exact: true }).click();
    await expect(page.getByRole('alert', { name: 'Learning account changed' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Account practice recommendations' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Retry practice selection' })).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(fixture + '$'));
    expect(await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)!), selectionCacheKey)).toEqual(selections.requests[0]);
    expect(selections.receipts.size).toBe(reply === 'owner' ? 0 : 1);
  });
}

test('a delayed earlier-owner recommendation receipt cannot navigate another account or erase recovery', async ({ page }) => {
  const state = model(); await connectSelections(page, state);
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
  let original: LearningRecommendationRequest | null = null;
  await page.route('**/api/learner/learning/recommendations', async route => {
    original = route.request().postDataJSON() as LearningRecommendationRequest;
    await held;
    await route.fulfill({ json: { learnerId: first, receipt: { requestKey: original.requestKey, decisionKey: original.expectedDecisionKey,
      practiceId: original.practiceId, selectionId: '33333333-3333-4333-8333-333333333333', selectedAt: '2026-10-29T12:00:00.000Z' } } });
  });
  await page.goto(fixture); await page.getByRole('link', { name: 'Start Pair With Target', exact: true }).click();
  await page.getByRole('button', { name: 'Second sample account' }).click();
  await expect(page.getByText('No account evidence yet.', { exact: false })).toBeVisible();
  const response = page.waitForResponse(reply => reply.url().endsWith('/api/learner/learning/recommendations'));
  release(); await (await response).finished();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
  await expect(page).toHaveURL(new RegExp(fixture + '$'));
  expect(await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)!), selectionCacheKey)).toEqual(original);
  expect(await page.evaluate(key => sessionStorage.getItem(key), `method:learning-selection:${second}`)).toBeNull();
});

const capture = async (page: Page, name: string) => {
  if (process.env.METHOD_CAPTURE_UI === '1') {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `../../.local-docs/e4-${name}.png`, fullPage: true });
  }
};

test('first account practice is diagnostic and unknown evidence is never presented as a zero or weakness', async ({ page }) => {
  const state = model(); state.accounts.set(first, learning(first, 'initial')); await connect(page, state);
  await page.goto(fixture);
  await expect(page.getByText('No account evidence yet.', { exact: false })).toBeVisible();
  await expect(page.getByText('An unknown concept is not a weakness.', { exact: false })).toBeVisible();
  await expect(page.getByText('Older practice history may not contribute', { exact: false })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Concept estimates' })).toHaveCount(0);
  await expect(page.getByText('/100 estimate', { exact: false })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Start Pair With Target', exact: true })).toHaveAttribute('href', '/practice?problem=pair-with-target-v1');
  await page.getByText('Why this question?', { exact: true }).first().click();
  await expect(page.getByText('it does not label it a weakness.', { exact: false }).first()).toBeVisible();
  await capture(page, 'initial-desktop');
});

test('released results produce cautious concept estimates, explained recommendations, and due review links', async ({ page }) => {
  const state = model(); await connect(page, state); await page.goto(fixture);
  const concepts = page.getByRole('list', { name: 'Concept estimates' });
  await expect(concepts.getByRole('heading', { name: 'Hash Maps', exact: true })).toBeVisible();
  await expect(concepts.getByText('Limited evidence', { exact: true })).toBeVisible();
  await expect(concepts.getByText('Established evidence', { exact: true })).toBeVisible();
  await expect(concepts.getByText('42/100', { exact: false })).toBeVisible();
  await expect(concepts.getByText('88/100', { exact: false })).toBeVisible();
  await expect(concepts.getByText('Model range 20–65.', { exact: false })).toBeVisible();
  await expect(concepts.getByText('Too early for a firm conclusion.', { exact: false })).toBeVisible();
  await expect(page.getByText('% confidence', { exact: false })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '1 review due', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Review Hash Maps now', exact: true })).toHaveAttribute('href', '/practice?problem=pair-with-target-v1');
  await expect(page.getByLabel('Account evidence sources').getByText('11', { exact: true })).toBeVisible();
  await page.getByText('Why this question?', { exact: true }).first().click();
  await expect(page.getByText('This estimate uses one independent item', { exact: false })).toBeVisible();
  await capture(page, 'adaptive-desktop');
  await page.reload();
  await expect(concepts.getByText('42/100', { exact: false })).toBeVisible();
  expect(state.requests).toHaveLength(0);
});

test('unavailable account evidence never substitutes forged device scores and can reconnect', async ({ page }) => {
  const state = model(); await connect(page, state);
  let unavailable = true;
  await page.route('**/api/learner/learning', route => unavailable ? route.fulfill({ status: 503, json: { error: 'Account evidence is temporarily unavailable.' } }) : route.fulfill({ json: state.accounts.get(first) }));
  await page.addInitScript(() => localStorage.setItem('method:local-mastery:v1', JSON.stringify({ 'hash-maps': { conceptId: 'hash-maps', mastery: 0.01, confidence: 1, evidenceCount: 100, lastPracticedAt: '2026-10-27T12:00:00.000Z' } })));
  await page.goto(fixture);
  await expect(page.getByRole('alert', { name: 'Learning plan error' })).toContainText('temporarily unavailable');
  await expect(page.getByRole('list', { name: 'Concept estimates' })).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Account practice recommendations' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Explore question bank', exact: true })).toBeVisible();
  unavailable = false; await page.getByRole('button', { name: 'Retry account plan' }).click();
  await expect(page.getByRole('heading', { name: 'Practice with a clear purpose' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Concept estimates' }).getByText('42/100', { exact: false })).toBeVisible();
});

test('opt-out renders only the common curriculum even if an upstream response includes old concept values', async ({ page }) => {
  const state = model(); state.accounts.set(first, learning(first, 'disabled')); await connect(page, state);
  await page.goto(fixture);
  await expect(page.getByRole('heading', { name: 'Follow the standard curriculum' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Standard curriculum' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Concept estimates' })).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Due concept reviews' })).toHaveCount(0);
  await expect(page.getByText('Targeted practice', { exact: false })).toHaveCount(0);
  await expect(page.getByText('42/100', { exact: false })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Change personalization settings' })).toHaveAttribute('href', '/settings');
  await expect(page.getByRole('link', { name: 'Start Pair With Target', exact: true })).toHaveAttribute('href', '/practice?problem=pair-with-target-v1');
  await capture(page, 'opt-out-desktop');
});

test('switching accounts ignores a delayed earlier-owner snapshot and never displays it in the new account', async ({ page }) => {
  const state = model(); await connect(page, state);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let delivered!: () => void;
  const oldReplyFinished = new Promise<void>(resolve => { delivered = resolve; });
  await page.route('**/api/learner/learning', async route => {
    const owner = route.request().headers()['x-learning-owner'];
    if (owner === first) await held;
    await route.fulfill({ json: state.accounts.get(owner)! }).catch(() => undefined);
    if (owner === first) delivered();
  });
  await page.goto(fixture);
  await expect(page.getByRole('heading', { name: 'Loading your account plan' })).toBeVisible();
  await page.getByRole('button', { name: 'Second sample account' }).click();
  await expect(page.getByText('No account evidence yet.', { exact: false })).toBeVisible();
  release(); await oldReplyFinished;
  await expect(page.getByRole('heading', { name: 'Hash Maps', exact: true })).toHaveCount(0);
  await expect(page.getByText('No account evidence yet.', { exact: false })).toBeVisible();
});

test('a new account error clears an already displayed previous-owner estimate', async ({ page }) => {
  const state = model(); await connect(page, state);
  await page.route('**/api/learner/learning', route => route.request().headers()['x-learning-owner'] === second ? route.fulfill({ status: 503, json: { error: 'The second sample account is unavailable.' } }) : route.fulfill({ json: state.accounts.get(first) }));
  await page.goto(fixture);
  await expect(page.getByText('42/100', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Second sample account' }).click();
  await expect(page.getByRole('alert', { name: 'Learning plan error' })).toContainText('second sample account');
  await expect(page.getByText('42/100', { exact: false })).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Account practice recommendations' })).toHaveCount(0);
});

test('an accepted snooze with a lost response survives reload and confirms the same request receipt', async ({ page }) => {
  const state = model(); state.failReply = true; await connect(page, state);
  await page.goto(fixture); await page.getByRole('button', { name: 'Review Hash Maps tomorrow' }).click();
  await expect(page.getByRole('alert', { name: 'Learning review error' })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Review change status' })).toHaveCount(0);
  const pending = state.requests[0];
  expect(pending).toMatchObject({ conceptId: 'hash-maps', expectedRevision: 3, days: 1 });
  expect(await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)!), cacheKey)).toEqual(pending);
  await page.reload();
  await page.getByRole('button', { name: 'Retry review change' }).click();
  await expect(page.getByRole('status', { name: 'Review change status' })).toContainText('Review moved to Oct 28');
  await expect(page.getByRole('heading', { name: '1 review due', exact: true })).toHaveCount(0);
  expect(state.requests).toHaveLength(2); expect(state.requests[1]).toEqual(pending); expect(state.receipts.size).toBe(1);
  expect(await page.evaluate(key => sessionStorage.getItem(key), cacheKey)).toBeNull();
  expect(state.accounts.get(first)!.snapshot.concepts[0].score).toBe(42);
});

for (const receipt of ['missing', 'mismatched'] as const) {
  test(`${receipt} snooze receipt never produces a false confirmation or a new request key`, async ({ page }) => {
    const state = model(); await connect(page, state);
    const requests: LearningReviewRequest[] = [];
    await page.route('**/api/learner/learning/reviews', async route => {
      const request = route.request().postDataJSON() as LearningReviewRequest; requests.push(request);
      const reviewReceipt = { conceptId: request.conceptId, requestKey: requests.length === 1 && receipt === 'mismatched' ? 'wrong-request' : request.requestKey, previousRevision: 3, revision: 4, dueAt: '2026-10-28T12:00:00.000Z' };
      await route.fulfill({ json: { ...state.accounts.get(first), ...(requests.length !== 1 || receipt !== 'missing' ? { reviewReceipt } : {}) } });
    });
    await page.goto(fixture); await page.getByRole('button', { name: 'Review Hash Maps tomorrow' }).click();
    await expect(page.getByRole('alert', { name: 'Learning review error' })).toContainText('could not confirm');
    await expect(page.getByRole('status', { name: 'Review change status' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Retry review change' }).click();
    await expect(page.getByRole('status', { name: 'Review change status' })).toContainText('Review moved');
    expect(requests[1]).toEqual(requests[0]);
  });
}

test('a review conflict requires fresh account evidence before scheduling another date', async ({ page }) => {
  const state = model(); await connect(page, state);
  await page.route('**/api/learner/learning/reviews', async route => {
    state.requests.push(route.request().postDataJSON() as LearningReviewRequest);
    state.accounts.get(first)!.snapshot.concepts[0].reviewRevision = 5;
    state.accounts.get(first)!.snapshot.concepts[0].reviewDueAt = '2026-10-30T12:00:00.000Z';
    await route.fulfill({ status: 409, json: { code: 'review_conflict', error: 'The saved review schedule changed on another device.' } });
  });
  await page.goto(fixture); await page.getByRole('button', { name: 'Review Hash Maps tomorrow' }).click();
  await expect(page.getByRole('alert', { name: 'Learning review error' })).toContainText('another device');
  await expect(page.getByRole('button', { name: 'Review Hash Maps tomorrow' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Retry review change' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Load latest review schedule' }).click();
  await expect(page.getByText('Next review: Oct 30', { exact: false })).toBeVisible();
  expect(await page.evaluate(key => sessionStorage.getItem(key), cacheKey)).toBeNull();
  expect(state.requests).toHaveLength(1);
});

test('an owner mismatch hides the account plan and blocks further review writes', async ({ page }) => {
  const state = model(); await connect(page, state);
  await page.route('**/api/learner/learning/reviews', route => route.fulfill({ status: 409, json: { code: 'owner_changed', error: 'Your account changed.' } }));
  await page.goto(fixture); await page.getByRole('button', { name: 'Review Hash Maps tomorrow' }).click();
  await expect(page.getByRole('alert', { name: 'Learning account changed' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Concept estimates' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Retry review change' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Reopen dashboard' })).toHaveAttribute('href', '/dashboard');
  expect(await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)!), cacheKey)).toMatchObject({ conceptId: 'hash-maps', expectedRevision: 3 });
});

test('a delayed old-owner review response cannot replace another account or erase the old recovery request', async ({ page }) => {
  const state = model(); await connect(page, state);
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/learner/learning/reviews', async route => {
    const request = route.request().postDataJSON() as LearningReviewRequest;
    await held;
    await route.fulfill({ json: { ...state.accounts.get(first), reviewReceipt: { conceptId: request.conceptId, requestKey: request.requestKey, previousRevision: 3, revision: 4, dueAt: '2026-10-28T12:00:00.000Z' } } });
  });
  await page.goto(fixture); await page.getByRole('button', { name: 'Review Hash Maps tomorrow' }).click();
  await page.getByRole('button', { name: 'Second sample account' }).click();
  await expect(page.getByText('No account evidence yet.', { exact: false })).toBeVisible();
  const response = page.waitForResponse(reply => reply.url().endsWith('/api/learner/learning/reviews'));
  release(); await (await response).finished();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
  await expect(page.getByText('42/100', { exact: false })).toHaveCount(0);
  await expect(page.getByRole('status', { name: 'Review change status' })).toHaveCount(0);
  expect(await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)!), cacheKey)).toMatchObject({ conceptId: 'hash-maps', expectedRevision: 3 });
});

test('mobile keyboard users can inspect a recommendation and postpone a review without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = model(); await connect(page, state); await page.goto(fixture);
  const explanation = page.locator('summary').first(); await explanation.focus(); await page.keyboard.press('Enter');
  await expect(page.getByText('This estimate uses one independent item', { exact: false })).toBeVisible();
  const tomorrow = page.getByRole('button', { name: 'Review Hash Maps tomorrow' });
  await tomorrow.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('status', { name: 'Review change status' })).toContainText('Review moved');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await capture(page, 'adaptive-mobile');
});

async function connectDashboard(page: Page, identity: () => string | null) {
  await page.route('**/api/viewer', route => { const id = identity(); return route.fulfill({ json: { viewer: id ? { id, email: null, displayName: 'Sample Learner', canAccessAdministration: false } : null } }); });
  await page.route('**/api/learner/profile', route => { const learnerId = identity(); return route.fulfill({ json: { learnerId, profile: learnerId ? profile : null } }); });
  await page.route('**/api/practice/history', route => route.fulfill({ json: { sessions: [] } }));
  await page.route('**/api/learner/reviews', route => route.fulfill({ json: { learnerId: identity(), reviews: [] } }));
}

test('dashboard focus switches account plans while preserving profile, progress, history, and settings navigation', async ({ page }) => {
  let owner: string | null = first;
  const state = model(); await connect(page, state); await connectDashboard(page, () => owner);
  await page.addInitScript(value => localStorage.setItem('leetcode-app.local-learner-profile.v1', JSON.stringify(value)), profile);
  await page.goto(`${fixture}?view=dashboard`);
  await expect(page.getByText('42/100', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Progress you can build on' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View history', exact: true })).toHaveAttribute('href', '/history');
  await expect(page.getByRole('link', { name: 'Edit settings', exact: true })).toHaveAttribute('href', '/settings');
  owner = second; await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('No account evidence yet.', { exact: false })).toBeVisible();
  await expect(page.getByText('42/100', { exact: false })).toHaveCount(0);
  owner = null; await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('Device practice plan', { exact: false })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Account learning plan' })).toHaveCount(0);
});

test('guest dashboard retains the device plan and never requests account estimates', async ({ page }) => {
  await connectDashboard(page, () => null);
  let accountReads = 0;
  await page.route('**/api/learner/learning', route => { accountReads += 1; return route.fulfill({ status: 401, json: { error: 'Sign in first.' } }); });
  await page.addInitScript(value => localStorage.setItem('leetcode-app.local-learner-profile.v1', JSON.stringify(value)), profile);
  await page.goto(`${fixture}?view=dashboard`);
  await expect(page.getByText('Device practice plan', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recommended algorithms' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Profile at a glance' })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Start / }).last()).toHaveAttribute('href', /\/practice\?problem=/);
  expect(accountReads).toBe(0);
});

test('signed-in dashboard keeps valid device mastery out of account estimates while retaining device activity history', async ({ page }) => {
  const state = model(); state.accounts.set(first, learning(first, 'initial')); await connect(page, state); await connectDashboard(page, () => first);
  await page.addInitScript(() => {
    localStorage.setItem('method:local-mastery:v1', JSON.stringify({ 'hash-maps': { conceptId: 'hash-maps', mastery: 1, confidence: 1, evidenceCount: 100, lastPracticedAt: '2026-10-27T12:00:00.000Z' } }));
    localStorage.setItem('leetcode-app.local-practice-history.v1', JSON.stringify([{ practiceItemId: 'pair-with-target-v1', label: 'Device-only practice', completedAt: '2026-10-27T12:00:00.000Z', evaluationScore: 100 }]));
  });
  await page.goto(`${fixture}?view=dashboard`);
  const account = page.getByRole('region', { name: 'Account learning plan' });
  await expect(account.getByText('No account evidence yet.', { exact: false })).toBeVisible();
  await expect(account.getByRole('list', { name: 'Concept estimates' })).toHaveCount(0);
  await expect(account.getByLabel('Account evidence sources').getByText('0', { exact: true })).toHaveCount(3);
  await expect(page.getByText('Device practice plan', { exact: false })).toHaveCount(0);
  await expect(page.getByText('Completed', { exact: true }).locator('..').getByText('1', { exact: true })).toBeVisible();
  await expect(page.getByText('Only trusted account evidence contributes', { exact: false })).toBeVisible();
  expect(state.requests).toHaveLength(0);
});

test('earlier saved reminders remain accessible and a lost legacy snooze reply requires a fresh schedule', async ({ page }) => {
  const state = model(); await connect(page, state); await connectDashboard(page, () => first);
  const dueAt = new Date(Date.now() - 86_400_000).toISOString();
  const saved = [
    { id: 'saved-pair', conceptId: 'hash-maps', label: 'Pair With Target', dueAt, intervalDays: 1, repetitions: 1, practiceItemId: 'pair-with-target-v1' },
    { id: 'saved-window', conceptId: 'sliding-window', label: 'Check window invariants', dueAt: '2099-01-01T12:00:00.000Z', intervalDays: 3, repetitions: 0, practiceItemId: null },
  ];
  let writes = 0;
  await page.route('**/api/learner/reviews', async route => {
    expect(route.request().headers()['x-learning-owner']).toBe(first);
    if (route.request().method() === 'GET') { await route.fulfill({ json: { learnerId: first, reviews: saved } }); return; }
    writes += 1;
    saved[0].dueAt = '2099-01-02T12:00:00.000Z';
    await route.abort('failed');
  });
  await page.goto(`${fixture}?view=dashboard`);
  const reminders = page.getByRole('region', { name: 'Earlier saved practice reviews' });
  await expect(reminders.getByRole('heading', { name: 'Check window invariants', exact: true })).toBeVisible();
  await expect(reminders.getByRole('link', { name: 'Open earlier review Pair With Target' })).toHaveAttribute('href', '/practice?problem=pair-with-target-v1');
  await reminders.getByRole('button', { name: 'Move earlier review Pair With Target to tomorrow' }).click();
  await expect(reminders.getByRole('alert', { name: 'Earlier review error' })).toContainText('Reload');
  await expect(reminders.getByRole('button', { name: 'Move earlier review Pair With Target to tomorrow' })).toBeDisabled();
  await reminders.getByRole('button', { name: 'Reload saved reviews' }).click();
  await expect(reminders.getByText('0 earlier reviews due', { exact: false })).toBeVisible();
  await expect(reminders.getByRole('heading', { name: 'Check window invariants', exact: true })).toBeVisible();
  expect(writes).toBe(1);
});

test('account settings opt-out persists to the account and changes the real dashboard to the common curriculum', async ({ page }) => {
  const state = model(); await connect(page, state); await connectDashboard(page, () => first);
  let accountProfile = { ...profile };
  const writes: Record<string, unknown>[] = [];
  await page.route('**/api/learner/profile', async route => {
    if (route.request().method() === 'PUT') {
      expect(route.request().headers()['x-learning-owner']).toBe(first);
      const payload = route.request().postDataJSON() as typeof profile;
      writes.push(payload); accountProfile = payload;
      state.accounts.set(first, learning(first, payload.personalizationOptOut ? 'disabled' : 'mixed'));
    }
    await route.fulfill({ json: { learnerId: first, profile: accountProfile } });
  });
  await page.goto('/settings');
  const optOut = page.getByRole('checkbox', { name: /Turn off personalization/ });
  await optOut.check();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(optOut).toBeChecked();
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(page.getByText('Settings saved.', { exact: true })).toBeVisible();
  expect(writes).toHaveLength(1); expect(writes[0]).toMatchObject({ personalizationOptOut: true });
  await page.getByRole('navigation', { name: 'Learner navigation', exact: true }).getByRole('link', { name: 'Dashboard', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Follow the standard curriculum' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Concept estimates' })).toHaveCount(0);
  await expect(page.getByText('Device practice plan', { exact: false })).toHaveCount(0);
});

test('switching accounts in settings blocks the old consent edits from being saved to the new account', async ({ page }) => {
  let owner = first; let writes = 0;
  await connectDashboard(page, () => owner);
  await page.route('**/api/learner/profile', async route => {
    if (route.request().method() === 'PUT') writes += 1;
    await route.fulfill({ json: { learnerId: owner, profile } });
  });
  await page.goto('/settings');
  await page.getByLabel('Weekly minutes', { exact: true }).fill('45');
  await page.getByRole('checkbox', { name: /Turn off personalization/ }).check();
  owner = second; await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('alert').filter({ hasText: 'Your signed-in account changed' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save settings', exact: true })).toBeHidden();
  expect(writes).toBe(0);
  await page.getByRole('link', { name: 'Reload settings', exact: true }).click();
  await expect(page.getByLabel('Weekly minutes', { exact: true })).toHaveValue('180');
  await expect(page.getByRole('checkbox', { name: /Turn off personalization/ })).not.toBeChecked();
  expect(writes).toBe(0);
});

test('guest settings retain device preferences and do not send account consent writes', async ({ page }) => {
  await connectDashboard(page, () => null);
  let writes = 0;
  await page.route('**/api/learner/profile', route => { if (route.request().method() === 'PUT') writes += 1; return route.fulfill({ status: 401, json: { error: 'Sign in first.' } }); });
  await page.addInitScript(value => { if (!localStorage.getItem('leetcode-app.local-learner-profile.v1')) localStorage.setItem('leetcode-app.local-learner-profile.v1', JSON.stringify(value)); }, profile);
  await page.goto('/settings');
  await page.getByRole('checkbox', { name: /Turn off personalized recommendations/ }).check();
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(page.getByText('Settings saved on this device.', { exact: false })).toBeVisible();
  expect(writes).toBe(0);
  await page.reload();
  await expect(page.getByRole('checkbox', { name: /Turn off personalized recommendations/ })).toBeChecked();
});

test('an authentication outage does not turn account settings into a guest consent form', async ({ page }) => {
  await page.route('**/api/viewer', route => route.fulfill({ status: 503, json: { error: 'Authentication is unavailable.' } }));
  await page.goto('/settings');
  await expect(page.getByRole('alert').filter({ hasText: 'could not verify your signed-in account' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry account check' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save settings', exact: true })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: /Turn off personalized recommendations/ })).toHaveCount(0);
});
