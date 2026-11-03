import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { AssignmentGradeReleasePreview, AssignmentGradeReleaseReceipt, ClassResultsSharingReceipt, GradeReleaseAssignment, GradeReleaseResponseDetail, GradeReleaseRosterRow, SharedGradeResponseDetail, StoredGradebookGrade } from '@leetcode-app/database';
import type { PendingGradeAction } from '../src/lib/grade-release-client';

const fixture = '/test-support/class-grade-release';
const actorId = '11111111-1111-4111-8111-111111111111', classId = '22222222-2222-4222-8222-222222222222';
const assignmentIds = ['33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555'];
const stamp = '2026-11-02T18:00:00.000Z';
const uid = (prefix: string, value: number) => `${prefix}${value.toString(16).padStart(7, '0')}-0000-4000-8000-${value.toString(16).padStart(12, '0')}`;
type ReleaseBody = Extract<PendingGradeAction, { kind: 'release' }>['body'];
type SharingBody = Exclude<PendingGradeAction, { kind: 'release' }>['body'];
type DraftBody = { attemptId: string; expectedGradeRevisionId: string | null; criterionScores: Record<string, number>; learnerFeedback: string; privateNote: string; requestKey: string };

function preview(index: number): AssignmentGradeReleasePreview {
  const kinds = ['problem', 'quiz', 'written'] as const;
  const assignment: GradeReleaseAssignment = { id: assignmentIds[index], title: ['Week one practice', 'Map lookup quiz', 'Written invariant explanation'][index],
    kind: kinds[index], instructions: 'Review the frozen submitted work.', dueOn: null, closesAt: null, maxUnits: 10000, policyVersionId: uid('f', index + 1) };
  const content = index === 1 ? { prompt: 'Choose the data structure used for lookup.', questions: [{ id: uid('9', 1), title: 'Lookup choice', prompt: 'Which structure gives expected constant-time lookup?', maxUnits: 10000,
    options: [{ id: 'hashmap', text: 'Hash map' }, { id: 'sorted-array', text: 'Sorted array with binary search' }] }] }
    : { prompt: index === 2 ? 'Explain why checking the complement before storing preserves distinct positions.' : 'Find two distinct positions whose values sum to a target.', questions: [] };
  const students = [
    { name: 'Ada Ready', units: 9500, state: 'draft', ready: true },
    { name: 'Bea Ready', units: 8000, state: 'draft', ready: true },
    { name: 'Cam Released', units: 9000, state: 'published', ready: false },
    { name: 'Dia Missing', units: null, state: 'unsubmitted', ready: false },
    { name: 'Eli Excused', units: null, state: 'excused', ready: false },
    { name: 'Fay Withdrawn', units: 7000, state: 'draft', ready: false },
    { name: 'Gus Ungraded', units: null, state: 'needs_review', ready: false },
    { name: 'Zed Zero', units: 0, state: 'draft', ready: true },
  ] as const;
  const roster: GradeReleaseRosterRow[] = students.map((student, position) => {
    const offset = index * 20 + position + 1, recipientId = uid('b', offset), gradeRevisionId = uid('c', offset);
    return { learner: { id: uid('a', position + 1), displayName: student.name, email: null }, membership: position === 5 ? 'withdrawn' : 'included',
      recipientId, state: student.state, earnedUnits: student.units, maxUnits: 10000, ready: student.ready,
      reason: student.ready ? null : position === 2 ? 'Already released' : position === 3 ? 'No submitted response' : position === 4 ? 'Excused from this assignment' : position === 5 ? 'No longer enrolled' : 'Awaiting a saved grade',
      releaseTarget: student.ready ? { recipientId, gradeRevisionId, expectedPublicationSequence: 0 } : null,
      shareTarget: position === 2 ? { recipientId, gradeRevisionId, publicationId: uid('d', offset), attemptId: uid('e', offset) } : null,
      response: null };
  });
  return { classroom: { id: classId, name: 'Synthetic algorithms class' }, assignment, content, roster, archived: false, sharing: null };
}

