import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE shared_coding_rooms (
      id uuid PRIMARY KEY,
      class_id uuid NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
      created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 160),
      language text NOT NULL CHECK(language IN ('python','cpp','typescript','java')),
      mode text NOT NULL DEFAULT 'collaboration' CHECK(mode IN ('collaboration','interview')),
      interview_stage text NOT NULL DEFAULT 'workspace' CHECK(interview_stage IN ('lobby','prompt','workspace','review')),
      interview_prompt text NOT NULL DEFAULT '' CHECK(octet_length(interview_prompt)<=20000),
      control_revision integer NOT NULL DEFAULT 1 CHECK(control_revision>0),
      status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      closed_at timestamptz
    );
    CREATE INDEX shared_coding_rooms_class_idx ON shared_coding_rooms(class_id,created_at DESC,id DESC);
    CREATE TABLE shared_coding_room_members (
      room_id uuid NOT NULL REFERENCES shared_coding_rooms(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role text NOT NULL CHECK(role IN ('owner','editor','viewer','interviewee')),
      joined_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      revoked_at timestamptz,
      PRIMARY KEY(room_id,user_id)
    );
    CREATE INDEX shared_coding_room_members_user_idx ON shared_coding_room_members(user_id,room_id) WHERE revoked_at IS NULL;
    CREATE TABLE shared_coding_room_snapshots (
      room_id uuid NOT NULL REFERENCES shared_coding_rooms(id) ON DELETE CASCADE,
      revision integer NOT NULL CHECK(revision>0),
      source text NOT NULL CHECK(octet_length(source)<=100000),
      language text NOT NULL CHECK(language IN ('python','cpp','typescript','java')),
      author_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      PRIMARY KEY(room_id,revision)
    );
    CREATE INDEX shared_coding_room_snapshots_room_idx ON shared_coding_room_snapshots(room_id,revision DESC);
    ALTER TABLE shared_coding_rooms ENABLE ROW LEVEL SECURITY;
    ALTER TABLE shared_coding_room_members ENABLE ROW LEVEL SECURITY;
    ALTER TABLE shared_coding_room_snapshots ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE shared_coding_rooms,shared_coding_room_members,shared_coding_room_snapshots FROM PUBLIC,anon,authenticated;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DO $guard$ BEGIN
    IF EXISTS(SELECT 1 FROM shared_coding_rooms) THEN
      RAISE EXCEPTION 'Shared coding rooms are forward-only after use' USING ERRCODE='55000';
    END IF;
  END; $guard$;
  DROP TABLE shared_coding_room_snapshots;
  DROP TABLE shared_coding_room_members;
  DROP TABLE shared_coding_rooms;`);
}
