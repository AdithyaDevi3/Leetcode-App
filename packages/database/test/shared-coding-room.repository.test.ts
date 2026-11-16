import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { createDatabaseClient, type DatabaseClient, type DatabaseConfig } from '../src/client.js';
import { runMigrations } from '../src/migrations/index.js';
import { PostgresClassroomRepository } from '../src/repositories/classroom.repository.js';
import { PostgresSharedCodingRoomRepository, SharedCodingRoomAccessError, SharedCodingRoomConflictError, SharedCodingRoomValidationError } from '../src/repositories/shared-coding-room.repository.js';
import { prepareSupabaseTestDatabase } from './support/supabase.js';

let container: StartedTestContainer, db: DatabaseClient, config: DatabaseConfig;
beforeAll(async () => {
  container = await new GenericContainer('postgres:16-alpine').withEnvironment({ POSTGRES_USER: 'test', POSTGRES_PASSWORD: 'test', POSTGRES_DB: 'testdb' }).withExposedPorts(5432).start();
  config = { host: container.getHost(), port: container.getMappedPort(5432), database: 'testdb', user: 'test', password: 'test' };
  db = createDatabaseClient(config); await prepareSupabaseTestDatabase(db); await runMigrations(config);
}, 60_000);
afterEach(async () => { await db?.query('TRUNCATE users,classrooms CASCADE'); });
afterAll(async () => { await db?.close(); await container?.stop(); });

async function person(role: 'learner' | 'instructor' = 'learner') {
  return (await db.query<{ id: string }>('INSERT INTO users(display_name,email,role) VALUES($1,$2,$3) RETURNING id', [`Synthetic ${role}`, `${randomUUID()}@example.invalid`, role])).rows[0].id;
}
async function fixture() {
  const owner = await person('instructor'), learner = await person(), outsider = await person();
  const classes = new PostgresClassroomRepository(db, owner);
  const classroom = await classes.createClass({ name: 'Shared room class', description: '', actorId: owner, reason: 'Synthetic room fixture' });
  await classes.joinClassByCode({ userId: learner, code: classroom.joinCode });
  const rooms = new PostgresSharedCodingRoomRepository(db, { userId: owner, role: 'instructor' });
  const room = await rooms.create({ roomId: randomUUID(), classId: classroom.id, title: 'Pair on maps', language: 'typescript', source: 'export const answer = 1;' });
  return { owner, learner, outsider, classroom, rooms, room };
}