function model(workspace: 'admin' | 'teach' = 'admin') {
  return { workspace, previews: assignmentIds.map((_, index) => preview(index)), previewGets: [] as string[], detailGets: [] as string[],
    releases: [] as { assignmentId: string; body: ReleaseBody }[], sharing: [] as { assignmentId: string; body: SharingBody }[],
    receipts: new Map<string, { body: unknown; receipt: AssignmentGradeReleaseReceipt | ClassResultsSharingReceipt }>(),
    drafts: [] as DraftBody[], draftReceipt: null as { body: DraftBody; grade: StoredGradebookGrade } | null, malformedDraft: null as 'actor' | 'score' | null,
    abortRelease: false, abortSharing: false, malformedRelease: false, changedAccount: false, staleRelease: false };
}
type Model = ReturnType<typeof model>;

function detail(view: AssignmentGradeReleasePreview, row: GradeReleaseRosterRow): GradeReleaseResponseDetail {
  const hasResponse = !['unsubmitted', 'excused'].includes(row.state);
  return { classroom: view.classroom, assignment: view.assignment, content: view.content, learner: row.learner, recipientId: row.recipientId!, state: row.state,
    response: hasResponse ? { attemptId: uid('e', Number.parseInt(row.recipientId!.slice(1, 8), 16)), sequence: 1, submittedAt: stamp,
      text: view.assignment.kind === 'quiz' ? null : view.assignment.kind === 'written' ? 'The map contains only earlier positions, so the current element cannot pair with itself.' : 'Record previously seen values in a map and check each complement before storing the current value.',
      language: view.assignment.kind === 'quiz' ? null : 'text', answers: view.assignment.kind === 'quiz' ? { [uid('9', 1)]: 'hashmap' } : {} } : null,
    grade: row.earnedUnits === null ? null : { id: row.releaseTarget?.gradeRevisionId ?? row.shareTarget?.gradeRevisionId ?? uid('c', 99), earnedUnits: row.earnedUnits,
      maxUnits: row.maxUnits, criterionScores: {}, learnerFeedback: '', published: row.state === 'published', publicationSequence: row.state === 'published' ? 1 : 0 }, releaseTarget: row.releaseTarget };
}

