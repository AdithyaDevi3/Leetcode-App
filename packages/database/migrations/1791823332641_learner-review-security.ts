import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE learner_profiles ENABLE ROW LEVEL SECURITY;
    ALTER TABLE concept_mastery ENABLE ROW LEVEL SECURITY;
    ALTER TABLE scheduled_reviews ENABLE ROW LEVEL SECURITY;

    CREATE POLICY learner_profiles_own_rows ON learner_profiles
      FOR ALL TO authenticated
      USING (user_id = (select auth.uid()))
      WITH CHECK (user_id = (select auth.uid()));
    CREATE POLICY concept_mastery_own_rows ON concept_mastery
      FOR ALL TO authenticated
      USING (user_id = (select auth.uid()))
      WITH CHECK (user_id = (select auth.uid()));
    CREATE POLICY scheduled_reviews_own_rows ON scheduled_reviews
      FOR ALL TO authenticated
      USING (user_id = (select auth.uid()))
      WITH CHECK (user_id = (select auth.uid()));
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP POLICY IF EXISTS scheduled_reviews_own_rows ON scheduled_reviews;
    DROP POLICY IF EXISTS concept_mastery_own_rows ON concept_mastery;
    DROP POLICY IF EXISTS learner_profiles_own_rows ON learner_profiles;
  `);
}
