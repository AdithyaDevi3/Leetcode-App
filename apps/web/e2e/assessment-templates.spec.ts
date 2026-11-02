import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { AssessmentCopyPreview } from '../src/lib/assessment-copy-api-types';
import type { TemplateArchiveCommand, TemplateCreateCommand, TemplateDetailResponse, TemplateDraftResponse, TemplateMutationResponse, TemplateSummary, TemplateUpdateCommand, TemplateUseCommand, TemplateView } from '../src/lib/assessment-template-api-types';

const fixture = '/test-support/assessment-templates';
const actorId = '11111111-1111-4111-8111-111111111111';
const classId = '33333333-3333-4333-8333-333333333333', destinationId = '44444444-4444-4444-8444-444444444444';
const draftId = '55555555-5555-4555-8555-555555555555', templateId = '66666666-6666-4666-8666-666666666666', copyId = '77777777-7777-4777-8777-777777777777';
const date = '2026-11-01T12:00:00.000Z';
type Edit = TemplateUpdateCommand | TemplateArchiveCommand;
function initial(): TemplateView {
  return { id: templateId, revision: 1, status: 'active', currentVersion: 1, version: 1, title: 'Synthetic reusable quiz', instructions: 'Choose the preserved synthetic invariant.', maxUnits: 500,
    createdAt: date, updatedAt: date, versionCreatedAt: date,
    questions: [1, 2].map((number, index) => ({ questionVersionId: `synthetic-template-item-${number}@1`, maxUnits: index ? 375 : 125, question: { questionId: `synthetic-template-item-${number}`, version: 1, versionId: `synthetic-template-item-${number}@1`, kind: 'multiple_choice', title: `Synthetic reviewed question ${number}`, prompt: `Which statement preserves synthetic invariant ${number}?`, difficulty: 'foundation', activityIds: ['synthetic-practice'], conceptIds: ['hash-maps'], options: [{ id: 'a', text: 'First synthetic statement.' }, { id: 'b', text: 'Second synthetic statement.' }] } })) };
}
function model(workspace: 'teach' | 'admin' = 'teach') {
  const current = initial();
  const summary: TemplateSummary = { id: templateId, revision: 1, status: 'active', currentVersion: 1, title: current.title, questionCount: 2, maxUnits: 500, updatedAt: date };
  const source: AssessmentCopyPreview = { actorId, source: { id: draftId, classId, className: 'Synthetic source class', title: current.title, instructions: current.instructions, revision: 3, questions: structuredClone(current.questions) }, destinations: [{ id: classId, name: 'Synthetic source class' }] };
  return { workspace, current, versions: new Map([[1, structuredClone(current)]]), source, catalog: current.questions.map(item => item.question!), library: [summary],
    reads: [] as string[], creates: [] as TemplateCreateCommand[], edits: [] as Edit[], uses: [] as TemplateUseCommand[],
    receipts: new Map<string, TemplateMutationResponse | TemplateDraftResponse>(), abortCreate: false, abortEdit: false, abortUse: false,
    failure: null as { status: number; code: string } | null, readFailure: null as { status: number; code: string } | null, privateField: false,
    holdUse: false, release: null as (() => void) | null };
}
type Model = ReturnType<typeof model>;
function view(state: Model, version = state.current.currentVersion): TemplateView {
  const content = state.versions.get(version)!;
  return { ...structuredClone(content), revision: state.current.revision, status: state.current.status, currentVersion: state.current.currentVersion,
    questions: content.questions.map(item => ({ ...structuredClone(item), question: state.catalog.find(question => question.versionId === item.questionVersionId) ?? null })) };
}
function newer(state: Model, title: string) {
  state.current = { ...structuredClone(state.current), revision: state.current.revision + 1, currentVersion: state.current.currentVersion + 1, version: state.current.currentVersion + 1, title };
  state.versions.set(state.current.version, structuredClone(state.current));
}
async function connect(page: Page, state: Model) {
  await page.route('**/api/assessments/drafts/*/copy?*', async route => {
    expect(route.request().headers()['x-assessment-author']).toBe(actorId); state.reads.push(route.request().url());
    await route.fulfill({ json: structuredClone(state.source) });
  });
  await page.route('**/api/assessments/templates**', async route => {
    const request = route.request(), url = new URL(request.url());
    expect(request.headers()['x-assessment-author']).toBe(actorId); expect(url.searchParams.get('workspace')).toBe(state.workspace);
    if (request.method() === 'GET') {
      state.reads.push(url.toString());
      if (state.readFailure) { await route.fulfill({ status: state.readFailure.status, json: { code: state.readFailure.code, error: 'Synthetic template access changed. Recheck access.' } }); return; }
      if (url.pathname.endsWith('/templates')) {
        const query = (url.searchParams.get('search') ?? '').toLowerCase(), status = url.searchParams.get('status') ?? 'active', pageNumber = Number(url.searchParams.get('page') ?? 1);
        const all = state.library.filter(item => (status === 'all' || item.status === status) && item.title.toLowerCase().includes(query));
        await route.fulfill({ json: { actorId, items: all.slice((pageNumber - 1) * 20, pageNumber * 20), total: all.length, page: pageNumber, pageSize: 20 } }); return;
      }
      const detail: TemplateDetailResponse = { actorId, template: view(state, Number(url.searchParams.get('version') ?? state.current.currentVersion)),
        destinations: [{ id: classId, name: 'Synthetic source class' }, { id: destinationId, name: 'Synthetic destination class' }], catalog: structuredClone(state.catalog) };
      if (state.privateField) Object.assign(detail.template, { privateNote: 'FORGED_PRIVATE_TEMPLATE_DATA' });
      await route.fulfill({ json: detail }); return;
    }
    const body = request.postDataJSON() as TemplateCreateCommand | Edit | TemplateUseCommand;
    const using = url.pathname.endsWith('/drafts'), creating = url.pathname.endsWith('/templates');
    if (using) state.uses.push(body as TemplateUseCommand); else if (creating) state.creates.push(body as TemplateCreateCommand); else state.edits.push(body as Edit);
    if (state.failure) { await route.fulfill({ status: state.failure.status, json: { code: state.failure.code, error: 'Synthetic request needs review.' } }); return; }
    if (using && state.holdUse) { state.holdUse = false; await new Promise<void>(resolve => { state.release = resolve; }); }
    let accepted = state.receipts.get(body.requestKey);
    if (!accepted) {
      if (using) accepted = { actorId, draftId: copyId, classId: (body as TemplateUseCommand).destinationClassId };
      else if (creating) accepted = { actorId, template: structuredClone(state.current), currentRevision: state.current.revision };
      else {
        const command = body as Edit;
        if (command.expectedRevision !== state.current.revision) { await route.fulfill({ status: 409, json: { code: 'template_conflict', error: 'Synthetic saved template changed.' } }); return; }
        if (command.operation === 'update') {
          state.current = { ...state.current, revision: state.current.revision + 1, currentVersion: state.current.currentVersion + 1, version: state.current.currentVersion + 1,
            title: command.content.title, instructions: command.content.instructions, maxUnits: command.content.questions.reduce((sum, item) => sum + item.maxUnits, 0),
            questions: command.content.questions.map(item => ({ ...item, question: state.catalog.find(question => question.versionId === item.questionVersionId) ?? null })) };
          state.versions.set(state.current.version, structuredClone(state.current));
        } else state.current = { ...state.current, revision: state.current.revision + 1, status: command.archived ? 'archived' : 'active' };
        accepted = { actorId, template: view(state), currentRevision: state.current.revision };
      }
      state.receipts.set(body.requestKey, structuredClone(accepted));
    }
    const abort = using ? state.abortUse : creating ? state.abortCreate : state.abortEdit;
    if (using) state.abortUse = false; else if (creating) state.abortCreate = false; else state.abortEdit = false;
    if (abort) { await route.abort('failed'); return; }
    const reply = 'template' in accepted ? { ...accepted, currentRevision: state.current.revision } : accepted;
    await route.fulfill({ status: using || creating ? 201 : 200, json: reply });
  });
}
async function open(page: Page, state: Model, mode: 'library' | 'create' | 'detail' = 'detail') {
  await connect(page, state); await page.goto(`${fixture}?mode=${mode}&workspace=${state.workspace}`);
  if (mode === 'detail') await expect(page.getByLabel('Template title', { exact: true })).toHaveValue(state.current.title);
  else if (mode === 'create') await expect(page.getByRole('region', { name: 'Saved template source' })).toBeVisible();
  else await expect(page.getByRole('region', { name: 'Your template library' })).toBeVisible();
}

