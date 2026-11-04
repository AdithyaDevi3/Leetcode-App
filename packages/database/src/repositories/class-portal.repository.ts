import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { DatabaseClient } from '../client.js';
import { authorizeGradebookActor } from './gradebook-authorization.js';
import { GradebookAccessError, type GradebookPrincipal } from './gradebook.repository.js';
import type {
  ClassPortalContext, AnnouncementContent, AnnouncementList, AnnouncementListOptions, AnnouncementView, AnnouncementReceipt,
  SaveAnnouncementInput, PublishAnnouncementInput, ArchiveAnnouncementInput, MarkAnnouncementReadInput,
} from './class-portal.types.js';

export class ClassPortalAccessError extends Error { constructor() { super('This class announcement is unavailable.'); this.name='ClassPortalAccessError'; } }
export class ClassPortalConflictError extends Error { constructor() { super('This announcement changed. Review the latest saved version before continuing.'); this.name='ClassPortalConflictError'; } }
export class ClassPortalValidationError extends Error { constructor() { super('Choose valid announcement content and command details.'); this.name='ClassPortalValidationError'; } }
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const id=(value:string):string=>{ if(typeof value!=='string'||!uuid.test(value)) throw new ClassPortalValidationError(); return value.toLowerCase(); };
const seq=(value:number,min=0):number=>{ if(!Number.isSafeInteger(value)||value<min||value>=2_147_483_647) throw new ClassPortalValidationError(); return value; };
const contentText=(value:string,max:number):string=>{
  if(typeof value!=='string'||!value.trim()||value.length>max||value.includes('\u0000')||Buffer.byteLength(value,'utf8')>max*4) throw new ClassPortalValidationError();
  for(const character of value) if(character.length===1&&character.charCodeAt(0)>=0xD800&&character.charCodeAt(0)<=0xDFFF) throw new ClassPortalValidationError();
  return value;
};
const iso=(value:Date):string=>value.toISOString();
const hash=(value:unknown):string=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
type Event={ id:string; class_id:string; announcement_id:string; actor_id:string|null; action:AnnouncementReceipt['action']; sequence:number;
  revision_id:string|null; publication_sequence:number|null; fingerprint:string; created_at:Date };
type Revision={ id:string; sequence:number; title:string; body:string; created_at:Date; author_name:string };
type State={ sequence:number; revision:Revision|null; lifecycle:Event|null; publication:Event|null; publishedRevision:Revision|null; unread:boolean };
const revisionContent=(row:Revision):AnnouncementContent=>({ revisionId:row.id,revisionNumber:row.sequence,title:row.title,body:row.body,createdAt:iso(row.created_at),authorName:row.author_name });
const receipt=(row:Event):AnnouncementReceipt=>{
  if(!row.actor_id) throw new ClassPortalAccessError();
  return { id:row.id,actorId:row.actor_id,classId:row.class_id,announcementId:row.announcement_id,action:row.action,sequence:row.sequence,
    revisionId:row.revision_id,publicationSequence:row.publication_sequence,createdAt:iso(row.created_at) };
};

