import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DO $policy$ BEGIN
    IF to_regclass('realtime.messages') IS NULL THEN
      RETURN;
    END IF;

    CREATE POLICY "shared room members receive realtime"
      ON realtime.messages FOR SELECT TO authenticated
      USING (
        extension IN ('broadcast', 'presence')
        AND EXISTS (
          SELECT 1
          FROM public.shared_coding_rooms room
          JOIN public.shared_coding_room_members member ON member.room_id = room.id
          WHERE room.id = CASE
            WHEN realtime.topic() ~ '^shared-room:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
              THEN substring(realtime.topic() from 13)::uuid
            ELSE NULL
          END
            AND room.status = 'open'
            AND member.user_id = (select auth.uid())
            AND member.revoked_at IS NULL
        )
      );

    CREATE POLICY "shared room members publish realtime"
      ON realtime.messages FOR INSERT TO authenticated
      WITH CHECK (
        extension IN ('broadcast', 'presence')
        AND EXISTS (
          SELECT 1
          FROM public.shared_coding_rooms room
          JOIN public.shared_coding_room_members member ON member.room_id = room.id
          WHERE room.id = CASE
            WHEN realtime.topic() ~ '^shared-room:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
              THEN substring(realtime.topic() from 13)::uuid
            ELSE NULL
          END
            AND room.status = 'open'
            AND member.user_id = (select auth.uid())
            AND member.revoked_at IS NULL
        )
      );
  END; $policy$;`);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DO $policy$ BEGIN
    IF to_regclass('realtime.messages') IS NULL THEN
      RETURN;
    END IF;
    DROP POLICY IF EXISTS "shared room members receive realtime" ON realtime.messages;
    DROP POLICY IF EXISTS "shared room members publish realtime" ON realtime.messages;
  END; $policy$;`);
}
