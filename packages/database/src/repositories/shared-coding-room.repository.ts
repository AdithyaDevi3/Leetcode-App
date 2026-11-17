import type { PoolClient } from 'pg';
import type { DatabaseClient } from '../client.js';
import { authorizeGradebookActor } from './gradebook-authorization.js';
import { GradebookAccessError, type GradebookPrincipal } from './gradebook.repository.js';
import type { CloseSharedCodingRoomInput, CreateSharedCodingRoomInput, InterviewStage, InviteSharedCodingRoomMemberInput, OpenSharedCodingRoomInput, SaveSharedCodingRoomSnapshotInput, SetInterviewStageInput, SharedCodingLanguage, SharedCodingRole, SharedCodingRoom, SharedCodingRoomMode, SharedCodingRoomSummary, SharedCodingRoomUpdate } from './shared-coding-room.types.js';

export class SharedCodingRoomAccessError extends Error { constructor() { super('This shared coding room is unavailable.'); this.name='SharedCodingRoomAccessError'; } }
export class SharedCodingRoomConflictError extends Error { constructor() { super('The shared coding room changed. Refresh the room and try again.'); this.name='SharedCodingRoomConflictError'; } }
export class SharedCodingRoomValidationError extends Error { constructor() { super('The shared coding room request is invalid.'); this.name='SharedCodingRoomValidationError'; } }

const uuid=(value:unknown):string=>{if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))throw new SharedCodingRoomValidationError();return value;};
const text=(value:unknown,maximum:number,required=false):string=>{if(typeof value!=='string'||value.includes('\0')||value.length>maximum||(required&&!value.trim())||new TextEncoder().encode(value).byteLength>maximum)throw new SharedCodingRoomValidationError();return value;};
const language=(value:unknown):SharedCodingLanguage=>{if(value==='python'||value==='cpp'||value==='typescript'||value==='java')return value;throw new SharedCodingRoomValidationError();};
const mode=(value:unknown):SharedCodingRoomMode=>{if(value==='collaboration'||value==='interview')return value;throw new SharedCodingRoomValidationError();};
const stage=(value:unknown):InterviewStage=>{if(value==='lobby'||value==='prompt'||value==='workspace'||value==='review')return value;throw new SharedCodingRoomValidationError();};
const revision=(value:unknown):number=>{if(!Number.isSafeInteger(value)||typeof value!=='number'||value<0)throw new SharedCodingRoomValidationError();return value;};

export class PostgresSharedCodingRoomRepository {
  constructor(private readonly db:DatabaseClient,private readonly principal:GradebookPrincipal) {}

  private async classAccess(client:PoolClient,classId:string,write=false):Promise<void> {
    await authorizeGradebookActor(client,this.principal,write);
    const classroom=(await client.query<{created_by:string;archived_at:Date|null}>('SELECT created_by,archived_at FROM classrooms WHERE id=$1 FOR SHARE',[classId])).rows[0];
    if(!classroom||classroom.archived_at)throw new SharedCodingRoomAccessError();
    if(this.principal.role==='learner') {
      const membership=await client.query('SELECT 1 FROM class_enrollments WHERE class_id=$1 AND user_id=$2',[classId,this.principal.userId]);
      if(!membership.rowCount)throw new SharedCodingRoomAccessError();
    } else if(this.principal.role==='instructor'&&classroom.created_by!==this.principal.userId) throw new SharedCodingRoomAccessError();
  }

  private async roomAccess(client:PoolClient,roomId:string,write=false):Promise<{classId:string;role:SharedCodingRole;status:'open'|'closed';mode:SharedCodingRoomMode;stage:InterviewStage}> {
    const room=(await client.query<{class_id:string;status:'open'|'closed';mode:SharedCodingRoomMode;interview_stage:InterviewStage}>('SELECT class_id,status,mode,interview_stage FROM shared_coding_rooms WHERE id=$1 FOR SHARE',[roomId])).rows[0];
    if(!room)throw new SharedCodingRoomAccessError();
    await this.classAccess(client,room.class_id,write);
    if(this.principal.role==='administrator') return {classId:room.class_id,role:'owner',status:room.status,mode:room.mode,stage:room.interview_stage};
    const member=(await client.query<{role:SharedCodingRole}>('SELECT role FROM shared_coding_room_members WHERE room_id=$1 AND user_id=$2 AND revoked_at IS NULL',[roomId,this.principal.userId])).rows[0];
    if(!member)throw new SharedCodingRoomAccessError();
    return {classId:room.class_id,role:member.role,status:room.status,mode:room.mode,stage:room.interview_stage};
  }