async function connect(page: Page, state: Model) {
  await page.route('**/api/class-gradebook/**', async route => {
    const request = route.request(), url = new URL(request.url());
    expect(request.headers()['x-assessment-author']).toBe(actorId);
    expect(url.searchParams.get('workspace')).toBe(state.workspace);
    if (state.changedAccount) { await route.fulfill({ status: 409, json: { code: 'owner_changed', message: 'Synthetic account changed.' } }); return; }
    if (url.pathname.endsWith('/draft-grade')) {
      expect(request.method()).toBe('POST');
      const body = request.postDataJSON() as DraftBody; state.drafts.push(structuredClone(body));
      expect(Object.keys(body).sort()).toEqual(['attemptId', 'criterionScores', 'expectedGradeRevisionId', 'learnerFeedback', 'privateNote', 'requestKey']);
      expect(body.attemptId).toBe(uid('e', 1));
      expect(body.expectedGradeRevisionId).toBeNull();
      if (state.draftReceipt) expect(body).toEqual(state.draftReceipt.body);
      else {
        const earnedUnits = Object.values(body.criterionScores).reduce((sum, value) => sum + value, 0);
        state.draftReceipt = { body: structuredClone(body), grade: { id: uid('c', 1), sequence: 1, kind: 'scored', attemptId: body.attemptId, earnedUnits,
          criterionScores: structuredClone(body.criterionScores), learnerFeedback: body.learnerFeedback, privateNote: body.privateNote, createdAt: stamp } };
        state.previews[0].roster[0].earnedUnits = earnedUnits;
      }
      const grade = structuredClone(state.draftReceipt.grade);
      const malformed = state.malformedDraft; state.malformedDraft = null;
      if (malformed === 'score') grade.earnedUnits -= 100;
      await route.fulfill({ json: { actorId: malformed === 'actor' ? uid('1', 20) : actorId, grade } }); return;
    }
    if (url.pathname.includes('/recipients/')) {
      const recipientId = url.pathname.split('/recipients/')[1]; state.detailGets.push(recipientId);
      const view = state.previews.find(item => item.roster.some(row => row.recipientId === recipientId))!;
      const row = view.roster.find(item => item.recipientId === recipientId)!;
      await route.fulfill({ json: { actorId, detail: detail(view, row) } }); return;
    }
    const assignmentId = url.pathname.split('/assignments/')[1]?.split('/')[0];
    const view = state.previews.find(item => item.assignment.id === assignmentId)!;
    if (request.method() === 'GET') { state.previewGets.push(assignmentId); await route.fulfill({ json: { actorId, preview: structuredClone(view) } }); return; }
    const body = request.postDataJSON() as ReleaseBody | SharingBody;
    const releasing = url.pathname.endsWith('/releases');
    if (releasing) state.releases.push({ assignmentId, body: structuredClone(body as ReleaseBody) });
    else state.sharing.push({ assignmentId, body: structuredClone(body as SharingBody) });
    if (releasing && state.staleRelease) { state.staleRelease = false; await route.fulfill({ status: 409, json: { message: 'The saved grade changed. Review the latest scores.' } }); return; }
    let accepted = state.receipts.get(body.requestKey);
    if (accepted) expect(accepted.body).toEqual(body);
    if (!accepted) {
      if (releasing) {
        const command = body as ReleaseBody;
        const publications = command.targets.map((target, index) => {
          const row = view.roster.find(item => item.recipientId === target.recipientId)!;
          expect(row.ready).toBe(true); expect(row.releaseTarget).toEqual(target);
          const publication = { id: uid('d', 100 + state.releases.length * 10 + index), gradeRevisionId: target.gradeRevisionId,
            sequence: target.expectedPublicationSequence + 1, publishedAt: stamp };
          row.ready = false; row.state = 'published'; row.reason = 'Already released'; row.releaseTarget = null;
          row.shareTarget = { recipientId: target.recipientId, gradeRevisionId: target.gradeRevisionId, publicationId: publication.id, attemptId: uid('e', Number.parseInt(target.recipientId.slice(1, 8), 16)) };
          return { recipientId: target.recipientId, publication };
        });
        accepted = { body: structuredClone(body), receipt: { id: uid('8', state.releases.length), classId, assignmentId, actorId, createdAt: stamp, publications } };
      } else {
        const command = body as SharingBody;
        expect(command.expectedSharingSequence).toBe(view.sharing?.sequence ?? 0);
        const receipt: ClassResultsSharingReceipt = { id: uid('7', state.sharing.length), sequence: command.expectedSharingSequence + 1, classId, assignmentId,
          shared: command.action === 'publish', recipientCount: command.action === 'publish' ? command.targets.length : 0, createdAt: stamp };
        view.sharing = receipt; accepted = { body: structuredClone(body), receipt };
      }
      state.receipts.set(body.requestKey, structuredClone(accepted));
    }
    if (releasing && state.abortRelease) { state.abortRelease = false; await route.abort('failed'); return; }
    if (!releasing && state.abortSharing) { state.abortSharing = false; await route.abort('failed'); return; }
    if (releasing && state.malformedRelease) { state.malformedRelease = false; await route.fulfill({ json: { actorId, receipt: { ...accepted.receipt, classId: uid('1', 90) } } }); return; }
    await route.fulfill({ json: { actorId, receipt: structuredClone(accepted.receipt) } });
  });
}