describe('shared coding rooms', () => {
  it('requires class authority, current room membership, and a current enrolled invitee', async () => {
    const f = await fixture();
    await expect(new PostgresSharedCodingRoomRepository(db, { userId: f.outsider, role: 'learner' }).read(f.room.id)).rejects.toBeInstanceOf(SharedCodingRoomAccessError);
    await expect(f.rooms.invite({ roomId: f.room.id, userId: f.outsider, role: 'editor' })).rejects.toBeInstanceOf(SharedCodingRoomAccessError);
    const invited = await f.rooms.invite({ roomId: f.room.id, userId: f.learner, role: 'editor' });
    expect(invited.members).toEqual(expect.arrayContaining([expect.objectContaining({ userId: f.learner, role: 'editor' })]));
    const learner = new PostgresSharedCodingRoomRepository(db, { userId: f.learner, role: 'learner' });
    expect((await learner.read(f.room.id)).source).toBe('export const answer = 1;');
  });

  it('lets an enrolled learner owner select classmates without exposing the roster to members', async () => {
    const f = await fixture();
    const collaborator = await person();
    const classes = new PostgresClassroomRepository(db, f.owner);
    await classes.joinClassByCode({ userId: collaborator, code: f.classroom.joinCode });
    const learnerOwner = new PostgresSharedCodingRoomRepository(db, { userId: f.learner, role: 'learner' });
    const room = await learnerOwner.create({ roomId: randomUUID(), classId: f.classroom.id, title: 'Learner owned room', language: 'typescript', source: '' });
    expect(await learnerOwner.listInvitees(room.id)).toEqual(expect.arrayContaining([expect.objectContaining({ id: collaborator })]));
    await expect(learnerOwner.invite({ roomId: room.id, userId: f.learner, role: 'editor' })).rejects.toBeInstanceOf(SharedCodingRoomValidationError);
    await learnerOwner.invite({ roomId: room.id, userId: collaborator, role: 'editor' });
    const member = new PostgresSharedCodingRoomRepository(db, { userId: collaborator, role: 'learner' });
    await expect(member.listInvitees(room.id)).rejects.toBeInstanceOf(SharedCodingRoomAccessError);
  });

  it('uses ordered snapshots and prevents a viewer from writing', async () => {
    const f = await fixture(); await f.rooms.invite({ roomId: f.room.id, userId: f.learner, role: 'viewer' });
    const viewer = new PostgresSharedCodingRoomRepository(db, { userId: f.learner, role: 'learner' });
    await expect(viewer.saveSnapshot({ roomId: f.room.id, expectedRevision: 1, language: 'typescript', source: 'blocked' })).rejects.toBeInstanceOf(SharedCodingRoomAccessError);
    await f.rooms.invite({ roomId: f.room.id, userId: f.learner, role: 'editor' });
    const editor = new PostgresSharedCodingRoomRepository(db, { userId: f.learner, role: 'learner' });
    const saved = await editor.saveSnapshot({ roomId: f.room.id, expectedRevision: 1, language: 'typescript', source: 'export const answer = 2;' });
    expect(saved).toMatchObject({ revision: 2, source: 'export const answer = 2;' });
    await expect(f.rooms.saveSnapshot({ roomId: f.room.id, expectedRevision: 1, language: 'typescript', source: 'stale' })).rejects.toBeInstanceOf(SharedCodingRoomConflictError);
  });

  it('returns no room content until a later shared revision exists', async () => {
    const f = await fixture();
    expect(await f.rooms.readUpdate(f.room.id, 1, 1)).toEqual({ changed: false, revision: 1, controlRevision: 1 });
    await f.rooms.saveSnapshot({ roomId: f.room.id, expectedRevision: 1, language: 'typescript', source: 'export const answer = 3;' });
    expect(await f.rooms.readUpdate(f.room.id, 1)).toMatchObject({ changed: true, room: { revision: 2, source: 'export const answer = 3;' } });
  });

  it('lists only invited rooms for learners and all class rooms for staff', async () => {
    const f = await fixture();
    const second = await f.rooms.create({ roomId: randomUUID(), classId: f.classroom.id, title: 'Private owner room', language: 'python', source: '' });
    const learner = new PostgresSharedCodingRoomRepository(db, { userId: f.learner, role: 'learner' });
    expect(await learner.list(f.classroom.id)).toEqual([]);
    await f.rooms.invite({ roomId: f.room.id, userId: f.learner, role: 'editor' });
    expect((await learner.list(f.classroom.id)).map(room => room.id)).toEqual([f.room.id]);
    expect((await f.rooms.list(f.classroom.id)).map(room => room.id).sort()).toEqual([f.room.id, second.id].sort());
  });

  it('rejects invalid room content before writing a snapshot', async () => {
    const f = await fixture();
    await expect(f.rooms.create({ roomId: randomUUID(), classId: f.classroom.id, title: ' ', language: 'typescript', source: '' })).rejects.toBeInstanceOf(SharedCodingRoomValidationError);
    await expect(f.rooms.saveSnapshot({ roomId: f.room.id, expectedRevision: 1, language: 'typescript', source: `\0` })).rejects.toBeInstanceOf(SharedCodingRoomValidationError);
    await expect(f.rooms.saveSnapshot({ roomId: f.room.id, expectedRevision: 1, language: 'typescript', source: 'x'.repeat(100_001) })).rejects.toBeInstanceOf(SharedCodingRoomValidationError);
  });

  it('revokes room access when class membership or the class itself changes', async () => {
    const f = await fixture();
    await f.rooms.invite({ roomId: f.room.id, userId: f.learner, role: 'editor' });
    const learner = new PostgresSharedCodingRoomRepository(db, { userId: f.learner, role: 'learner' });
    await db.query('DELETE FROM class_enrollments WHERE class_id=$1 AND user_id=$2', [f.classroom.id, f.learner]);
    await expect(learner.read(f.room.id)).rejects.toBeInstanceOf(SharedCodingRoomAccessError);
    await db.query('UPDATE classrooms SET archived_at=clock_timestamp() WHERE id=$1', [f.classroom.id]);
    await expect(f.rooms.read(f.room.id)).rejects.toBeInstanceOf(SharedCodingRoomAccessError);
  });

  it('hides an interview prompt and source until the owner opens the interview', async () => {
    const f = await fixture();
    const interview = await f.rooms.create({
      roomId: randomUUID(), classId: f.classroom.id, title: 'Interview room',
      language: 'typescript', source: 'const privateStarter = true;', mode: 'interview',
      interviewPrompt: 'Explain the tradeoffs before you edit the source.',
    });
    await f.rooms.invite({ roomId: interview.id, userId: f.learner, role: 'interviewee' });
    const interviewee = new PostgresSharedCodingRoomRepository(db, { userId: f.learner, role: 'learner' });
    expect(await interviewee.read(interview.id)).toMatchObject({ interviewStage: 'lobby', interviewPrompt: null, source: '' });
    await expect(interviewee.saveSnapshot({ roomId: interview.id, expectedRevision: 1, language: 'typescript', source: 'blocked' })).rejects.toBeInstanceOf(SharedCodingRoomAccessError);
    const opened = await f.rooms.setInterviewStage({ roomId: interview.id, expectedControlRevision: 1, stage: 'workspace' });
    expect(opened).toMatchObject({ interviewStage: 'workspace', controlRevision: 2 });
    expect(await interviewee.readUpdate(interview.id, 1, 1)).toMatchObject({ changed: true, room: { interviewStage: 'workspace', controlRevision: 2 } });
    expect(await interviewee.read(interview.id)).toMatchObject({ interviewPrompt: 'Explain the tradeoffs before you edit the source.', source: 'const privateStarter = true;' });
    await expect(f.rooms.setInterviewStage({ roomId: interview.id, expectedControlRevision: 1, stage: 'review' })).rejects.toBeInstanceOf(SharedCodingRoomConflictError);
    expect((await interviewee.saveSnapshot({ roomId: interview.id, expectedRevision: 1, language: 'typescript', source: 'const candidate = true;' })).revision).toBe(2);
  });

  it('rejects incompatible interview and collaboration roles', async () => {
    const f = await fixture();
    await expect(f.rooms.invite({ roomId: f.room.id, userId: f.learner, role: 'interviewee' })).rejects.toBeInstanceOf(SharedCodingRoomValidationError);
    const interview = await f.rooms.create({ roomId: randomUUID(), classId: f.classroom.id, title: 'Role checks', language: 'java', source: '', mode: 'interview' });
    await expect(f.rooms.invite({ roomId: interview.id, userId: f.learner, role: 'editor' })).rejects.toBeInstanceOf(SharedCodingRoomValidationError);
  });

  it('closes a room without deleting saved work', async () => {
    const f = await fixture();
    await f.rooms.invite({ roomId: f.room.id, userId: f.learner, role: 'editor' });
    const closed = await f.rooms.close({ roomId: f.room.id, expectedControlRevision: 1 });
    expect(closed).toMatchObject({ status: 'closed', source: 'export const answer = 1;', controlRevision: 2 });
    const learner = new PostgresSharedCodingRoomRepository(db, { userId: f.learner, role: 'learner' });
    expect((await learner.read(f.room.id)).status).toBe('closed');
    await expect(learner.saveSnapshot({ roomId: f.room.id, expectedRevision: 1, language: 'typescript', source: 'blocked' })).rejects.toBeInstanceOf(SharedCodingRoomAccessError);
    await expect(f.rooms.close({ roomId: f.room.id, expectedControlRevision: 1 })).rejects.toBeInstanceOf(SharedCodingRoomAccessError);
  });

  it('revokes a non-owner member and keeps owner access intact', async () => {
    const f = await fixture();
    await f.rooms.invite({ roomId: f.room.id, userId: f.learner, role: 'editor' });
    const revoked = await f.rooms.revoke(f.room.id, f.learner);
    expect(revoked.members.some(member => member.userId === f.learner)).toBe(false);
    const learner = new PostgresSharedCodingRoomRepository(db, { userId: f.learner, role: 'learner' });
    await expect(learner.read(f.room.id)).rejects.toBeInstanceOf(SharedCodingRoomAccessError);
    await expect(f.rooms.revoke(f.room.id, f.owner)).rejects.toBeInstanceOf(SharedCodingRoomAccessError);
    expect((await f.rooms.read(f.room.id)).members).toEqual(expect.arrayContaining([expect.objectContaining({ userId: f.owner, role: 'owner' })]));
  });

  it('runs only saved source for editable collaboration roles and active interviewees', async () => {
    const f = await fixture();
    expect(await f.rooms.runnableSource(f.room.id)).toEqual({ language: 'typescript', source: 'export const answer = 1;' });
    await f.rooms.invite({ roomId: f.room.id, userId: f.learner, role: 'viewer' });
    const viewer = new PostgresSharedCodingRoomRepository(db, { userId: f.learner, role: 'learner' });
    await expect(viewer.runnableSource(f.room.id)).rejects.toBeInstanceOf(SharedCodingRoomAccessError);
    const interview = await f.rooms.create({ roomId: randomUUID(), classId: f.classroom.id, title: 'Run room', language: 'python', source: 'print(1)', mode: 'interview' });
    await f.rooms.invite({ roomId: interview.id, userId: f.learner, role: 'interviewee' });
    const interviewee = new PostgresSharedCodingRoomRepository(db, { userId: f.learner, role: 'learner' });
    await expect(interviewee.runnableSource(interview.id)).rejects.toBeInstanceOf(SharedCodingRoomAccessError);
    await f.rooms.setInterviewStage({ roomId: interview.id, expectedControlRevision: 1, stage: 'workspace' });
    expect(await interviewee.runnableSource(interview.id)).toEqual({ language: 'python', source: 'print(1)' });
  });

  it('keeps tables private from browser roles', async () => {
    await fixture();
    for (const table of ['shared_coding_rooms', 'shared_coding_room_members', 'shared_coding_room_snapshots']) {
      const flags = await db.query<{ rls: boolean; anon: boolean; authenticated: boolean }>(`SELECT c.relrowsecurity AS rls,
        has_table_privilege('anon',$1,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS anon,
        has_table_privilege('authenticated',$1,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS authenticated
        FROM pg_class c WHERE c.relname=$1`, [table]);
      expect(flags.rows[0]).toEqual({ rls: true, anon: false, authenticated: false });
    }
  });
});
