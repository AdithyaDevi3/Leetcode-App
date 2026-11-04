import { describe, expect, it } from 'vitest';
import {
  ClassPortalInputError, classPortalId, classPortalQuery, classPortalWorkspace,
  classPortalSaveCommand, classPortalPublishCommand, classPortalArchiveCommand, classPortalReadCommand,
} from './class-portal-input';

const key = 'aaaaaaaa-abcd-4aaa-8aaa-aaaaaaaaaaaa';
const revisionId = 'bbbbbbbb-abcd-4bbb-8bbb-bbbbbbbbbbbb';
const save = () => ({ expectedSequence: 0, title: '  Class update  ', body: '  Keep this exact response.\n', requestKey: key });
const query = (text: string, list = false) => classPortalQuery(new Request(`http://local/class?${text}`), list);

describe('class portal request identities and query boundaries', () => {
  it('canonicalizes UUID identities and accepts only explicit workspaces', () => {
    expect(classPortalId(key.toUpperCase())).toBe(key);
    for (const workspace of ['learner', 'teach', 'admin']) expect(classPortalWorkspace(workspace)).toBe(workspace);
    for (const value of [null, '', 1, 'owner', 'administrator', 'Admin', {}, key + 'x']) {
      expect(() => classPortalWorkspace(value)).toThrow(ClassPortalInputError);
      expect(() => classPortalId(value)).toThrow(ClassPortalInputError);
    }
  });
  it('requires one workspace and rejects duplicates or unexpected query fields', () => {
    for (const text of ['', 'workspace=teach&workspace=admin', 'workspace=admin&actor=someone', 'workspace=learner&limit=2']) expect(() => query(text)).toThrow();
    expect(query('workspace=teach')).toEqual({ workspace: 'teach', options: {} });
  });
  it('parses bounded author pagination and canonical cursor pairs', () => {
    const at = '2026-11-04T12:30:00.000Z';
    expect(query(`workspace=admin&limit=50&state=archived&beforeAt=${at}&beforeId=${key.toUpperCase()}`, true)).toEqual({
      workspace: 'admin', options: { limit: 50, state: 'archived', cursor: { at, id: key } },
    });
    expect(query('workspace=learner', true)).toEqual({ workspace: 'learner', options: { limit: 25, state: 'current' } });
  });
  it.each(['limit=0', 'limit=51', 'limit=01', 'limit=1.5', 'limit=Infinity', 'limit=2&limit=3', 'state=anything',
    `beforeId=${key}`, 'beforeAt=2026-11-04T12:30:00.000Z', `beforeAt=2026-11-04&beforeId=${key}`, `beforeAt=bad&beforeId=${key}`])('rejects invalid pagination %s', part => {
    expect(() => query(`workspace=teach&${part}`, true)).toThrow(ClassPortalInputError);
  });
  it.each(['archived', 'all'])('keeps learner publication queries out of %s author state', state => {
    expect(() => query(`workspace=learner&state=${state}`, true)).toThrow(ClassPortalInputError);
  });
});

describe('class announcement command validation', () => {
  it('trims the title, preserves body whitespace and canonicalizes the request identity', () => {
    expect(classPortalSaveCommand({ ...save(), requestKey: key.toUpperCase() })).toEqual({ ...save(), title: 'Class update' });
    expect(classPortalPublishCommand({ expectedSequence: 1, revisionId, requestKey: key })).toEqual({ expectedSequence: 1, revisionId, requestKey: key });
    expect(classPortalArchiveCommand({ expectedSequence: 1, requestKey: key })).toEqual({ expectedSequence: 1, requestKey: key });
    expect(classPortalReadCommand({ publicationSequence: 2, requestKey: key })).toEqual({ publicationSequence: 2, requestKey: key });
  });
  it.each([null, [], {}, { ...save(), extra: true }, { ...save(), requestKey: 'read-key' }, { ...save(), title: ' ' },
    { ...save(), title: 'x'.repeat(161) }, { ...save(), body: ' ' }, { ...save(), body: 'x'.repeat(20_001) },
    { ...save(), body: '\u0000' }, { ...save(), body: '\ud800' }, { ...save(), title: '\udc00' }])('rejects malformed save fields %j', value => {
    expect(() => classPortalSaveCommand(value)).toThrow(ClassPortalInputError);
  });
  it('accepts a maximum-sized Unicode body without altering its content', () => {
    const body = '🧠'.repeat(10_000);
    expect(classPortalSaveCommand({ ...save(), body }).body).toBe(body);
  });
  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_647, '1', null])('rejects invalid author sequence %s', expectedSequence => {
    for (const parse of [classPortalSaveCommand, classPortalPublishCommand, classPortalArchiveCommand]) {
      const value = parse === classPortalSaveCommand ? save() : parse === classPortalPublishCommand ? { revisionId, requestKey: key } : { requestKey: key };
      expect(() => parse({ ...value, expectedSequence })).toThrow(ClassPortalInputError);
    }
  });
  it.each([0, -1, 0.5, '1', null])('requires a positive displayed publication sequence %s', publicationSequence => {
    expect(() => classPortalReadCommand({ publicationSequence, requestKey: key })).toThrow(ClassPortalInputError);
  });
  it('rejects unreviewed fields and inherited command objects', () => {
    expect(() => classPortalArchiveCommand({ expectedSequence: 1, requestKey: key, revisionId })).toThrow();
    expect(() => classPortalReadCommand({ publicationSequence: 1, requestKey: key, learnerId: key })).toThrow();
    expect(() => classPortalPublishCommand({ expectedSequence: 1, requestKey: key, revisionId: 'invalid' })).toThrow();
    expect(() => classPortalSaveCommand(Object.assign(Object.create({ title: 'inherited' }), save()))).toThrow();
  });
});