async function open(page: Page, state: Model) {
  await connect(page, state);
  await page.goto(`${fixture}?workspace=${state.workspace}`);
  await page.getByRole('button', { name: 'Review scores and responses', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Assignment score roster' })).toBeVisible();
}
const releaseConfirmation = (page: Page) => page.getByRole('checkbox', { name: 'I reviewed the saved scores and want to release the selected grades privately to those learners.', exact: true });
const shareConfirmation = (page: Page) => page.getByRole('checkbox', { name: 'I want current class members to see these selected students’ names, released scores, questions and submitted answers.', exact: true });

for (const workspace of ['admin', 'teach'] as const) {
  test(`${workspace} reviews the complete roster and lazily opens frozen questions and answers`, async ({ page }) => {
    const state = model(workspace); await open(page, state);
    const roster = page.getByRole('region', { name: 'Assignment score roster' });
    await expect(roster.getByRole('rowheader')).toHaveCount(8);
    await expect(roster.getByRole('row', { name: /Zed Zero/ })).toContainText('0 / 100');
    for (const name of ['Dia Missing', 'Eli Excused', 'Fay Withdrawn', 'Gus Ungraded']) await expect(page.getByRole('checkbox', { name: `Select ${name} for release`, exact: true })).toBeDisabled();
    await expect(roster.getByRole('row', { name: /Dia Missing/ })).toContainText('—');
    await expect(roster.getByRole('row', { name: /Eli Excused/ })).toContainText('—');
    expect(state.detailGets).toHaveLength(0);
    await page.getByRole('button', { name: "View Ada Ready's questions and answer", exact: true }).click();
    const response = page.getByRole('region', { name: 'Response for Ada Ready' });
    await expect(response).toBeFocused();
    await expect(response).toContainText('Find two distinct positions whose values sum to a target.');
    await expect(response).toContainText('Record previously seen values in a map');
    await expect(response).toContainText('95 / 100 · Private saved grade');
    expect(state.detailGets).toEqual([state.previews[0].roster[0].recipientId]);
    await expect(response.getByRole('link', { name: 'Open grading review' })).toHaveAttribute('href', workspace === 'admin'
      ? `/admin/classes/${classId}/grades/recipients/${state.previews[0].roster[0].recipientId}` : `/teach/${classId}/submissions/${state.previews[0].roster[0].recipientId}`);
    expect(state.releases).toHaveLength(0); expect(state.sharing).toHaveLength(0);
  });
}

test('individual and all-ready releases use the reviewed targets and keep class sharing private', async ({ page }) => {
  const state = model(); await open(page, state);
  const first = structuredClone(state.previews[0].roster[0].releaseTarget);
  await expect(page.getByRole('button', { name: "Release Ada Ready's grade", exact: true })).toBeDisabled();
  await releaseConfirmation(page).check();
  await page.getByRole('button', { name: "Release Ada Ready's grade", exact: true }).click();
  await expect(page.getByRole('status', { name: 'Grade release status' })).toContainText('1 grade released privately to learners.');
  expect(state.releases[0].body.targets).toEqual([first]);
  const remaining = state.previews[0].roster.filter(row => row.ready).map(row => row.releaseTarget);
  await releaseConfirmation(page).check();
  await page.getByRole('button', { name: 'Release all ready grades (2)', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Grade release status' })).toContainText('2 grades released privately to learners.');
  expect(state.releases[1].body.targets).toEqual(remaining);
  expect(state.releases[1].body.targets.map(item => item.recipientId)).toContain(state.previews[0].roster[7].recipientId);
  expect(state.sharing).toHaveLength(0); expect(state.previews[0].sharing).toBeNull();
});

test('selected release excludes unchecked ready records and never sends missing or excused students', async ({ page }) => {
  const state = model(); await open(page, state);
  await page.getByRole('checkbox', { name: 'Select Zed Zero for release', exact: true }).uncheck();
  await releaseConfirmation(page).check();
  await page.getByRole('button', { name: 'Release selected grades (2)', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Grade release status' })).toContainText('2 grades released');
  expect(state.releases[0].body.targets.map(item => item.recipientId)).toEqual(state.previews[0].roster.slice(0, 2).map(item => item.recipientId));
  await expect(page.getByRole('checkbox', { name: 'Select Zed Zero for release', exact: true })).toBeChecked();
});

test('quiz and written assignments show their pinned submitted answers', async ({ page }) => {
  const state = model(); await open(page, state);
  await page.getByRole('combobox', { name: 'Assignment to review', exact: true }).selectOption(assignmentIds[1]);
  await page.getByRole('button', { name: 'Review scores and responses', exact: true }).click();
  await page.getByRole('button', { name: "View Cam Released's questions and answer", exact: true }).click();
  const quiz = page.getByRole('region', { name: 'Response for Cam Released' });
  await expect(quiz).toContainText('Which structure gives expected constant-time lookup?');
  await expect(quiz.getByRole('listitem').filter({ hasText: 'Hash map' })).toContainText('Submitted choice');
  await page.getByRole('combobox', { name: 'Assignment to review', exact: true }).selectOption(assignmentIds[2]);
  await page.getByRole('button', { name: 'Review scores and responses', exact: true }).click();
  await page.getByRole('button', { name: "View Ada Ready's questions and answer", exact: true }).click();
  const written = page.getByRole('region', { name: 'Response for Ada Ready' });
  await expect(written).toContainText('Explain why checking the complement before storing preserves distinct positions.');
  await expect(written).toContainText('The map contains only earlier positions');
});

test('class sharing has a separate disclosure confirmation and revokes without changing private releases', async ({ page }) => {
  const state = model(); await open(page, state);
  await page.getByRole('button', { name: 'Class sharing', exact: true }).click();
  await expect(page.getByText('Class results are private', { exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Select Ada Ready for class sharing', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Share class results (1)', exact: true })).toBeDisabled();
  await shareConfirmation(page).check();
  await page.getByRole('button', { name: 'Share class results (1)', exact: true }).click();
  await expect(page.getByText('1 records shared with this class', { exact: true })).toBeVisible();
  expect(state.sharing[0].body).toMatchObject({ action: 'publish', expectedSharingSequence: 0, targets: [state.previews[0].roster[2].shareTarget] });
  await page.getByRole('button', { name: 'Revoke class sharing', exact: true }).click();
  await expect(page.getByText('Class results are private', { exact: true })).toBeVisible();
  expect(state.sharing[1].body).toMatchObject({ action: 'revoke', expectedSharingSequence: 1 });
  expect(state.releases).toHaveLength(0);
  expect(state.previews[0].roster[2].state).toBe('published');
});

test('a lost release response survives reload and retries the original reviewed command', async ({ page }) => {
  const state = model(); state.abortRelease = true; await open(page, state);
  await releaseConfirmation(page).check();
  await page.getByRole('button', { name: 'Release all ready grades (3)', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry original request', exact: true })).toBeEnabled();
  const original = structuredClone(state.releases[0]);
  await page.reload();
  await expect(page.getByRole('status', { name: 'Grade release status' })).toContainText('An earlier request needs confirmation');
  await expect(page.getByRole('button', { name: 'Review scores and responses', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Retry original request', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Grade release status' })).toContainText('3 grades released privately');
  expect(state.releases[1]).toEqual(original);
  await expect.poll(() => page.evaluate(({ actorId, classId }) => sessionStorage.getItem(`method:class-grade-action:${actorId}:admin:${classId}`), { actorId, classId })).toBeNull();
});

test('a malformed receipt retains the pending command until the original receipt is recovered', async ({ page }) => {
  const state = model(); state.malformedRelease = true; await open(page, state);
  await releaseConfirmation(page).check();
  await page.getByRole('button', { name: 'Release all ready grades (3)', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'Grade release status' })).toContainText('Could not confirm the request');
  await expect(page.getByText('Original release of 3 grades is retained for recovery.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Retry original request', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Grade release status' })).toContainText('3 grades released privately');
  expect(state.releases[1]).toEqual(state.releases[0]);
});

test('a lost class-sharing response recovers the original selected evidence after reload', async ({ page }) => {
  const state = model(); state.abortSharing = true; await open(page, state);
  await page.getByRole('button', { name: 'Class sharing', exact: true }).click();
  await shareConfirmation(page).check();
  await page.getByRole('button', { name: 'Share class results (1)', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry original request', exact: true })).toBeEnabled();
  const original = structuredClone(state.sharing[0]);
  state.previews[0].roster[2].shareTarget = { ...state.previews[0].roster[2].shareTarget!, gradeRevisionId: uid('c', 200), publicationId: uid('d', 200) };
  await page.reload();
  await page.getByRole('button', { name: 'Retry original request', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Grade release status' })).toContainText('Class-sharing request confirmed');
  expect(state.sharing[1]).toEqual(original);
  expect(state.sharing).toHaveLength(2);
});

test('a stale saved grade blocks automatic retry and requires a fresh review', async ({ page }) => {
  const state = model(); state.staleRelease = true; await open(page, state);
  await releaseConfirmation(page).check();
  await page.getByRole('button', { name: 'Release all ready grades (3)', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'Grade release status' })).toContainText('The saved grade changed');
  await expect(page.getByRole('button', { name: 'Retry original request', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Review latest saved grades', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry original request', exact: true })).toHaveCount(0);
  await expect(releaseConfirmation(page)).not.toBeChecked();
  expect(state.releases).toHaveLength(1);
});

test('account changes hide the old roster and disable pending mutations', async ({ page }) => {
  const state = model(); await open(page, state);
  await releaseConfirmation(page).check(); state.changedAccount = true;
  await page.getByRole('button', { name: 'Release all ready grades (3)', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'Grade release status' })).toContainText('Your account changed');
  await expect(page.getByRole('region', { name: 'Assignment score roster' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Retry original request', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Review scores and responses', exact: true })).toBeDisabled();
  await expect(page.getByRole('combobox', { name: 'Assignment to review', exact: true })).toBeDisabled();
});

test('larger classes paginate the full roster and searching returns to the first page', async ({ page }) => {
  const state = model();
  for (let index = 1; index <= 52; index += 1) state.previews[0].roster.push({ learner: { id: uid('a', 300 + index), displayName: `ZZ Cohort ${String(index).padStart(2, '0')}`, email: null },
    recipientId: uid('b', 300 + index), membership: 'included', state: 'unsubmitted', earnedUnits: null, maxUnits: 10000, ready: false,
    reason: 'No submitted response', releaseTarget: null, shareTarget: null, response: null });
  await open(page, state);
  const roster = page.getByRole('region', { name: 'Assignment score roster' });
  await expect(roster.getByRole('rowheader')).toHaveCount(50);
  await page.getByRole('button', { name: 'Next students', exact: true }).click();
  await expect(roster.getByRole('rowheader')).toHaveCount(10);
  await expect(roster.getByRole('rowheader', { name: 'ZZ Cohort 52', exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Find a student', exact: true }).fill('Ada Ready');
  await expect(roster.getByRole('rowheader')).toHaveCount(1);
  await expect(roster.getByRole('rowheader', { name: 'Ada Ready', exact: true })).toBeVisible();
  await expect(page.getByText('1 students · 3 selected · Page 1 of 1', { exact: true })).toBeVisible();
});

test('phone users can review and release scores without page overflow or accessibility violations', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = model(); await open(page, state);
  await page.getByRole('button', { name: "View Ada Ready's questions and answer", exact: true }).click();
  await expect(page.getByRole('region', { name: 'Response for Ada Ready' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: '../../.local-docs/screens/class-grade-release-phone.png', fullPage: true });
  await page.getByRole('button', { name: 'Close response', exact: true }).click();
  await releaseConfirmation(page).check();
  await page.getByRole('button', { name: 'Release all ready grades (3)', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Grade release status' })).toContainText('3 grades released privately');
});

async function connectShared(page: Page, state: { revoked: boolean; changedVersion: boolean; details: string[]; refreshes: number }) {
  const learnerId = uid('a', 1), view = preview(0);
  page.on('request', request => { if (new URL(request.url()).pathname === fixture && request.headers().rsc === '1') state.refreshes += 1; });
  await page.route('**/api/class-gradebook/**/shared-results/*', async route => {
    expect(route.request().headers()['x-assessment-author']).toBe(learnerId);
    expect(route.request().method()).toBe('GET');
    const recipientId = new URL(route.request().url()).pathname.split('/shared-results/')[1];
    state.details.push(recipientId);
    if (state.revoked) { await route.fulfill({ status: 404, json: { actorId: learnerId, message: 'Sharing was revoked for this assignment.' } }); return; }
    const source = detail(view, view.roster.find(row => row.recipientId === recipientId)!);
    const shared: SharedGradeResponseDetail & { sharing: ClassResultsSharingReceipt } = { classroom: source.classroom, assignment: source.assignment, content: source.content,
      learner: { id: source.learner.id, displayName: source.learner.displayName }, recipientId, response: source.response, earnedUnits: source.grade!.earnedUnits, maxUnits: source.grade!.maxUnits,
      sharing: { id: uid('6', state.changedVersion ? 2 : 1), sequence: state.changedVersion ? 2 : 1, classId, assignmentId: assignmentIds[0], shared: true, recipientCount: 3, createdAt: stamp } };
    await route.fulfill({ json: { actorId: learnerId, detail: shared } });
  });
}

test('classmates see named released scores and request submitted answers only when opening a record', async ({ page }) => {
  const state = { revoked: false, changedVersion: false, details: [] as string[], refreshes: 0 };
  await connectShared(page, state); await page.goto(`${fixture}?view=shared`);
  const roster = page.getByRole('region', { name: 'Shared class scores', exact: true });
  expect(await roster.getByRole('rowheader').allTextContents()).toEqual(['Ada Ready', 'Cam Released', 'Bea Ready']);
  await page.getByRole('combobox', { name: 'Sort shared results', exact: true }).selectOption('score_asc');
  expect((await roster.getByRole('rowheader').allTextContents())[0]).toBe('Bea Ready');
  expect(state.details).toHaveLength(0);
  await expect(page.getByText('Record previously seen values in a map', { exact: false })).toHaveCount(0);
  await page.getByRole('button', { name: "View Ada Ready's shared answers", exact: true }).click();
  const response = page.getByRole('region', { name: 'Shared response for Ada Ready', exact: true });
  await expect(response).toBeFocused();
  await expect(response).toContainText('Find two distinct positions whose values sum to a target.');
  await expect(response).toContainText('Record previously seen values in a map');
  expect(state.details).toEqual([uid('b', 1)]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: '../../.local-docs/screens/class-shared-results-phone.png', fullPage: true });
});

test('revoked shared results clear the previously visible named roster', async ({ page }) => {
  const state = { revoked: false, changedVersion: false, details: [] as string[], refreshes: 0 };
  await connectShared(page, state); await page.goto(`${fixture}?view=shared`);
  await expect(page.getByRole('region', { name: 'Shared class scores', exact: true })).toBeVisible();
  state.revoked = true;
  await page.getByRole('button', { name: "View Ada Ready's shared answers", exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Sharing was revoked' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Shared class scores', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Shared response for Ada Ready', exact: true })).toHaveCount(0);
  await expect(page.getByRole('rowheader')).toHaveCount(0);
});

test('a changed sharing version refreshes instead of mixing new answers with the old roster', async ({ page }) => {
  const state = { revoked: false, changedVersion: true, details: [] as string[], refreshes: 0 };
  await connectShared(page, state); await page.goto(`${fixture}?view=shared`);
  const previousRefreshes = state.refreshes;
  await page.getByRole('button', { name: "View Ada Ready's shared answers", exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Class results changed' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Shared response for Ada Ready', exact: true })).toHaveCount(0);
  await expect(page.getByText('Record previously seen values in a map', { exact: false })).toHaveCount(0);
  await expect.poll(() => state.refreshes).toBeGreaterThan(previousRefreshes);
});

async function enterManualGrade(page: Page) {
  await page.getByLabel('Reasoning', { exact: true }).fill('50');
  await page.getByLabel('Complexity', { exact: true }).fill('35');
  await page.getByLabel('Feedback for learner', { exact: true }).fill('Synthetic learner feedback.');
  await page.getByLabel('Private instructor notes', { exact: true }).fill('Synthetic private review note.');
}

test('an admin saves the reviewed rubric through the scoped POST route and publishes one exact saved grade', async ({ page }) => {
  const state = model(); await connect(page, state); await page.goto(`${fixture}?view=admin-review`);
  await enterManualGrade(page);
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('Draft saved. Learners cannot see it until you publish.', { exact: true })).toBeVisible();
  expect(state.drafts[0]).toMatchObject({ attemptId: uid('e', 1), expectedGradeRevisionId: null, criterionScores: { reasoning: 5000, complexity: 3500 }, learnerFeedback: 'Synthetic learner feedback.', privateNote: 'Synthetic private review note.' });
  await page.getByRole('button', { name: 'Publish grade', exact: true }).click();
  await expect(page.getByText('Grade published to the learner.', { exact: true })).toBeVisible();
  expect(state.releases[0].body.targets).toEqual([{ recipientId: uid('b', 1), gradeRevisionId: uid('c', 1), expectedPublicationSequence: 0 }]);
  await expect(page.getByRole('button', { name: 'Publish grade', exact: true })).toBeDisabled();
  await expect(page.getByText('published', { exact: true })).toBeVisible();
});

for (const malformed of ['actor', 'score'] as const) {
  test(`admin draft receipt rejects a different ${malformed} and retries the original save`, async ({ page }) => {
    const state = model(); state.malformedDraft = malformed; await connect(page, state); await page.goto(`${fixture}?view=admin-review`);
    await enterManualGrade(page);
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.getByText('Unable to confirm the saved grade. Retry saving.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publish grade', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.getByText('Draft saved. Learners cannot see it until you publish.', { exact: true })).toBeVisible();
    expect(state.drafts[1]).toEqual(state.drafts[0]);
    expect(state.releases).toHaveLength(0);
  });
}

test('individual quiz release preserves its exact request after a lost response and reload', async ({ page }) => {
  const state = model(); state.abortRelease = true; await connect(page, state); await page.goto(`${fixture}?view=individual-quiz`);
  const release = page.getByRole('region', { name: 'Individual grade release', exact: true });
  await release.getByRole('checkbox', { name: 'I reviewed this saved score and want to release it privately to Ada Ready.', exact: true }).check();
  await release.getByRole('button', { name: 'Release this grade', exact: true }).click();
  await expect(release.getByRole('button', { name: 'Retry original grade release', exact: true })).toBeEnabled();
  const original = structuredClone(state.releases[0]);
  await page.reload();
  await expect(release.getByRole('status')).toContainText('An earlier grade release needs confirmation');
  await release.getByRole('button', { name: 'Retry original grade release', exact: true }).click();
  await expect(release.getByRole('status')).toContainText('Grade released privately to the learner.');
  await expect(release.getByRole('heading', { name: 'Released score', exact: true })).toBeVisible();
  expect(state.releases[1]).toEqual(original);
  expect(state.releases[1].assignmentId).toBe(assignmentIds[1]);
  expect(state.sharing).toHaveLength(0);
});
