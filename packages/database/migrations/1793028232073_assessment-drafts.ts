import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE FUNCTION assessment_draft_question_units(value jsonb) RETURNS integer
      LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = pg_catalog
      AS $function$
      DECLARE
        entry jsonb;
        version_id text;
        seen text[] := ARRAY[]::text[];
        point_units numeric;
        total_units numeric := 0;
      BEGIN
        IF jsonb_typeof(value) IS DISTINCT FROM 'array' THEN RETURN NULL; END IF;
        IF jsonb_array_length(value) NOT BETWEEN 1 AND 30 THEN RETURN NULL; END IF;
        FOR entry IN SELECT * FROM jsonb_array_elements(value) LOOP
          IF jsonb_typeof(entry) IS DISTINCT FROM 'object'
            OR NOT (entry ?& ARRAY['questionVersionId', 'maxUnits'])
            OR entry - 'questionVersionId' - 'maxUnits' <> '{}'::jsonb
            OR jsonb_typeof(entry->'questionVersionId') IS DISTINCT FROM 'string'
            OR jsonb_typeof(entry->'maxUnits') IS DISTINCT FROM 'number' THEN RETURN NULL; END IF;
          version_id := entry->>'questionVersionId';
          IF version_id !~ '^[a-z][a-z0-9-]{2,79}@[1-9][0-9]{0,5}$' OR version_id = ANY(seen) THEN RETURN NULL; END IF;
          seen := array_append(seen, version_id);
          point_units := (entry->>'maxUnits')::numeric;
          IF point_units < 1 OR point_units > 1000000 OR trunc(point_units) <> point_units THEN RETURN NULL; END IF;
          total_units := total_units + point_units;
          IF total_units > 1000000 THEN RETURN NULL; END IF;
        END LOOP;
        RETURN total_units::integer;
      END;
      $function$;
    REVOKE ALL ON FUNCTION assessment_draft_question_units(jsonb) FROM PUBLIC, anon, authenticated;

    CREATE TABLE assessment_drafts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      class_id uuid NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
      title text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 160),
      instructions text NOT NULL DEFAULT '' CHECK (length(instructions) <= 2000),
      questions jsonb NOT NULL,
      max_units integer GENERATED ALWAYS AS (assessment_draft_question_units(questions)) STORED NOT NULL,
      available_at timestamptz,
      due_at timestamptz,
      closes_at timestamptz,
      revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
      status text NOT NULL DEFAULT 'draft' CHECK (status = 'draft'),
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      CHECK (max_units BETWEEN 1 AND 1000000),
      CHECK (available_at IS NULL OR due_at IS NULL OR available_at <= due_at),
      CHECK (due_at IS NULL OR closes_at IS NULL OR due_at <= closes_at),
      CHECK (available_at IS NULL OR closes_at IS NULL OR available_at <= closes_at)
    );
    CREATE INDEX assessment_drafts_class_updated_idx ON assessment_drafts(class_id, updated_at DESC, id);
    CREATE INDEX assessment_drafts_creator_idx ON assessment_drafts(created_by);

    CREATE TABLE assessment_draft_mutations (
      actor_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      request_key text NOT NULL CHECK (length(request_key) BETWEEN 1 AND 128 AND length(btrim(request_key)) > 0),
      draft_id uuid NOT NULL REFERENCES assessment_drafts(id) ON DELETE CASCADE,
      fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
      snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      PRIMARY KEY (actor_id, request_key)
    );
    CREATE INDEX assessment_draft_mutations_draft_idx ON assessment_draft_mutations(draft_id);

    CREATE FUNCTION assessment_draft_reject_receipt_update() RETURNS trigger
      LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog
      AS $function$
      BEGIN
        RAISE EXCEPTION 'Assessment save receipts are immutable' USING ERRCODE = '23514';
      END;
      $function$;
    REVOKE ALL ON FUNCTION assessment_draft_reject_receipt_update() FROM PUBLIC, anon, authenticated;
    CREATE TRIGGER assessment_draft_mutations_immutable BEFORE UPDATE ON assessment_draft_mutations
      FOR EACH ROW EXECUTE FUNCTION assessment_draft_reject_receipt_update();

    ALTER TABLE assessment_drafts ENABLE ROW LEVEL SECURITY;
    ALTER TABLE assessment_draft_mutations ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE assessment_drafts, assessment_draft_mutations FROM PUBLIC, anon, authenticated;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('assessment_draft_mutations');
  pgm.dropTable('assessment_drafts');
  pgm.sql('DROP FUNCTION assessment_draft_reject_receipt_update()');
  pgm.sql('DROP FUNCTION assessment_draft_question_units(jsonb)');
}
