import { expect, test, type Page } from '@playwright/test';
import type { AnnouncementContent, AnnouncementReceipt } from '@leetcode-app/database';

const fixture = '/test-support/class-portal';
const actorId = '11111111-1111-4111-8111-111111111111';
const classId = '22222222-2222-4222-8222-222222222222';
const announcementId = '33333333-3333-4333-8333-333333333333';
const stamp = '2026-11-04T14:00:00.000Z';
const uid = (value: number) => `a${value.toString(16).padStart(7, '0')}-0000-4000-8000-${value.toString(16).padStart(12, '0')}`;
const classroom = { id: classId, name: 'Synthetic algorithms class', description: 'Synthetic class work.', instructorName: 'Synthetic instructor', learnerCount: 2 };
type RecordState = { id: string; sequence: number; status: 'draft' | 'published' | 'archived'; draft: AnnouncementContent; published: { id: string; sequence: number; content: AnnouncementContent; publishedAt: string } | null; read: number };
type Model = ReturnType<typeof model>;
function model() {
  const content = { revisionId: uid(1), revisionNumber: 1, title: 'Review the map invariant', body: 'Explain why the map contains exactly the earlier values.', createdAt: stamp, authorName: 'Synthetic instructor' };
  return { owner: actorId, workspace: 'teach' as 'teach' | 'admin' | 'learner', counter: 100,
    records: new Map<string, RecordState>([[announcementId, { id: announcementId, sequence: 2, status: 'published', draft: content, published: { id: uid(2), sequence: 2, content: { ...content }, publishedAt: stamp }, read: 0 }]]),
    posts: [] as { action: string; announcementId: string; body: Record<string, unknown> }[], receipts: new Map<string, AnnouncementReceipt>(), lose: '', loseBefore: '', malformed: '', reject: '',
  };
}
async function connect(page: Page, state: Model) {
  await page.route('**/api/class-portal/**', async route => {
    const request = route.request(), url = new URL(request.url());
    if (request.headers()['x-assessment-author'] !== state.owner) return route.fulfill({ status: 409, json: { code: 'owner_changed', message: 'Your account changed.' } });
    const parts = url.pathname.split('/').filter(Boolean), id = parts[4], endpoint = parts[5];
    const learner = url.searchParams.get('workspace') === 'learner';
    if (parts[2] !== classId) return route.fulfill({ status: 404, json: { code: 'not_found' } });
    if (request.method() === 'GET' && !id) {
      const filter = url.searchParams.get('state') ?? 'current';
      const records = [...state.records.values()].filter(item => learner ? item.status === 'published' : filter === 'all' || (filter === 'archived' ? item.status === 'archived' : item.status !== 'archived'));
      const after = url.searchParams.get('beforeId');
      const offset = after ? records.findIndex(item => item.id === after) + 1 : 0;
      const selected = records.slice(offset, offset + 25);
      const items = selected.map(item => {
        const content = learner ? item.published!.content : item.draft;
        return { id: item.id, title: content.title, excerpt: content.body.slice(0, 240), publishedAt: item.published?.publishedAt ?? null, publicationSequence: item.published?.sequence ?? null,
          unread: learner && item.read !== item.published?.sequence,
          ...(!learner ? { authorState: { sequence: item.sequence, revisionNumber: item.draft.revisionNumber, status: item.status, hasUnpublishedChanges: item.published?.content.revisionId !== item.draft.revisionId } } : {}) };
      });
      return route.fulfill({ json: { actorId: state.owner, list: { classroom, items, nextCursor: records.length > offset + selected.length ? { at: stamp, id: selected.at(-1)!.id } : null } } });
    }
    let record = state.records.get(id);
    if (request.method() === 'GET') {
      if (!record || learner && record.status !== 'published') return route.fulfill({ status: 404, json: { code: 'not_found' } });
      return route.fulfill({ json: { actorId: state.owner, view: { classroom, announcement: { id, sequence: learner ? record.published!.sequence : record.sequence, status: record.status, draft: learner ? null : record.draft,
        published: record.published, unread: learner && record.read !== record.published?.sequence } } } });
    }
    const body = request.postDataJSON();
    const action = ({ draft: 'save', publications: 'publish', archive: 'archive', read: 'read' } as Record<string, 'save' | 'publish' | 'archive' | 'read'>)[endpoint];
    state.posts.push({ action, announcementId: id, body });
    const identity = `${state.owner}:${body.requestKey}`;
    const previous = state.receipts.get(identity);
    if (previous) return route.fulfill({ json: { actorId: state.owner, receipt: previous } });
    if (state.loseBefore === action) { state.loseBefore = ''; return route.fulfill({ status: 503, json: { message: 'Request did not reach the database.' } }); }
    if (state.reject === action) return route.fulfill({ status: 409, json: { code: 'sequence_changed', message: 'The saved announcement changed. Review the latest state.' } });
    if (action === 'save' && !record) {
      record = { id, sequence: 0, status: 'draft', draft: { revisionId: uid(++state.counter), revisionNumber: 0, title: '', body: '', createdAt: stamp, authorName: 'Synthetic instructor' }, published: null, read: 0 };
      state.records.set(id, record);
    }
    if (!record) return route.fulfill({ status: 404, json: { code: 'not_found' } });
    if (action === 'read' ? !record.published || body.publicationSequence !== record.published.sequence : body.expectedSequence !== record.sequence) {
      return route.fulfill({ status: 409, json: { code: 'sequence_changed', message: 'The saved announcement changed. Review the latest state.' } });
    }
    let sequence: number, revisionId: string | null = null, publicationSequence: number | null = null;
    if (action === 'read') { sequence = body.publicationSequence; publicationSequence = sequence; revisionId = record.published!.content.revisionId; record.read = sequence; }
    else {
      sequence = ++record.sequence;
      if (action === 'save') { record.draft = { revisionId: uid(++state.counter), revisionNumber: record.draft.revisionNumber + 1, title: body.title, body: body.body, createdAt: stamp, authorName: 'Synthetic instructor' }; revisionId = record.draft.revisionId; }
      if (action === 'publish') {
        if (body.revisionId !== record.draft.revisionId) return route.fulfill({ status: 409, json: { code: 'revision_changed' } });
        record.published = { id: uid(++state.counter), sequence, content: { ...record.draft }, publishedAt: stamp }; record.status = 'published'; revisionId = record.draft.revisionId; publicationSequence = sequence;
      }
      if (action === 'archive') record.status = 'archived';
    }
    const receipt: AnnouncementReceipt = { id: uid(++state.counter), actorId: state.owner, classId, announcementId: id, action, sequence, revisionId, publicationSequence, createdAt: stamp };
    state.receipts.set(identity, receipt);
    if (state.lose === action) { state.lose = ''; return route.fulfill({ status: 503, json: { message: 'Response lost after commit.' } }); }
    if (state.malformed === action) { state.malformed = ''; return route.fulfill({ json: { actorId: state.owner, receipt: { ...receipt, id: null } } }); }
    return route.fulfill({ json: { actorId: state.owner, receipt } });
  });
}
async function open(page: Page, state: Model) {
  await connect(page, state);
  await page.goto(`${fixture}?workspace=${state.workspace}`);
  await expect(page.getByRole('region', { name: 'Announcement list', exact: true })).toBeVisible();
}
async function openExisting(page: Page, state: Model) {
  await page.getByRole('button', { name: `${state.workspace === 'learner' ? 'Read' : 'Open'} announcement: ${state.records.get(announcementId)!.draft.title}`, exact: true }).click();
  await expect(page.getByRole('region', { name: state.workspace === 'learner' ? 'Published announcement' : 'Saved announcement preview', exact: true })).toContainText('Explain why the map');
}
async function create(page: Page) {
  await page.getByRole('button', { name: 'New announcement', exact: true }).click();
  await page.getByLabel('Announcement title', { exact: true }).fill('Study session');
  await page.getByLabel('Announcement text', { exact: true }).fill('Bring a short explanation of the invariant.');
  await page.getByRole('button', { name: 'Save private draft', exact: true }).click();
}