  async create(input:CreateSharedCodingRoomInput):Promise<SharedCodingRoom> {
    const roomId=uuid(input.roomId),classId=uuid(input.classId),title=text(input.title,160,true).trim(),roomLanguage=language(input.language),source=text(input.source,100000),roomMode=mode(input.mode??'collaboration'),prompt=text(input.interviewPrompt??'',20000);
    return this.db.transaction(async client=>{await this.classAccess(client,classId,true);
      await client.query('INSERT INTO shared_coding_rooms(id,class_id,created_by,title,language,mode,interview_stage,interview_prompt) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[roomId,classId,this.principal.userId,title,roomLanguage,roomMode,roomMode==='interview'?'lobby':'workspace',prompt]);
      await client.query("INSERT INTO shared_coding_room_members(room_id,user_id,role) VALUES($1,$2,'owner')",[roomId,this.principal.userId]);
      await client.query('INSERT INTO shared_coding_room_snapshots(room_id,revision,source,language,author_id) VALUES($1,1,$2,$3,$4)',[roomId,source,roomLanguage,this.principal.userId]);
      return this.readInside(client,roomId);
    });
  }

  async invite(input:InviteSharedCodingRoomMemberInput):Promise<SharedCodingRoom> {
    const roomId=uuid(input.roomId),userId=uuid(input.userId);if(input.role!=='editor'&&input.role!=='viewer'&&input.role!=='interviewee')throw new SharedCodingRoomValidationError();
    return this.db.transaction(async client=>{const access=await this.roomAccess(client,roomId,true);if(access.role!=='owner'&&this.principal.role!=='administrator')throw new SharedCodingRoomAccessError();
      if((access.mode==='collaboration'&&input.role==='interviewee')||(access.mode==='interview'&&input.role==='editor'))throw new SharedCodingRoomValidationError();
      if(userId===this.principal.userId)throw new SharedCodingRoomValidationError();
      const target=await client.query<{role:string}>('SELECT role FROM users WHERE id=$1 FOR SHARE',[userId]);
      const enrolled=await client.query('SELECT 1 FROM class_enrollments WHERE class_id=$1 AND user_id=$2',[access.classId,userId]);
      if(target.rows[0]?.role!=='learner'||!enrolled.rowCount)throw new SharedCodingRoomAccessError();
      await client.query(`INSERT INTO shared_coding_room_members(room_id,user_id,role,revoked_at) VALUES($1,$2,$3,NULL)
        ON CONFLICT(room_id,user_id) DO UPDATE SET role=EXCLUDED.role,revoked_at=NULL`,[roomId,userId,input.role]);
      return this.readInside(client,roomId);
    });
  }

  /** Let an enrolled learner join an open collaboration room as an editor. */
  async join(roomId:string):Promise<SharedCodingRoom> { roomId=uuid(roomId);
    return this.db.transaction(async client=>{const room=(await client.query<{class_id:string;mode:SharedCodingRoomMode;status:'open'|'closed'}>('SELECT class_id,mode,status FROM shared_coding_rooms WHERE id=$1 FOR SHARE',[roomId])).rows[0];
      if(!room||room.mode!=='collaboration'||room.status!=='open')throw new SharedCodingRoomAccessError();
      await this.classAccess(client,room.class_id,true);
      if(this.principal.role==='administrator')return this.readInside(client,roomId);
      await client.query(`INSERT INTO shared_coding_room_members(room_id,user_id,role,revoked_at) VALUES($1,$2,'editor',NULL)
        ON CONFLICT(room_id,user_id) DO NOTHING`,[roomId,this.principal.userId]);
      return this.readInside(client,roomId);
    });
  }

  /** Revoke a non-owner member without deleting the room audit history. */
  async revoke(roomId:string,userId:string):Promise<SharedCodingRoom> { roomId=uuid(roomId);userId=uuid(userId);
    return this.db.transaction(async client=>{const access=await this.roomAccess(client,roomId,true);if((access.role!=='owner'&&this.principal.role!=='administrator')||access.status!=='open'||userId===this.principal.userId)throw new SharedCodingRoomAccessError();
      const result=await client.query(`UPDATE shared_coding_room_members SET revoked_at=clock_timestamp()
        WHERE room_id=$1 AND user_id=$2 AND role<>'owner' AND revoked_at IS NULL`,[roomId,userId]);
      if(result.rowCount!==1)throw new SharedCodingRoomAccessError();
      return this.readInside(client,roomId);
    });
  }

  async saveSnapshot(input:SaveSharedCodingRoomSnapshotInput):Promise<SharedCodingRoom> {
    const roomId=uuid(input.roomId),expected=revision(input.expectedRevision),roomLanguage=language(input.language),source=text(input.source,100000);
    return this.db.transaction(async client=>{const access=await this.roomAccess(client,roomId,true);if(access.status!=='open'||access.role==='viewer'||access.mode==='interview'&&(access.role!=='interviewee'||access.stage!=='workspace'))throw new SharedCodingRoomAccessError();
      const current=(await client.query<{revision:number}>('SELECT revision FROM shared_coding_room_snapshots WHERE room_id=$1 ORDER BY revision DESC LIMIT 1 FOR UPDATE',[roomId])).rows[0];
      if(!current||current.revision!==expected)throw new SharedCodingRoomConflictError();
      await client.query('INSERT INTO shared_coding_room_snapshots(room_id,revision,source,language,author_id) VALUES($1,$2,$3,$4,$5)',[roomId,expected+1,source,roomLanguage,this.principal.userId]);
      return this.readInside(client,roomId);
    });
  }

  /** Return only the current saved source that this principal may run. */
  async runnableSource(roomId:string):Promise<{language:SharedCodingLanguage;source:string}> { roomId=uuid(roomId);return this.db.transaction(async client=>{
    const access=await this.roomAccess(client,roomId,true);
    if(access.status!=='open'||access.role==='viewer'||(access.mode==='interview'&&(access.role!=='interviewee'||access.stage!=='workspace')))throw new SharedCodingRoomAccessError();
    const snapshot=(await client.query<{language:SharedCodingLanguage;source:string}>('SELECT language,source FROM shared_coding_room_snapshots WHERE room_id=$1 ORDER BY revision DESC LIMIT 1',[roomId])).rows[0];
    if(!snapshot)throw new SharedCodingRoomAccessError();
    return snapshot;
  }); }

  async read(roomId:string):Promise<SharedCodingRoom> { roomId=uuid(roomId);return this.db.transaction(async client=>{await this.roomAccess(client,roomId);return this.readInside(client,roomId);}); }

  async setInterviewStage(input:SetInterviewStageInput):Promise<SharedCodingRoom> { const roomId=uuid(input.roomId),expected=revision(input.expectedControlRevision),nextStage=stage(input.stage),prompt=input.prompt===undefined?undefined:text(input.prompt,20000);
    return this.db.transaction(async client=>{const access=await this.roomAccess(client,roomId,true);if(access.mode!=='interview'||access.role!=='owner'||access.status!=='open')throw new SharedCodingRoomAccessError();
      const current=(await client.query<{control_revision:number}>('SELECT control_revision FROM shared_coding_rooms WHERE id=$1 FOR UPDATE',[roomId])).rows[0];if(!current||current.control_revision!==expected)throw new SharedCodingRoomConflictError();
      await client.query('UPDATE shared_coding_rooms SET interview_stage=$2,interview_prompt=COALESCE($3,interview_prompt),control_revision=control_revision+1 WHERE id=$1',[roomId,nextStage,prompt??null]);return this.readInside(client,roomId);
    }); }

  /** Close a room without deleting its members or saved draft history. */
  async close(input:CloseSharedCodingRoomInput):Promise<SharedCodingRoom> { const roomId=uuid(input.roomId),expected=revision(input.expectedControlRevision);
    return this.db.transaction(async client=>{const access=await this.roomAccess(client,roomId,true);if(access.role!=='owner'||access.status!=='open')throw new SharedCodingRoomAccessError();
      const current=(await client.query<{control_revision:number}>('SELECT control_revision FROM shared_coding_rooms WHERE id=$1 FOR UPDATE',[roomId])).rows[0];if(!current||current.control_revision!==expected)throw new SharedCodingRoomConflictError();
      await client.query("UPDATE shared_coding_rooms SET status='closed',closed_at=clock_timestamp(),control_revision=control_revision+1 WHERE id=$1",[roomId]);return this.readInside(client,roomId);
    }); }

  /** Reopen a closed room without changing its members or saved draft history. */
  async open(input:OpenSharedCodingRoomInput):Promise<SharedCodingRoom> { const roomId=uuid(input.roomId),expected=revision(input.expectedControlRevision);
    return this.db.transaction(async client=>{const access=await this.roomAccess(client,roomId,true);if(access.role!=='owner'||access.status!=='closed')throw new SharedCodingRoomAccessError();
      const current=(await client.query<{control_revision:number}>('SELECT control_revision FROM shared_coding_rooms WHERE id=$1 FOR UPDATE',[roomId])).rows[0];if(!current||current.control_revision!==expected)throw new SharedCodingRoomConflictError();
      await client.query("UPDATE shared_coding_rooms SET status='open',closed_at=NULL,interview_stage=CASE WHEN mode='interview' THEN 'lobby' ELSE interview_stage END,control_revision=control_revision+1 WHERE id=$1",[roomId]);return this.readInside(client,roomId);
    }); }

  /** Poll at a bounded interval. The caller receives content only after a revision change. */
  async readUpdate(roomId:string,afterRevision:number,afterControlRevision=0):Promise<SharedCodingRoomUpdate> { roomId=uuid(roomId);afterRevision=revision(afterRevision);afterControlRevision=revision(afterControlRevision);return this.db.transaction(async client=>{
    await this.roomAccess(client,roomId);const current=(await client.query<{revision:number;control_revision:number}>(`SELECT s.revision,r.control_revision FROM shared_coding_rooms r
      JOIN LATERAL(SELECT revision FROM shared_coding_room_snapshots WHERE room_id=r.id ORDER BY revision DESC LIMIT 1) s ON true WHERE r.id=$1`,[roomId])).rows[0];
    if(!current)throw new SharedCodingRoomAccessError();
    return current.revision<=afterRevision&&current.control_revision<=afterControlRevision?{changed:false,revision:current.revision,controlRevision:current.control_revision}:{changed:true,room:await this.readInside(client,roomId)};
  }); }

  async list(classId:string):Promise<SharedCodingRoomSummary[]> { classId=uuid(classId);return this.db.transaction(async client=>{
    await this.classAccess(client,classId);const rows=await client.query<{id:string;class_id:string;title:string;status:'open'|'closed';mode:SharedCodingRoomMode;language:SharedCodingLanguage;revision:number}>(`
      SELECT r.id,r.class_id,r.title,r.status,r.mode,s.language,s.revision FROM shared_coding_rooms r
      JOIN LATERAL(SELECT language,revision FROM shared_coding_room_snapshots WHERE room_id=r.id ORDER BY revision DESC LIMIT 1) s ON true
      WHERE r.class_id=$1 AND ($2::boolean OR r.mode='collaboration' AND r.status='open' OR EXISTS(SELECT 1 FROM shared_coding_room_members m WHERE m.room_id=r.id AND m.user_id=$3 AND m.revoked_at IS NULL))
      ORDER BY r.created_at DESC,r.id DESC`,[classId,this.principal.role!=='learner',this.principal.userId]);
    return rows.rows.map(row=>({id:row.id,classId:row.class_id,title:row.title,status:row.status,mode:row.mode,language:row.language,revision:row.revision}));
  }); }

  /** Return invite candidates only to a room owner or a platform administrator. */
  async listInvitees(roomId:string):Promise<readonly {id:string;displayName:string}[]> { roomId=uuid(roomId);return this.db.transaction(async client=>{
    const access=await this.roomAccess(client,roomId);
    if(access.role!=='owner'&&this.principal.role!=='administrator')throw new SharedCodingRoomAccessError();
    const result=await client.query<{id:string;display_name:string}>(`SELECT e.user_id AS id,COALESCE(NULLIF(btrim(u.display_name),''),'Class member') AS display_name
      FROM class_enrollments e JOIN users u ON u.id=e.user_id
      WHERE e.class_id=$1 ORDER BY lower(COALESCE(NULLIF(btrim(u.display_name),''),'Class member')),e.user_id`,[access.classId]);
    return result.rows.map(row=>({id:row.id,displayName:row.display_name}));
  }); }

  private async readInside(client:PoolClient,roomId:string):Promise<SharedCodingRoom> {
    const result=await client.query<{id:string;class_id:string;title:string;status:'open'|'closed';mode:SharedCodingRoomMode;interview_stage:InterviewStage;interview_prompt:string;control_revision:number;language:SharedCodingLanguage;revision:number;source:string}>(`
      SELECT r.id,r.class_id,r.title,r.status,r.mode,r.interview_stage,r.interview_prompt,r.control_revision,s.language,s.revision,s.source FROM shared_coding_rooms r
      JOIN LATERAL(SELECT language,revision,source FROM shared_coding_room_snapshots WHERE room_id=r.id ORDER BY revision DESC LIMIT 1) s ON true WHERE r.id=$1`,[roomId]);
    const room=result.rows[0];if(!room)throw new SharedCodingRoomAccessError();
    const members=await client.query<{user_id:string;display_name:string;role:SharedCodingRole}>(`SELECT m.user_id,COALESCE(NULLIF(btrim(u.display_name),''),'Class member') AS display_name,m.role
      FROM shared_coding_room_members m JOIN users u ON u.id=m.user_id WHERE m.room_id=$1 AND m.revoked_at IS NULL ORDER BY m.joined_at,m.user_id`,[roomId]);
    const member=members.rows.find(item=>item.user_id===this.principal.userId);const hidden=room.mode==='interview'&&member?.role==='interviewee'&&room.interview_stage==='lobby';
    return {id:room.id,classId:room.class_id,title:room.title,status:room.status,mode:room.mode,interviewStage:room.interview_stage,interviewPrompt:hidden?null:room.interview_prompt,controlRevision:room.control_revision,language:room.language,revision:room.revision,source:hidden?'':room.source,members:members.rows.map(member=>({userId:member.user_id,displayName:member.display_name,role:member.role}))};
  }
}
