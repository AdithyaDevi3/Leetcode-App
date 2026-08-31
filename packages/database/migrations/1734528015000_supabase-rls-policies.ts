import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

/**
 * Policies for tables introduced by the Supabase production integration.
 * Server-side repository calls use the protected database connection; these
 * policies protect the same data if a feature is later exposed through the
 * Supabase Data API.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE POLICY learner_requests_select_own ON learner_requests
      FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
    CREATE POLICY learner_requests_insert_own ON learner_requests
      FOR INSERT TO authenticated
      WITH CHECK (user_id = (select auth.uid()) AND guest_id IS NULL);
    CREATE POLICY learner_requests_update_own ON learner_requests
      FOR UPDATE TO authenticated
      USING (user_id = (select auth.uid()))
      WITH CHECK (user_id = (select auth.uid()) AND guest_id IS NULL);
    CREATE POLICY learner_requests_delete_own ON learner_requests
      FOR DELETE TO authenticated USING (user_id = (select auth.uid()));

    CREATE POLICY curriculum_tracks_public_read ON curriculum_tracks
      FOR SELECT TO anon, authenticated USING (true);
    CREATE POLICY curriculum_track_items_public_read ON curriculum_track_items
      FOR SELECT TO anon, authenticated USING (true);
    CREATE POLICY content_concepts_public_read ON content_concepts
      FOR SELECT TO anon, authenticated USING (true);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP POLICY IF EXISTS learner_requests_select_own ON learner_requests;
    DROP POLICY IF EXISTS learner_requests_insert_own ON learner_requests;
    DROP POLICY IF EXISTS learner_requests_update_own ON learner_requests;
    DROP POLICY IF EXISTS learner_requests_delete_own ON learner_requests;
    DROP POLICY IF EXISTS curriculum_tracks_public_read ON curriculum_tracks;
    DROP POLICY IF EXISTS curriculum_track_items_public_read ON curriculum_track_items;
    DROP POLICY IF EXISTS content_concepts_public_read ON content_concepts;
  `);
}