for (const workspace of ['teach', 'admin'] as const) test(`${workspace} saves privately before explicitly publishing the reviewed saved revision`, async ({ page }) => {
  const state = model(); state.workspace = workspace;
  await open(page, state); await create(page);
  await expect(page.getByRole('region', { name: 'Saved announcement preview' })).toContainText('Study session');
  expect(state.posts.map(item => item.action)).toEqual(['save']);
  await page.getByLabel('Announcement text', { exact: true }).fill('Unsaved correction must not publish.');
  await expect(page.getByRole('button', { name: 'Publish saved announcement', exact: true })).toBeDisabled();
  await expect(page.getByRole('region', { name: 'Saved announcement preview' })).toContainText('Bring a short explanation');
  await page.getByRole('button', { name: 'Discard unsaved edits', exact: true }).click();
  await page.getByLabel('I want current class members to read the saved announcement shown above.', { exact: true }).check();
  await page.getByRole('button', { name: 'Publish saved announcement', exact: true }).click();
  await expect.poll(() => state.posts.map(item => item.action)).toEqual(['save', 'publish']);
  await expect(page.getByRole('button', { name: 'Publish saved announcement', exact: true })).toBeDisabled();
  expect([...state.records.values()].find(item => item.id !== announcementId)?.published?.content.body).toBe('Bring a short explanation of the invariant.');
});