/** Server-only class announcements. Browser database roles have no direct grants. */
export class PostgresClassPortalRepository {
  private readonly principal:GradebookPrincipal;
  constructor(private readonly db:DatabaseClient, principal:GradebookPrincipal) {
    if(!principal||!['instructor','administrator','learner'].includes(principal.role)) throw new ClassPortalAccessError();
    this.principal=Object.freeze({role:principal.role,userId:id(principal.userId)});
  }
  private async classroom(client:PoolClient,classId:string):Promise<ClassPortalContext> {
    try { await authorizeGradebookActor(client,this.principal,true); }
    catch(error) { if(error instanceof GradebookAccessError) throw new ClassPortalAccessError(); throw error; }
    const row=(await client.query<{id:string;name:string;description:string;instructor_name:string;learner_count:string}>(`
      SELECT c.id,c.name,c.description,COALESCE(NULLIF(btrim(u.display_name),''),'Instructor') AS instructor_name,
        (SELECT count(*) FROM class_enrollments e WHERE e.class_id=c.id) AS learner_count
      FROM classrooms c LEFT JOIN users u ON u.id=c.created_by
      WHERE c.id=$1 AND c.archived_at IS NULL AND
        ($2='administrator' OR ($2='instructor' AND c.created_by=$3::uuid) OR
         ($2='learner' AND EXISTS(SELECT 1 FROM class_enrollments e WHERE e.class_id=c.id AND e.user_id=$3::uuid)))
      FOR SHARE OF c`,[classId,this.principal.role,this.principal.userId])).rows[0];
    if(!row) throw new ClassPortalAccessError();
    if(this.principal.role==='learner') {
      const membership=await client.query('SELECT user_id FROM class_enrollments WHERE class_id=$1 AND user_id=$2 FOR SHARE',[classId,this.principal.userId]);
      if(!membership.rows[0]) throw new ClassPortalAccessError();
    }
    return {id:row.id,name:row.name,description:row.description,instructorName:row.instructor_name,learnerCount:Number(row.learner_count)};
  }
  private async announcement(client:PoolClient,classId:string,announcementId:string,lock=false):Promise<void> {
    const row=await client.query(`SELECT id FROM class_announcements WHERE id=$1 AND class_id=$2 ${lock?'FOR UPDATE':'FOR SHARE'}`,[announcementId,classId]);
    if(!row.rows[0]) throw new ClassPortalAccessError();
  }
  private async state(client:PoolClient,announcementId:string):Promise<State> {
    const latest=(await client.query<Event>("SELECT * FROM class_announcement_events WHERE announcement_id=$1 AND action<>'read' ORDER BY sequence DESC LIMIT 1",[announcementId])).rows[0];
    const lifecycle=(await client.query<Event>("SELECT * FROM class_announcement_events WHERE announcement_id=$1 AND action IN ('publish','archive') ORDER BY sequence DESC LIMIT 1",[announcementId])).rows[0]??null;
    const publication=lifecycle?.action==='publish'?lifecycle:null;
    const rows=await client.query<Revision>(`SELECT r.id,r.sequence,r.title,r.body,r.created_at,
      CASE WHEN u.id IS NULL THEN 'Former class author' ELSE COALESCE(NULLIF(btrim(u.display_name),''),'Class author') END AS author_name
      FROM class_announcement_revisions r LEFT JOIN users u ON u.id=r.actor_id WHERE r.announcement_id=$1 AND (r.id=$2::uuid OR r.sequence=(SELECT max(sequence) FROM class_announcement_revisions WHERE announcement_id=$1)) ORDER BY r.sequence DESC`,[announcementId,publication?.revision_id??null]);
    const read=(await client.query<{publication_sequence:number}>('SELECT publication_sequence FROM class_announcement_reads WHERE announcement_id=$1 AND learner_id=$2',[announcementId,this.principal.userId])).rows[0];
    return {sequence:latest?.sequence??0,revision:rows.rows[0]??null,lifecycle,publication,
      publishedRevision:publication?rows.rows.find(row=>row.id===publication.revision_id)??null:null,
      unread:Boolean(publication&&(!read||read.publication_sequence<publication.sequence))};
  }
  async readClass(rawClassId:string):Promise<ClassPortalContext> {
    const classId=id(rawClassId); return this.db.transaction(client=>this.classroom(client,classId));
  }
  async readAnnouncement(rawClassId:string,rawAnnouncementId:string):Promise<AnnouncementView> {
    const classId=id(rawClassId),announcementId=id(rawAnnouncementId);
    return this.db.transaction(async client=>{
      const classroom=await this.classroom(client,classId); await this.announcement(client,classId,announcementId);
      const state=await this.state(client,announcementId),learner=this.principal.role==='learner';
      if(!state.revision||learner&&!state.publication) throw new ClassPortalAccessError();
      const published=state.publication&&state.publishedRevision?{id:state.publication.id,sequence:state.publication.sequence,
        content:revisionContent(state.publishedRevision),publishedAt:iso(state.publication.created_at)}:null;
      if(learner&&!published) throw new ClassPortalAccessError();
      return {classroom,announcement:{id:announcementId,sequence:learner?published!.sequence:state.sequence,
        status:state.lifecycle?.action==='archive'?'archived':published?'published':'draft',
        draft:learner?null:revisionContent(state.revision),published,unread:learner&&state.unread}};
    });
  }
  async listAnnouncements(rawClassId:string,options:AnnouncementListOptions={}):Promise<AnnouncementList> {
    const classId=id(rawClassId),limit=options.limit??25,state=options.state??'current';
    if(!Number.isSafeInteger(limit)||limit<1||limit>50||!['current','archived','all'].includes(state)||this.principal.role==='learner'&&state!=='current') throw new ClassPortalValidationError();
    const cursor=options.cursor;
    if(cursor&&(typeof cursor.at!=='string'||!Number.isFinite(Date.parse(cursor.at))||new Date(cursor.at).toISOString()!==cursor.at)) throw new ClassPortalValidationError();
    const cursorId=cursor?id(cursor.id):null;
    return this.db.transaction(async client=>{
      const classroom=await this.classroom(client,classId),learner=this.principal.role==='learner';
      const result=await client.query<{id:string;at:Date;title:string;excerpt:string;revision_number:number;draft_id:string;published_revision_id:string|null;
        sequence:number;life_action:string|null;published_at:Date|null;publication_sequence:number|null;read_sequence:number|null}>(`
        SELECT a.id,date_trunc('milliseconds',CASE WHEN $2 THEN life.created_at ELSE a.created_at END) AS at,
          CASE WHEN $2 THEN published.title ELSE draft.title END AS title,
          left(CASE WHEN $2 THEN published.body ELSE draft.body END,240) AS excerpt,
          draft.sequence AS revision_number,draft.id AS draft_id,life.revision_id AS published_revision_id,
          head.sequence,life.action AS life_action,CASE WHEN life.action='publish' THEN life.created_at END AS published_at,
          CASE WHEN life.action='publish' THEN life.sequence END AS publication_sequence,rd.publication_sequence AS read_sequence
        FROM class_announcements a
        JOIN LATERAL(SELECT id,sequence,title,body FROM class_announcement_revisions WHERE announcement_id=a.id ORDER BY sequence DESC LIMIT 1) draft ON true
        JOIN LATERAL(SELECT sequence FROM class_announcement_events WHERE announcement_id=a.id AND action<>'read' ORDER BY sequence DESC LIMIT 1) head ON true
        LEFT JOIN LATERAL(SELECT action,sequence,revision_id,created_at FROM class_announcement_events WHERE announcement_id=a.id AND action IN ('publish','archive') ORDER BY sequence DESC LIMIT 1) life ON true
        LEFT JOIN class_announcement_revisions published ON published.id=life.revision_id AND life.action='publish'
        LEFT JOIN class_announcement_reads rd ON rd.announcement_id=a.id AND rd.learner_id=$3
        WHERE a.class_id=$1 AND (NOT $2 OR life.action='publish')
          AND ($4='all' OR ($4='archived' AND life.action='archive') OR ($4='current' AND life.action IS DISTINCT FROM 'archive'))
          AND ($5::timestamptz IS NULL OR (date_trunc('milliseconds',CASE WHEN $2 THEN life.created_at ELSE a.created_at END),a.id)<($5::timestamptz,$6::uuid))
        ORDER BY at DESC,a.id DESC LIMIT $7`,[classId,learner,this.principal.userId,state,cursor?.at??null,cursorId,limit+1]);
      const shown=result.rows.slice(0,limit),last=shown.at(-1);
      return {classroom,items:shown.map(row=>({id:row.id,title:row.title,excerpt:row.excerpt,publishedAt:row.published_at?iso(row.published_at):null,
        publicationSequence:row.publication_sequence,unread:learner&&row.publication_sequence!==null&&(row.read_sequence===null||row.read_sequence<row.publication_sequence),
        ...(!learner?{authorState:{sequence:row.sequence,revisionNumber:row.revision_number,status:row.life_action==='archive'?'archived' as const:row.life_action==='publish'?'published' as const:'draft' as const,
          hasUnpublishedChanges:row.life_action!=='publish'||row.draft_id!==row.published_revision_id}}:{})})),
        nextCursor:result.rows.length>limit&&last?{at:iso(last.at),id:last.id}:null};
    });
  }
  private async command(action:AnnouncementReceipt['action'],input:SaveAnnouncementInput|PublishAnnouncementInput|ArchiveAnnouncementInput|MarkAnnouncementReadInput):Promise<AnnouncementReceipt> {
    const classId=id(input.classId),announcementId=id(input.announcementId),requestKey=id(input.requestKey);
    if(action==='read'?this.principal.role!=='learner':this.principal.role==='learner') throw new ClassPortalAccessError();
    const expectedSequence=action==='read'?seq((input as MarkAnnouncementReadInput).publicationSequence,1):seq((input as ArchiveAnnouncementInput).expectedSequence);
    const rawTitle=(input as SaveAnnouncementInput).title;
    const title=action==='save'?contentText(typeof rawTitle==='string'?rawTitle.trim():rawTitle,160):null;
    const body=action==='save'?contentText((input as SaveAnnouncementInput).body,20000):null;
    const selectedRevision=action==='publish'?id((input as PublishAnnouncementInput).revisionId):null;
    const fingerprint=hash({action,classId,announcementId,expectedSequence,title,body,revisionId:selectedRevision});
    try { return await this.db.transaction(async client=>{
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`class-announcement-command:${this.principal.userId}:${requestKey}`]);
      await this.classroom(client,classId);
      if(action==='save'&&expectedSequence===0) await client.query('INSERT INTO class_announcements(id,class_id,created_by) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING',[announcementId,classId,this.principal.userId]);
      await this.announcement(client,classId,announcementId,true);
      const prior=(await client.query<Event>('SELECT * FROM class_announcement_events WHERE actor_id=$1 AND request_key=$2',[this.principal.userId,requestKey])).rows[0];
      if(prior) { if(prior.fingerprint!==fingerprint||prior.class_id!==classId||prior.announcement_id!==announcementId) throw new ClassPortalConflictError(); return receipt(prior); }
      const current=await this.state(client,announcementId);
      if(action==='read') { if(!current.publication||current.publication.sequence!==expectedSequence) throw new ClassPortalConflictError(); }
      else if(current.sequence!==expectedSequence) throw new ClassPortalConflictError();
      let revisionId:string|null=null;
      if(action==='save') {
        revisionId=(await client.query<{id:string}>(`INSERT INTO class_announcement_revisions(announcement_id,sequence,title,body,actor_id)
          VALUES($1,$2,$3,$4,$5) RETURNING id`,[announcementId,(current.revision?.sequence??0)+1,title,body,this.principal.userId])).rows[0].id;
      } else if(action==='publish') {
        if(!current.revision||current.revision.id!==selectedRevision) throw new ClassPortalConflictError(); revisionId=selectedRevision;
      } else if(action==='archive') { if(!current.revision||current.lifecycle?.action==='archive') throw new ClassPortalConflictError(); }
      else revisionId=current.publication!.revision_id;
      const nextSequence=action==='read'?expectedSequence:expectedSequence+1;
      const event=(await client.query<Event>(`INSERT INTO class_announcement_events(class_id,announcement_id,actor_id,request_key,fingerprint,action,sequence,revision_id,publication_sequence)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[classId,announcementId,this.principal.userId,requestKey,fingerprint,action,nextSequence,revisionId,
          action==='read'||action==='publish'?nextSequence:null])).rows[0];
      if(action==='read') {
        await client.query(`INSERT INTO class_announcement_reads(announcement_id,learner_id,publication_id,publication_sequence)
          VALUES($1,$2,$3,$4) ON CONFLICT(announcement_id,learner_id) DO UPDATE SET publication_id=EXCLUDED.publication_id,
          publication_sequence=EXCLUDED.publication_sequence,updated_at=clock_timestamp()
          WHERE class_announcement_reads.publication_sequence<=EXCLUDED.publication_sequence`,[announcementId,this.principal.userId,current.publication!.id,nextSequence]);
      } else {
        await client.query(`INSERT INTO administration_audit_events(actor_id,action,target_type,target_id,reason,metadata)
          VALUES($1,$2,'class_announcement',$3,$4,$5::jsonb)`,[this.principal.userId,`class_announcement.${action}`,announcementId,
          `Authorized class author explicitly chose announcement ${action}`,JSON.stringify({classId,sequence:nextSequence,revisionId})]);
      }
      return receipt(event);
    }); } catch(error) { if(error&&typeof error==='object'&&'code' in error&&error.code==='23505') throw new ClassPortalConflictError(); throw error; }
  }
  saveAnnouncement(input:SaveAnnouncementInput):Promise<AnnouncementReceipt> { return this.command('save',input); }
  publishAnnouncement(input:PublishAnnouncementInput):Promise<AnnouncementReceipt> { return this.command('publish',input); }
  archiveAnnouncement(input:ArchiveAnnouncementInput):Promise<AnnouncementReceipt> { return this.command('archive',input); }
  markRead(input:MarkAnnouncementReadInput):Promise<AnnouncementReceipt> { return this.command('read',input); }
}