test('private library supports search, status and real pages without loading other creators or writing', async ({ page }) => {
  const state = model();
  state.library = Array.from({ length: 21 }, (_, index) => ({ ...state.library[0], id: `${String(index + 1).padStart(8, '0')}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`, title: `Synthetic template ${String(index + 1).padStart(2, '0')}` }));
  await open(page, state, 'library');
  await expect(page.getByRole('link', { name: 'Open template', exact: true })).toHaveCount(20);
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Open template', exact: true })).toHaveCount(1);
  await page.getByLabel('Find a template', { exact: true }).fill('template 05');
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Your template library' })).toContainText('Synthetic template 05');
  await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled();
  await page.getByLabel('Template status', { exact: true }).selectOption('archived'); await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Your template library' })).toContainText('No private templates match');
  expect(state.creates.length + state.edits.length + state.uses.length).toBe(0);
});

test('saving a source as a template is explicit and confirmed reloads reuse its receipt', async ({ page }) => {
  const state = model(); await open(page, state, 'create');
  await expect(page.getByRole('region', { name: 'Saved template source' })).toContainText('Saved revision 3'); expect(state.creates).toHaveLength(0);
  await page.getByRole('button', { name: 'Save private template', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Open saved template' })).toHaveAttribute('href', `/teach/templates/${templateId}`);
  expect(state.creates[0]).toEqual({ operation: 'create_from_draft', sourceClassId: classId, sourceDraftId: draftId, expectedRevision: 3, requestKey: expect.any(String) });
  await page.reload(); await expect(page.getByRole('link', { name: 'Open saved template' })).toBeVisible(); expect(state.creates).toHaveLength(1); expect(state.uses).toHaveLength(0);
});

test('a lost template-create reply retries the exact source revision after source edits and retirement', async ({ page }) => {
  const state = model(); state.abortCreate = true; await open(page, state, 'create');
  await page.getByRole('button', { name: 'Save private template', exact: true }).click(); await expect(page.getByRole('alert', { name: 'Template save error' })).toBeVisible();
  state.source.source.revision = 4; state.source.source.questions[0].question = null; await page.reload();
  await page.getByRole('button', { name: 'Retry earlier template save', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Open saved template' })).toBeVisible(); expect(state.creates[1]).toEqual(state.creates[0]);
});

test('a source conflict remains visible and needs a refreshed preview and new explicit template request', async ({ page }) => {
  const state = model(); state.failure = { status: 409, code: 'template_conflict' }; await open(page, state, 'create');
  await page.getByRole('button', { name: 'Save private template', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'Template save error' })).toContainText('Synthetic request needs review');
  await expect(page.getByRole('region', { name: 'Saved template source' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save private template', exact: true })).toHaveCount(0);
  state.source.source.revision = 4; state.failure = null;
  await page.getByRole('button', { name: 'Retry template preview', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Saved template source' })).toContainText('Saved revision 4');
  expect(state.creates).toHaveLength(1);
  await page.getByRole('button', { name: 'Save private template', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Open saved template' })).toBeVisible();
  expect(state.creates[1].expectedRevision).toBe(4); expect(state.creates[1].requestKey).not.toBe(state.creates[0].requestKey);
});

test('edits append a version, old content stays read-only, and a chosen saved version creates a private class draft', async ({ page }) => {
  const state = model(); await open(page, state);
  await page.getByLabel('Template title', { exact: true }).fill('Edited reusable quiz');
  await page.getByRole('button', { name: 'Move template question 1 down', exact: true }).click();
  await page.getByLabel('Template points for question 1', { exact: true }).fill('2.25');
  await page.getByRole('button', { name: 'Save new version', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Template version preview' })).toContainText('Version 2 of 2');
  expect(state.edits[0]).toMatchObject({ operation: 'update', content: { title: 'Edited reusable quiz', questions: [{ questionVersionId: 'synthetic-template-item-2@1', maxUnits: 225 }, { questionVersionId: 'synthetic-template-item-1@1', maxUnits: 125 }] } });
  await page.getByLabel('Version to view', { exact: true }).fill('1'); await page.getByRole('button', { name: 'Load version', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Template version preview' })).toContainText('Version 1 of 2');
  await expect(page.getByLabel('Template title', { exact: true })).toHaveValue('Synthetic reusable quiz'); await expect(page.getByLabel('Template title', { exact: true })).toBeDisabled();
  await page.getByLabel('Destination class', { exact: true }).selectOption(destinationId); await page.getByRole('button', { name: 'Create class draft', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Open class draft' })).toHaveAttribute('href', `/teach/${destinationId}/assessments/${copyId}`);
  expect(state.uses[0]).toMatchObject({ version: 1, expectedRevision: 2, destinationClassId: destinationId }); expect(state.uses[0]).not.toHaveProperty('audience');
  await page.reload(); await expect(page.getByRole('link', { name: 'Open class draft' })).toBeVisible(); expect(state.uses).toHaveLength(1);
});

test('archive and restore preserve versions while blocking new edits and class drafts', async ({ page }) => {
  const state = model(); await open(page, state);
  await page.getByRole('button', { name: 'Archive template', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Template version preview' })).toContainText('archived');
  await expect(page.getByRole('button', { name: 'Create class draft', exact: true })).toBeDisabled(); await expect(page.getByLabel('Template title', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Restore template', exact: true }).click();
  await expect(page.getByLabel('Template title', { exact: true })).toBeEnabled(); expect(state.current.currentVersion).toBe(1); expect(state.current.revision).toBe(3); expect(state.uses).toHaveLength(0);
});

test('lost version-save replies keep the exact command after reload and recover the accepted new version', async ({ page }) => {
  const state = model(); state.abortEdit = true; await open(page, state);
  await page.getByLabel('Template title', { exact: true }).fill('Preserved pending version'); await page.getByRole('button', { name: 'Save new version', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'Template action error' })).toBeVisible(); await page.reload();
  await page.getByRole('button', { name: 'Retry earlier template request', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Pending template request' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save new version', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Template title', { exact: true })).toHaveValue('Preserved pending version'); expect(state.edits[1]).toEqual(state.edits[0]); expect(state.current.currentVersion).toBe(2);
});

test('an older confirmed receipt preserves browser edits when a newer server version needs comparison', async ({ page }) => {
  const state = model(); state.abortEdit = true; await open(page, state);
  await page.getByLabel('Template title', { exact: true }).fill('Earlier accepted browser version'); await page.getByRole('button', { name: 'Save new version', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'Template action error' })).toBeVisible(); newer(state, 'Newer other-device version'); await page.reload();
  await page.getByRole('button', { name: 'Retry earlier template request', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Template comparison required' })).toBeVisible(); await expect(page.getByLabel('Template title', { exact: true })).toHaveValue('Earlier accepted browser version');
  await page.getByRole('button', { name: 'Load preview and keep browser copy', exact: true }).click();
  await expect(page.getByLabel('Template title', { exact: true })).toHaveValue('Newer other-device version');
  await page.getByText('Preserved browser content', { exact: true }).click(); await expect(page.locator('details').filter({ hasText: 'Preserved browser content' })).toContainText('Earlier accepted browser version'); expect(state.edits).toHaveLength(2);
});

test('a refreshed revision cannot silently rebase dirty browser content into a new write', async ({ page }) => {
  const state = model(); await open(page, state); await page.getByLabel('Template title', { exact: true }).fill('Unsaved browser content');
  await page.evaluate(() => {
    const observer = new MutationObserver(() => {
      if (document.querySelector('h1')?.textContent !== 'Concurrent saved version') return;
      const save = [...document.querySelectorAll('button')].find(button => button.textContent === 'Save new version');
      save?.click(); document.documentElement.dataset.templateRaceAttempt = 'yes'; observer.disconnect();
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  newer(state, 'Concurrent saved version');
  await page.getByRole('button', { name: 'Refresh template', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-template-race-attempt', 'yes');
  await expect(page.getByRole('region', { name: 'Template comparison required' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save new version', exact: true })).toBeDisabled(); await expect(page.getByRole('button', { name: 'Create class draft', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Template title', { exact: true })).toHaveValue('Unsaved browser content'); expect(state.edits).toHaveLength(0);
});

test('an accepted class-draft request is recoverable after archival and catalog retirement', async ({ page }) => {
  const state = model(); state.abortUse = true; await open(page, state);
  await page.getByLabel('Destination class', { exact: true }).selectOption(destinationId); await page.getByRole('button', { name: 'Create class draft', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'Template action error' })).toBeVisible(); state.current.status = 'archived'; state.current.revision++; state.catalog = [];
  await page.reload(); await page.getByRole('button', { name: 'Retry earlier template request', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Open class draft' })).toHaveAttribute('href', `/teach/${destinationId}/assessments/${copyId}`); expect(state.uses[1]).toEqual(state.uses[0]);
});

test('unavailable questions require an explicit repair version rather than silent replacement', async ({ page }) => {
  const state = model(); state.catalog = state.catalog.slice(1); await open(page, state);
  await expect(page.getByRole('button', { name: 'Create class draft', exact: true })).toBeDisabled(); await expect(page.getByRole('list', { name: 'Template questions', exact: true })).toContainText('Unavailable question version');
  await page.getByRole('button', { name: 'Remove template question 1', exact: true }).click(); await page.getByRole('button', { name: 'Save new version', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Template version preview' })).toContainText('Version 2 of 2'); expect(state.current.questions).toHaveLength(1); expect(state.versions.get(1)!.questions).toHaveLength(2);
});

test('owner changes hide the previous template and stop further requests', async ({ page }) => {
  const state = model(); await open(page, state); state.readFailure = { status: 409, code: 'owner_changed' };
  await page.getByRole('button', { name: 'Refresh template', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'Template access error' })).toContainText('account changed'); await expect(page.getByRole('region', { name: 'Template version preview' })).toHaveCount(0);
  const reads = state.reads.length; await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await page.waitForTimeout(100); expect(state.reads).toHaveLength(reads); expect(state.edits.length + state.uses.length).toBe(0);
});

test('permission loss and forged private projections never render cached template content', async ({ page }) => {
  const state = model(); await open(page, state); state.readFailure = { status: 404, code: 'not_found' };
  await page.getByRole('button', { name: 'Refresh template', exact: true }).click(); await expect(page.getByRole('region', { name: 'Template version preview' })).toHaveCount(0);
  state.readFailure = null; state.privateField = true; await page.getByRole('button', { name: 'Retry template preview', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'Template access error' })).toContainText('could not be verified'); expect(await page.content()).not.toContain('FORGED_PRIVATE_TEMPLATE_DATA');
});

test('late class-draft replies after blur stay pending until a verified exact retry', async ({ page }) => {
  const state = model(); state.holdUse = true; await open(page, state); await page.getByRole('button', { name: 'Create class draft', exact: true }).click();
  await expect.poll(() => Boolean(state.release)).toBe(true); await page.evaluate(() => window.dispatchEvent(new Event('blur'))); state.release!();
  await expect(page.getByRole('button', { name: 'Retry template preview', exact: true })).toBeEnabled(); await expect(page.getByRole('link', { name: 'Open class draft' })).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await page.getByRole('button', { name: 'Retry earlier template request', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Open class draft' })).toBeVisible(); expect(state.uses[1]).toEqual(state.uses[0]);
});

test('administrator templates use the same private ownership and explicit destination contract', async ({ page }) => {
  const state = model('admin'); await open(page, state); await page.getByLabel('Destination class', { exact: true }).selectOption(destinationId);
  await page.getByRole('button', { name: 'Create class draft', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Open class draft' })).toHaveAttribute('href', `/admin/classes/${destinationId}/assessments/${copyId}`); expect(state.uses).toHaveLength(1);
});

test('mobile template review and editing preserve keyboard access, layout and private question projection', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); const state = model(); await open(page, state);
  await page.getByLabel('Template title', { exact: true }).focus(); await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type('Keyboard template edit');
  await expect(page.getByLabel('Template title', { exact: true })).toHaveValue('Keyboard template edit');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const marker of ['correctOptionId', 'misconceptionTags', 'ownerId', 'joinCode', 'learnerId']) expect(await page.content()).not.toContain(marker);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: '../../.local-docs/evidence/assessment-template-mobile.png', fullPage: true });
});