test('editing an announcement keeps its prior publication visible until explicit correction publication', async ({ page }) => {
  const state = model(); await open(page, state); await openExisting(page, state);
  await page.getByLabel('Announcement text', { exact: true }).fill('A corrected published explanation.');
  await page.getByRole('button', { name: 'Save private draft', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Saved announcement preview' })).toContainText('A corrected published explanation.');
  expect(state.records.get(announcementId)!.published!.content.body).toContain('earlier values');
  await page.getByText('Previously published text', { exact: true }).click();
  await expect(page.getByText('Explain why the map contains exactly the earlier values.', { exact: true }).last()).toBeVisible();
  await page.getByLabel('I want current class members to read the saved announcement shown above.', { exact: true }).check();
  await page.getByRole('button', { name: 'Publish saved announcement', exact: true }).click();
  await expect.poll(() => state.records.get(announcementId)!.published!.content.body).toBe('A corrected published explanation.');
});

for (const action of ['save', 'publish', 'archive'] as const) test(`a lost ${action} response recovers the exact original request after reload`, async ({ page }) => {
  const state = model(); state.lose = action;
  await open(page, state);
  if (action === 'save') await create(page);
  else {
    await openExisting(page, state);
    if (action === 'publish') {
      await page.getByLabel('Announcement text', { exact: true }).fill('Publish a new saved correction.');
      await page.getByRole('button', { name: 'Save private draft', exact: true }).click();
      await expect(page.getByRole('region', { name: 'Saved announcement preview' })).toContainText('Publish a new saved correction.');
      await page.getByLabel('I want current class members to read the saved announcement shown above.', { exact: true }).check();
      await page.getByRole('button', { name: 'Publish saved announcement', exact: true }).click();
    } else {
      await page.getByLabel('Archive this announcement. Class members will no longer have access to any published text.', { exact: true }).check();
      await page.getByRole('button', { name: 'Archive announcement', exact: true }).click();
    }
  }
  await expect(page.getByRole('alert').filter({ hasText: 'Response lost after commit.' })).toBeVisible();
  const first = state.posts.filter(item => item.action === action)[0];
  await page.reload();
  const retry = page.getByRole('button', { name: `Retry original ${action} request`, exact: true });
  await expect(retry).toBeEnabled(); await retry.click();
  await expect(retry).toHaveCount(0);
  expect(state.posts.filter(item => item.action === action)).toEqual([first, first]);
});

test('malformed success receipts retain the original command for safe confirmation', async ({ page }) => {
  const state = model(); state.malformed = 'save';
  await open(page, state); await create(page);
  await expect(page.getByRole('alert').filter({ hasText: 'receipt could not be confirmed' })).toBeVisible();
  await page.getByRole('button', { name: 'Retry original save request', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry original save request', exact: true })).toHaveCount(0);
  expect(state.posts[1]).toEqual(state.posts[0]);
});

test('an uncertain first save remains retryable after reload when no announcement was created', async ({ page }) => {
  const state = model(); state.loseBefore = 'save'; await open(page, state); await create(page);
  await expect(page.getByRole('alert').filter({ hasText: 'did not reach the database' })).toBeVisible();
  expect(state.records.size).toBe(1);
  const first = state.posts[0];
  await page.reload();
  await expect(page.getByRole('button', { name: 'Retry original save request', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Refresh announcements', exact: true }).click();
  await page.getByRole('button', { name: 'Retry original save request', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Saved announcement preview' })).toContainText('Study session');
  expect(state.posts).toEqual([first, first]);
  expect(state.records.size).toBe(2);
});

test('refresh and reload preserve unsaved edits without publishing or manufacturing a save', async ({ page }) => {
  const state = model(); await open(page, state); await openExisting(page, state);
  await page.getByLabel('Announcement text', { exact: true }).fill('Keep these unsaved teacher edits.');
  await page.getByRole('button', { name: 'Refresh announcements', exact: true }).click();
  await expect(page.getByLabel('Announcement text', { exact: true })).toHaveValue('Keep these unsaved teacher edits.');
  await page.reload();
  await expect(page.getByLabel('Announcement text', { exact: true })).toHaveValue('Keep these unsaved teacher edits.');
  expect(state.posts).toEqual([]);
  await expect(page.getByRole('button', { name: 'Publish saved announcement', exact: true })).toBeDisabled();
});

test('a stale draft preserves rejected edits and requires review of current saved state', async ({ page }) => {
  const state = model(); await open(page, state); await openExisting(page, state);
  await page.getByLabel('Announcement text', { exact: true }).fill('Preserve my stale correction.');
  const record = state.records.get(announcementId)!; record.sequence = 3; record.draft = { ...record.draft, revisionId: uid(88), revisionNumber: 2, body: 'Another author saved this.' };
  await page.getByRole('button', { name: 'Save private draft', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry original save request', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Discard rejected request and review latest state', exact: true }).click();
  await expect(page.getByLabel('Announcement text', { exact: true })).toHaveValue('Another author saved this.');
  await page.getByText('Preserved earlier edits', { exact: true }).click();
  await expect(page.getByText('Preserve my stale correction.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Restore as unsaved edits', exact: true }).click();
  await expect(page.getByLabel('Announcement text', { exact: true })).toHaveValue('Preserve my stale correction.');
  await expect(page.getByRole('button', { name: 'Publish saved announcement', exact: true })).toBeDisabled();
});

test('account changes hide teacher drafts and block a retained pending publication', async ({ page }) => {
  const state = model(); state.lose = 'save'; await open(page, state); await create(page);
  await expect(page.getByRole('button', { name: 'Retry original save request', exact: true })).toBeVisible();
  state.owner = uid(90);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('alert').filter({ hasText: 'account or class access changed' })).toBeVisible();
  await expect(page.getByLabel('Announcement text', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Retry original save request', exact: true })).toHaveCount(0);
  expect(state.posts).toHaveLength(1);
});

test('an account change during an in-flight save hides private edits before its response returns', async ({ page }) => {
  const state = model(); await open(page, state);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/class-portal/**/draft?*', async route => { await held; await route.fallback(); });
  await page.getByRole('button', { name: 'New announcement', exact: true }).click();
  await page.getByLabel('Announcement title', { exact: true }).fill('Private pending title');
  await page.getByLabel('Announcement text', { exact: true }).fill('Private pending teacher text.');
  await page.getByRole('button', { name: 'Save private draft', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirming request…', exact: true })).toBeVisible();
  state.owner = uid(90); await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('alert').filter({ hasText: 'account or class access changed' })).toBeVisible();
  await expect(page.getByLabel('Announcement text', { exact: true })).toHaveCount(0);
  release();
  expect(state.posts).toEqual([]);
});

test('a saved private draft can be archived and deliberately published again', async ({ page }) => {
  const state = model(); await open(page, state); await create(page);
  await expect(page.getByRole('region', { name: 'Saved announcement preview' })).toContainText('Study session');
  await page.getByLabel('Archive this announcement. Class members will no longer have access to any published text.', { exact: true }).check();
  await page.getByRole('button', { name: 'Archive announcement', exact: true }).click();
  await expect(page.getByText('Archived announcements stay private until you explicitly publish a saved revision again.', { exact: true })).toBeVisible();
  await page.getByLabel('Show announcements', { exact: true }).selectOption('archived');
  await expect(page.getByRole('button', { name: 'Open announcement: Study session', exact: true })).toBeVisible();
  await page.getByLabel('I want current class members to read the saved announcement shown above.', { exact: true }).check();
  await page.getByRole('button', { name: 'Publish saved announcement', exact: true }).click();
  await expect.poll(() => [...state.records.values()].find(item => item.id !== announcementId)?.status).toBe('published');
});

test('learner reads only published text and marks exactly the displayed publication read', async ({ page }) => {
  const state = model(); state.workspace = 'learner';
  state.records.set(uid(7), { ...structuredClone(state.records.get(announcementId)!), id: uid(7), status: 'draft', published: null, draft: { ...state.records.get(announcementId)!.draft, title: 'Private staff planning' } });
  await open(page, state); await expect(page.getByText('Private staff planning')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'New announcement', exact: true })).toHaveCount(0);
  await openExisting(page, state);
  await expect(page.getByRole('region', { name: 'Announcement list', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to announcements', exact: true, includeHidden: true })).toBeHidden();
  await page.getByRole('button', { name: 'Mark this publication read', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mark this publication read', exact: true })).toHaveCount(0);
  expect(state.posts).toHaveLength(1); expect(state.posts[0]).toMatchObject({ action: 'read', body: { publicationSequence: 2 } });
});

test('a newer correction cannot be marked read by a stale displayed publication', async ({ page }) => {
  const state = model(); state.workspace = 'learner'; await open(page, state); await openExisting(page, state);
  const record = state.records.get(announcementId)!; record.sequence = 4; record.published = { ...record.published!, sequence: 4, content: { ...record.draft, revisionId: uid(88), revisionNumber: 2, body: 'New class correction.' } };
  await page.getByRole('button', { name: 'Mark this publication read', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry original read request', exact: true })).toBeDisabled();
  expect(record.read).toBe(0);
  await page.getByRole('button', { name: 'Discard rejected request and review latest state', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Published announcement', exact: true })).toContainText('New class correction.');
  await expect(page.getByRole('button', { name: 'Mark this publication read', exact: true })).toBeEnabled();
});

test('a lost read receipt after a correction confirms only the original publication', async ({ page }) => {
  const state = model(); state.workspace = 'learner'; state.lose = 'read';
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, state); await openExisting(page, state);
  await page.getByRole('button', { name: 'Mark this publication read', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry original read request', exact: true })).toBeVisible();
  const pendingBefore = await page.evaluate(() => sessionStorage.getItem('method:class-announcements:11111111-1111-4111-8111-111111111111:learner:22222222-2222-4222-8222-222222222222:pending'));
  await page.getByRole('button', { name: 'Back to announcements', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Announcement list', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry original read request', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => sessionStorage.getItem('method:class-announcements:11111111-1111-4111-8111-111111111111:learner:22222222-2222-4222-8222-222222222222:pending'))).toBe(pendingBefore);
  const record = state.records.get(announcementId)!; record.sequence = 4; record.published = { ...record.published!, sequence: 4, content: { ...record.draft, revisionId: uid(88), revisionNumber: 2, body: 'A newer unread correction.' } };
  await page.reload(); await page.getByRole('button', { name: 'Retry original read request', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Published announcement', exact: true })).toContainText('A newer unread correction.');
  await expect(page.getByRole('button', { name: 'Mark this publication read', exact: true })).toBeEnabled();
  expect(record.read).toBe(2); expect(state.posts[1]).toEqual(state.posts[0]);
});

test('membership denial hides previously displayed announcement text on refresh', async ({ page }) => {
  const state = model(); state.workspace = 'learner'; await open(page, state); await openExisting(page, state);
  await page.route('**/api/class-portal/**', route => route.fulfill({ status: 403, json: { code: 'forbidden' } }));
  await page.getByRole('button', { name: 'Refresh announcements', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Published announcement', exact: true })).toHaveCount(0);
  await expect(page.getByText('Explain why the map contains exactly the earlier values.', { exact: true })).toHaveCount(0);
});

test('announcement lists paginate and plain text remains escaped on a phone', async ({ page }) => {
  const state = model(); state.workspace = 'learner';
  const record = state.records.get(announcementId)!; record.draft.title = '<img src=x onerror=window.portalExecuted=true>'; record.draft.body = '<script>window.portalExecuted=true</script>\n' + 'A'.repeat(180);
  record.published!.content = { ...record.draft };
  for (let i = 1; i <= 25; i++) state.records.set(uid(200 + i), { ...structuredClone(record), id: uid(200 + i), draft: { ...record.draft, title: `Synthetic update ${i}` }, published: { ...record.published!, content: { ...record.draft, title: `Synthetic update ${i}` } } });
  await page.setViewportSize({ width: 390, height: 844 }); await open(page, state);
  await page.getByRole('button', { name: 'Load more announcements', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Read announcement: Synthetic update 25', exact: true })).toBeVisible();
  await page.getByRole('button', { name: `Read announcement: ${record.draft.title}`, exact: true }).click();
  await expect(page.getByRole('region', { name: 'Published announcement', exact: true })).toContainText('<script>');
  await expect(page.getByRole('region', { name: 'Announcement list', exact: true, includeHidden: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Back to announcements', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { portalExecuted?: boolean }).portalExecuted)).toBeUndefined();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '../../.local-docs/screens/class-portal-learner-phone.png', fullPage: true });
  await page.getByRole('button', { name: 'Back to announcements', exact: true }).click();
  const list = page.getByRole('region', { name: 'Announcement list', exact: true });
  await expect(list).toBeVisible();
  await expect(list).toBeFocused();
  await expect(page.getByRole('region', { name: 'Published announcement', exact: true, includeHidden: true })).toBeHidden();
  await expect(page.getByRole('button', { name: `Read announcement: ${record.draft.title}`, exact: true })).toBeVisible();
});

for (const mode of ['empty', 'single', 'multiple'] as const) test(`${mode} class entry keeps joining and each class destination clear`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${fixture}?mode=${mode}`);
  const links = page.getByRole('link', { name: 'Open class', exact: true });
  await expect(links).toHaveCount(mode === 'empty' ? 0 : mode === 'single' ? 1 : 2);
  if (mode === 'empty') { await expect(page.getByLabel('Class code', { exact: true })).toBeVisible(); await page.getByLabel('Class code', { exact: true }).focus(); await expect(page.getByLabel('Class code', { exact: true })).toBeFocused(); }
  else { await expect(page.getByLabel('Class code', { exact: true })).toBeHidden(); await page.getByText('Join another class', { exact: true }).click(); await expect(page.getByLabel('Class code', { exact: true })).toBeVisible(); await expect(links.first()).toHaveAttribute('href', `/classes/${classId}`); }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('class entry notices stay escaped and keyboard navigation exposes role-appropriate destinations', async ({ page }) => {
  const notice = '<img src=x onerror=window.portalExecuted=true>';
  await page.goto(`${fixture}?mode=multiple&notice=${encodeURIComponent(notice)}`);
  await expect(page.getByRole('alert').filter({ hasText: notice })).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { portalExecuted?: boolean }).portalExecuted)).toBeUndefined();
  const state = model(); state.workspace = 'admin'; await open(page, state);
  const nav = page.getByRole('navigation', { name: 'Class navigation' });
  await expect(nav.getByRole('link', { name: 'Grades', exact: true })).toHaveAttribute('href', `/admin/classes/${classId}/grades`);
  await expect(nav.getByRole('link', { name: 'People', exact: true })).toHaveAttribute('href', `/admin/classes/${classId}?view=people`);
  await page.evaluate(id => window.history.replaceState(null, '', `/admin/classes/${id}?created=Task%20saved`), classId);
  await expect(nav.getByRole('link', { name: 'Assignments', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.evaluate(id => window.history.replaceState(null, '', `/admin/classes/${id}?view=people&error=Notice`), classId);
  await expect(nav.getByRole('link', { name: 'People', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.evaluate(id => window.history.replaceState(null, '', `/admin/classes/${id}/announcements`), classId);
  await expect(nav.getByRole('link', { name: 'Announcements', exact: true })).toHaveAttribute('aria-current', 'page');
  await nav.getByRole('link', { name: 'Announcements', exact: true }).focus();
  await expect(nav.getByRole('link', { name: 'Announcements', exact: true })).toBeFocused();
  await openExisting(page, state);
  await page.screenshot({ path: '../../.local-docs/screens/class-portal-author-desktop.png', fullPage: true });
});
