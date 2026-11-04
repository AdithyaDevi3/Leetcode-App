import { randomUUID } from 'node:crypto';
import { runner } from 'node-pg-migrate';
import { afterAll,afterEach,beforeAll,describe,expect,it } from 'vitest';
import { GenericContainer,type StartedTestContainer } from 'testcontainers';
import { createDatabaseClient,type DatabaseClient,type DatabaseConfig } from '../src/client.js';
import { runMigrations } from '../src/migrations/index.js';
import { prepareSupabaseTestDatabase } from './support/supabase.js';
import { PostgresClassroomRepository } from '../src/repositories/classroom.repository.js';
import { PostgresClassPortalRepository,ClassPortalAccessError,ClassPortalConflictError,ClassPortalValidationError } from '../src/repositories/class-portal.repository.js';
import type { GradebookPrincipal } from '../src/repositories/gradebook.repository.js';
let container:StartedTestContainer,db:DatabaseClient,config:DatabaseConfig;
beforeAll(async()=>{
  container=await new GenericContainer('postgres:16-alpine').withEnvironment({POSTGRES_USER:'test',POSTGRES_PASSWORD:'test',POSTGRES_DB:'testdb'}).withExposedPorts(5432).start();
  config={host:container.getHost(),port:container.getMappedPort(5432),database:'testdb',user:'test',password:'test'};
  db=createDatabaseClient(config); await prepareSupabaseTestDatabase(db); await runMigrations(config);
},60_000);
afterEach(async()=>{if(db) await db.query('TRUNCATE users,classrooms CASCADE');});
afterAll(async()=>{await db?.close();await container?.stop();});
const repo=(userId:string,role:GradebookPrincipal['role']='instructor')=>new PostgresClassPortalRepository(db,{userId,role});
async function person(role='learner') {return (await db.query<{id:string}>('INSERT INTO users(display_name,email,role) VALUES($1,$2,$3) RETURNING id',[`Synthetic ${role}`,`${randomUUID()}@example.invalid`,role])).rows[0].id;}
async function fixture() {
  const owner=await person('instructor'),learner=await person(),other=await person(),classes=new PostgresClassroomRepository(db,owner);
  const classroom=await classes.createClass({name:'Synthetic portal class',description:'A bounded class context.',actorId:owner,reason:'Create synthetic portal class'});
  await classes.joinClassByCode({userId:learner,code:classroom.joinCode});
  const input={classId:classroom.id,announcementId:randomUUID(),expectedSequence:0,title:'Class update',body:'Read this original synthetic announcement.\nKeep the exact second line.',requestKey:randomUUID()};
  return {owner,learner,other,classes,classroom,input,author:repo(owner),reader:repo(learner,'learner')};
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
async function published() {const f=await fixture(),save=await f.author.saveAnnouncement(f.input),publish=await f.author.publishAnnouncement({classId:f.classroom.id,announcementId:f.input.announcementId,expectedSequence:save.sequence,revisionId:save.revisionId!,requestKey:randomUUID()});return {...f,save,publish};}
const view=(f:Fixture)=>f.reader.readAnnouncement(f.classroom.id,f.input.announcementId);
const readInput=(f:Awaited<ReturnType<typeof published>>)=>({classId:f.classroom.id,announcementId:f.input.announcementId,publicationSequence:f.publish.sequence,requestKey:randomUUID()});

describe('private class portal and announcements',()=>{
  it('returns safe class context only to current class members and staff',async()=>{
    const f=await fixture();const context=await f.reader.readClass(f.classroom.id);
    expect(context).toMatchObject({id:f.classroom.id,name:f.classroom.name,instructorName:'Synthetic instructor',learnerCount:1});
    expect(JSON.stringify(context)).not.toMatch(/email|joinCode|actorId/);
    await expect(repo(f.other,'learner').readClass(f.classroom.id)).rejects.toBeInstanceOf(ClassPortalAccessError);
    await expect(repo(await person('instructor')).readClass(f.classroom.id)).rejects.toBeInstanceOf(ClassPortalAccessError);
    await db.query("UPDATE users SET display_name='   ' WHERE id=$1",[f.owner]);
    expect((await f.reader.readClass(f.classroom.id)).instructorName).toBe('Instructor');
    const saved=await f.author.saveAnnouncement(f.input);
    await f.author.publishAnnouncement({classId:f.classroom.id,announcementId:f.input.announcementId,expectedSequence:saved.sequence,revisionId:saved.revisionId!,requestKey:randomUUID()});
    expect((await view(f)).announcement.published!.content.authorName).toBe('Class author');
  });
  it('keeps saved drafts private and publishes the exact saved revision',async()=>{
    const f=await fixture(),saved=await f.author.saveAnnouncement({...f.input,title:'  Class update  '});
    expect(saved).toMatchObject({action:'save',sequence:1,publicationSequence:null});
    expect((await f.author.readAnnouncement(f.classroom.id,f.input.announcementId)).announcement.draft).toMatchObject({title:'Class update',body:f.input.body,revisionId:saved.revisionId});
    expect((await f.reader.listAnnouncements(f.classroom.id)).items).toEqual([]);
    await expect(view(f)).rejects.toBeInstanceOf(ClassPortalAccessError);
    const released=await f.author.publishAnnouncement({classId:f.classroom.id,announcementId:f.input.announcementId,expectedSequence:1,revisionId:saved.revisionId!,requestKey:randomUUID()});
    expect(released).toMatchObject({action:'publish',sequence:2,publicationSequence:2});
    expect((await view(f)).announcement).toMatchObject({sequence:2,status:'published',draft:null,unread:true,published:{content:{body:f.input.body}}});
    expect((await f.reader.listAnnouncements(f.classroom.id)).items[0]).not.toHaveProperty('authorState');
  });
  it('draft edits preserve the previous published body and do not change learner unread state',async()=>{
    const f=await published();await f.reader.markRead(readInput(f));
    await f.author.saveAnnouncement({...f.input,expectedSequence:2,title:'Private correction draft',body:'Private unreleased correction.',requestKey:randomUUID()});
    const learner=await view(f);expect(learner.announcement).toMatchObject({sequence:2,draft:null,unread:false,published:{content:{title:'Class update',body:f.input.body}}});
    expect(JSON.stringify(learner)).not.toContain('Private correction');
    const author=(await f.author.listAnnouncements(f.classroom.id)).items[0];expect(author.authorState).toMatchObject({sequence:3,status:'published',hasUnpublishedChanges:true});
  });
  it('published corrections become unread and stale mark-read cannot acknowledge the correction',async()=>{
    const f=await published(),old=readInput(f);await f.reader.markRead(old);
    const correction=await f.author.saveAnnouncement({...f.input,expectedSequence:2,body:'Published correction.',requestKey:randomUUID()});
    const next=await f.author.publishAnnouncement({classId:f.classroom.id,announcementId:f.input.announcementId,expectedSequence:3,revisionId:correction.revisionId!,requestKey:randomUUID()});
    expect((await view(f)).announcement.unread).toBe(true);
    await expect(f.reader.markRead({...old,requestKey:randomUUID()})).rejects.toBeInstanceOf(ClassPortalConflictError);
    const original=await f.reader.markRead(old);expect(original.sequence).toBe(2);
    expect((await view(f)).announcement.unread).toBe(true);
    await f.reader.markRead({...old,publicationSequence:next.sequence,requestKey:randomUUID()});expect((await view(f)).announcement.unread).toBe(false);
  });
  it('read commands do not advance author sequence or invalidate a reviewed author command',async()=>{
    const f=await published();await f.reader.markRead(readInput(f));
    const before=(await f.author.readAnnouncement(f.classroom.id,f.input.announcementId)).announcement;
    expect(before.sequence).toBe(2);
    await expect(f.author.saveAnnouncement({...f.input,expectedSequence:2,body:'Next private revision.',requestKey:randomUUID()})).resolves.toMatchObject({sequence:3});
  });
  it('archive revokes learner reads; later draft saves stay archived until explicitly published',async()=>{
    const f=await published();const archived=await f.author.archiveAnnouncement({classId:f.classroom.id,announcementId:f.input.announcementId,expectedSequence:2,requestKey:randomUUID()});
    expect(archived).toMatchObject({sequence:3,revisionId:null,publicationSequence:null});
    await expect(view(f)).rejects.toBeInstanceOf(ClassPortalAccessError);expect((await f.reader.listAnnouncements(f.classroom.id)).items).toEqual([]);
    const changed=await f.author.saveAnnouncement({...f.input,expectedSequence:3,body:'Revised after archive.',requestKey:randomUUID()});
    expect((await f.author.readAnnouncement(f.classroom.id,f.input.announcementId)).announcement).toMatchObject({status:'archived',published:null});
    await expect(view(f)).rejects.toBeInstanceOf(ClassPortalAccessError);
    await f.author.publishAnnouncement({classId:f.classroom.id,announcementId:f.input.announcementId,expectedSequence:4,revisionId:changed.revisionId!,requestKey:randomUUID()});
    expect((await view(f)).announcement.published?.content.body).toBe('Revised after archive.');
  });
  it('archives never-published drafts while retaining author review and explicit republish',async()=>{
    const f=await fixture(),saved=await f.author.saveAnnouncement(f.input);
    await f.author.archiveAnnouncement({classId:f.classroom.id,announcementId:f.input.announcementId,expectedSequence:1,requestKey:randomUUID()});
    expect((await f.author.listAnnouncements(f.classroom.id)).items).toEqual([]);
    expect((await f.author.listAnnouncements(f.classroom.id,{state:'archived'})).items).toHaveLength(1);
    expect((await f.author.readAnnouncement(f.classroom.id,f.input.announcementId)).announcement).toMatchObject({status:'archived',published:null,draft:{revisionId:saved.revisionId}});
    await expect(view(f)).rejects.toBeInstanceOf(ClassPortalAccessError);
    await f.author.publishAnnouncement({classId:f.classroom.id,announcementId:f.input.announcementId,expectedSequence:2,revisionId:saved.revisionId!,requestKey:randomUUID()});
    expect((await view(f)).announcement.status).toBe('published');
  });
  it('original save/publication receipts survive later edits and archive; changed payload conflicts',async()=>{
    const f=await fixture();const saved=await f.author.saveAnnouncement(f.input);
    const input={classId:f.classroom.id,announcementId:f.input.announcementId,expectedSequence:1,revisionId:saved.revisionId!,requestKey:randomUUID()};
    const published=await f.author.publishAnnouncement(input);
    await f.author.archiveAnnouncement({classId:f.classroom.id,announcementId:f.input.announcementId,expectedSequence:2,requestKey:randomUUID()});
    expect(await f.author.saveAnnouncement(f.input)).toEqual(saved);expect(await f.author.publishAnnouncement(input)).toEqual(published);
    await expect(f.author.saveAnnouncement({...f.input,body:'Changed under original key.'})).rejects.toBeInstanceOf(ClassPortalConflictError);
  });
  it('serializes competing saves and duplicate request identities without lost revisions',async()=>{
    const f=await fixture();const duplicates=await Promise.all([f.author.saveAnnouncement(f.input),f.author.saveAnnouncement(f.input)]);expect(duplicates[0]).toEqual(duplicates[1]);
    const competing=await Promise.allSettled([1,2].map(n=>f.author.saveAnnouncement({...f.input,expectedSequence:1,body:`Competing revision ${n}`,requestKey:randomUUID()})));
    expect(competing.filter(x=>x.status==='fulfilled')).toHaveLength(1);expect(competing.filter(x=>x.status==='rejected')).toHaveLength(1);
    expect((await db.query('SELECT id FROM class_announcement_revisions')).rowCount).toBe(2);
  });
  it('enforces current learner membership, role and class lifecycle on reads and original retries',async()=>{
    const f=await published(),input=readInput(f);await f.reader.markRead(input);
    await db.query('DELETE FROM class_enrollments WHERE class_id=$1 AND user_id=$2',[f.classroom.id,f.learner]);
    await expect(view(f)).rejects.toBeInstanceOf(ClassPortalAccessError);await expect(f.reader.markRead(input)).rejects.toBeInstanceOf(ClassPortalAccessError);
    await f.classes.joinClassByCode({userId:f.learner,code:f.classroom.joinCode});await db.query("UPDATE users SET role='instructor' WHERE id=$1",[f.learner]);
    await expect(view(f)).rejects.toBeInstanceOf(ClassPortalAccessError);await db.query("UPDATE users SET role='learner' WHERE id=$1",[f.learner]);
    await db.query('UPDATE classrooms SET archived_at=now() WHERE id=$1',[f.classroom.id]);await expect(view(f)).rejects.toBeInstanceOf(ClassPortalAccessError);
    await expect(f.author.saveAnnouncement(f.input)).rejects.toBeInstanceOf(ClassPortalAccessError);
  });
  it('requires active admin class authority and preserves instructor owner isolation',async()=>{
    const f=await fixture(),admin=await person('learner');const administrator=repo(admin,'administrator');
    await expect(administrator.readClass(f.classroom.id)).rejects.toBeInstanceOf(ClassPortalAccessError);
    await db.query("INSERT INTO administration_role_assignments(user_id,role,assigned_by) VALUES($1,'administrator',$2)",[admin,f.owner]);
    const saved=await administrator.saveAnnouncement(f.input);expect(saved.actorId).toBe(admin);
    await db.query('UPDATE administration_role_assignments SET revoked_at=now() WHERE user_id=$1',[admin]);
    await expect(administrator.saveAnnouncement(f.input)).rejects.toBeInstanceOf(ClassPortalAccessError);
    await expect(repo(admin).readClass(f.classroom.id)).rejects.toBeInstanceOf(ClassPortalAccessError);
  });
  it('rejects learner publication, staff mark-read and crossed announcement/revision identities',async()=>{
    const f=await published(),other=await published();
    await expect(f.reader.saveAnnouncement({...f.input,requestKey:randomUUID()})).rejects.toBeInstanceOf(ClassPortalAccessError);
    await expect(f.author.markRead(readInput(f))).rejects.toBeInstanceOf(ClassPortalAccessError);
    await expect(f.author.readAnnouncement(f.classroom.id,other.input.announcementId)).rejects.toBeInstanceOf(ClassPortalAccessError);
    await expect(f.author.publishAnnouncement({classId:f.classroom.id,announcementId:f.input.announcementId,expectedSequence:2,revisionId:other.save.revisionId!,requestKey:randomUUID()})).rejects.toBeInstanceOf(ClassPortalConflictError);
    await expect(f.author.publishAnnouncement({classId:f.classroom.id,announcementId:other.input.announcementId,expectedSequence:2,revisionId:other.save.revisionId!,requestKey:randomUUID()})).rejects.toBeInstanceOf(ClassPortalAccessError);
  });
  it('rolls back draft creation and publication when the audit insert fails',async()=>{
    const f=await fixture();await db.query(`CREATE FUNCTION synthetic_announcement_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.target_type='class_announcement' THEN RAISE EXCEPTION 'Synthetic audit failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER synthetic_announcement_audit_failure BEFORE INSERT ON administration_audit_events FOR EACH ROW EXECUTE FUNCTION synthetic_announcement_audit_failure()`);
    try {
      await expect(f.author.saveAnnouncement(f.input)).rejects.toThrow('Synthetic audit failure');expect((await db.query('SELECT id FROM class_announcements')).rowCount).toBe(0);
      await db.query('ALTER TABLE administration_audit_events DISABLE TRIGGER synthetic_announcement_audit_failure');
      const saved=await f.author.saveAnnouncement(f.input);
      await f.author.publishAnnouncement({classId:f.classroom.id,announcementId:f.input.announcementId,expectedSequence:1,revisionId:saved.revisionId!,requestKey:randomUUID()});
      const next=await f.author.saveAnnouncement({...f.input,expectedSequence:2,body:'Unpublished corrected body.',requestKey:randomUUID()});
      await db.query('ALTER TABLE administration_audit_events ENABLE TRIGGER synthetic_announcement_audit_failure');
      await expect(f.author.publishAnnouncement({classId:f.classroom.id,announcementId:f.input.announcementId,expectedSequence:3,revisionId:next.revisionId!,requestKey:randomUUID()})).rejects.toThrow('Synthetic audit failure');
      expect((await view(f)).announcement.published?.content.body).toBe(f.input.body);
      expect((await f.author.readAnnouncement(f.classroom.id,f.input.announcementId)).announcement.sequence).toBe(3);
    }
    finally {await db.query('DROP TRIGGER synthetic_announcement_audit_failure ON administration_audit_events; DROP FUNCTION synthetic_announcement_audit_failure()');}
  });
  it('paginates both staff and published learner views without duplicate or missing items',async()=>{
    const f=await fixture();for(let n=0;n<7;n++) {const announcementId=randomUUID();const save=await f.author.saveAnnouncement({...f.input,announcementId,title:`Update ${n}`,requestKey:randomUUID()});await f.author.publishAnnouncement({classId:f.classroom.id,announcementId,expectedSequence:1,revisionId:save.revisionId!,requestKey:randomUUID()});}
    for(const repository of [f.author,f.reader]) {const all:string[]=[];let cursor;do {const page=await repository.listAnnouncements(f.classroom.id,{limit:2,...(cursor?{cursor}:{} )});all.push(...page.items.map(item=>item.id));cursor=page.nextCursor??undefined;} while(cursor);expect(all).toHaveLength(7);expect(new Set(all).size).toBe(7);}
  });
  it('preserves the current publication when author deletion is permitted after separate audit retention cleanup',async()=>{
    const f=await published(),admin=await person('admin');await db.query("INSERT INTO administration_role_assignments(user_id,role,assigned_by) VALUES($1,'administrator',$2)",[admin,f.owner]);
    const administrator=repo(admin,'administrator'),edit=await administrator.saveAnnouncement({...f.input,expectedSequence:2,title:'Later administrator publication',body:'The current content must survive author deletion.',requestKey:randomUUID()});
    await administrator.publishAnnouncement({classId:f.classroom.id,announcementId:f.input.announcementId,expectedSequence:3,revisionId:edit.revisionId!,requestKey:randomUUID()});
    // Existing audit retention restricts author deletion; this fixture simulates its separately authorized cleanup.
    await db.query('DELETE FROM administration_audit_events WHERE actor_id=$1',[admin]);
    await db.query('DELETE FROM users WHERE id=$1',[admin]);
    expect((await view(f)).announcement.published?.content).toMatchObject({title:'Later administrator publication',authorName:'Former class author'});
    await expect(administrator.readClass(f.classroom.id)).rejects.toBeInstanceOf(ClassPortalAccessError);
  });
  it('enforces content bounds without altering plain text, including malicious HTML',async()=>{
    const f=await fixture();for(const patch of [{title:''},{body:' '},{title:'x'.repeat(161)},{body:'x'.repeat(20001)},{body:'invalid\u0000text'},{body:'invalid\ud800text'}]) await expect(f.author.saveAnnouncement({...f.input,...patch})).rejects.toBeInstanceOf(ClassPortalValidationError);
    const malicious='<script>synthetic-only()</script>\n  Preserve exact spacing.';const saved=await f.author.saveAnnouncement({...f.input,body:malicious});
    expect((await f.author.readAnnouncement(f.classroom.id,f.input.announcementId)).announcement.draft?.body).toBe(malicious);expect(saved.revisionId).toBeTruthy();
  });
  it('keeps tables private and enforces immutable revision/command and read lineage guards',async()=>{
    const f=await published();const tables=['class_announcements','class_announcement_revisions','class_announcement_events','class_announcement_reads'];
    const flags=await db.query<{relname:string;relrowsecurity:boolean}>('SELECT relname,relrowsecurity FROM pg_class WHERE relname=ANY($1::text[])',[tables]);expect(flags.rows).toHaveLength(4);expect(flags.rows.every(x=>x.relrowsecurity)).toBe(true);
    for(const table of tables) for(const role of ['anon','authenticated']) expect((await db.query<{allowed:boolean}>('SELECT has_table_privilege($1,$2,\'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER\') AS allowed',[role,table])).rows[0].allowed).toBe(false);
    const helpers=await db.query<{prosecdef:boolean;exposed:boolean}>(`SELECT prosecdef,has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE') AS exposed FROM pg_proc p WHERE proname=ANY($1::text[])`,[['class_announcement_immutable','class_announcement_delete_guard','class_announcement_revision_guard','class_announcement_event_guard','class_announcement_read_guard']]);
    expect(helpers.rows).toHaveLength(5);for(const helper of helpers.rows) expect(helper).toEqual({prosecdef:false,exposed:false});
    const rollbackCount=Number((await db.query<{count:string}>("SELECT count(*)::text AS count FROM pgmigrations WHERE name >= '1793799854021_class-portal-announcements'")).rows[0].count);
    await expect(runner({databaseUrl:`postgres://${config.user}:${config.password}@${config.host}:${config.port}/${config.database}`,dir:'migrations',migrationsTable:'pgmigrations',direction:'down',count:rollbackCount,singleTransaction:true,log:()=>{}})).rejects.toThrow('forward-only');
    await expect(db.query("UPDATE class_announcement_revisions SET body='changed' WHERE id=$1",[f.save.revisionId])).rejects.toMatchObject({code:'23514'});
    await expect(db.query("UPDATE class_announcement_events SET fingerprint=repeat('0',64) WHERE id=$1",[f.publish.id])).rejects.toMatchObject({code:'23514'});
    await expect(db.query('INSERT INTO class_announcement_reads(announcement_id,learner_id,publication_id,publication_sequence) VALUES($1,$2,$3,99)',[f.input.announcementId,f.learner,f.save.id])).rejects.toMatchObject({code:'23514'});
    for(const [table,key] of [['class_announcements',f.input.announcementId],['class_announcement_revisions',f.save.revisionId],['class_announcement_events',f.publish.id]]) await expect(db.query(`DELETE FROM ${table} WHERE id=$1`,[key])).rejects.toMatchObject({code:'23514'});
    const other=await published();await expect(db.query(`INSERT INTO class_announcement_events(class_id,announcement_id,actor_id,request_key,fingerprint,action,sequence,revision_id,publication_sequence) VALUES($1,$2,$3,$4,repeat('a',64),'publish',3,$5,3)`,[f.classroom.id,f.input.announcementId,f.owner,randomUUID(),other.save.revisionId])).rejects.toMatchObject({code:'23514'});
  });
  it('permits actual parent-class cascade deletion without independent history erasure',async()=>{
    const f=await published();await f.reader.markRead(readInput(f));
    await db.query('DELETE FROM classrooms WHERE id=$1',[f.classroom.id]);
    for(const table of ['class_announcements','class_announcement_revisions','class_announcement_events','class_announcement_reads']) expect((await db.query(`SELECT * FROM ${table}`)).rowCount).toBe(0);
  });
  it('excludes archived classes and scopes assignment reads to current enrolled class in SQL',async()=>{
    const f=await fixture();const second=await f.classes.createClass({name:'Second synthetic group',description:'',actorId:f.owner,reason:'Synthetic second group'});await f.classes.joinClassByCode({userId:f.learner,code:second.joinCode});
    for(const classId of [f.classroom.id,second.id]) await f.classes.createAssignment({classId,contentId:'10000000-0000-0000-0000-000000000001',title:'Scoped task',instructions:'',dueOn:null,actorId:f.owner,reason:'Assign synthetic task'});
    const learnerClasses=new PostgresClassroomRepository(db);expect(await learnerClasses.listStudentAssignments(f.learner,f.classroom.id)).toHaveLength(1);expect(await learnerClasses.listStudentAssignments(f.other,f.classroom.id)).toHaveLength(0);
    await db.query('UPDATE classrooms SET archived_at=now() WHERE id=$1',[second.id]);expect((await learnerClasses.listStudentClasses(f.learner)).map(item=>item.id)).toEqual([f.classroom.id]);expect(await learnerClasses.listStudentAssignments(f.learner,second.id)).toHaveLength(0);
  });
});
