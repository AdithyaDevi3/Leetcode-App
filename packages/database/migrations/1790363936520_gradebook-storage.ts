import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE gradebook_policies (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      assignment_id uuid NOT NULL UNIQUE REFERENCES class_assignments(id) ON DELETE CASCADE,
      content_version_id uuid NOT NULL REFERENCES content_versions(id) ON DELETE RESTRICT,
      policy jsonb NOT NULL,
      content_snapshot jsonb NOT NULL CHECK (jsonb_typeof(content_snapshot) = 'object'),
      closes_at timestamptz,
      reason text NOT NULL CHECK (length(btrim(reason)) > 0),
      created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      CONSTRAINT gradebook_content_snapshot_identity CHECK (
        (content_snapshot->>'id' = content_version_id::text) IS TRUE
      ),
      CONSTRAINT gradebook_policy_identity CHECK (
        (jsonb_typeof(policy) = 'object'
        AND policy ?& ARRAY['versionId', 'assignmentId', 'contentVersionId', 'maxUnits']
        AND policy->>'versionId' = id::text
        AND policy->>'assignmentId' = assignment_id::text
        AND policy->>'contentVersionId' = content_version_id::text) IS TRUE
      ),
      CONSTRAINT gradebook_policy_maximum CHECK (
        CASE WHEN jsonb_typeof(policy->'maxUnits') = 'number'
          THEN (policy->>'maxUnits')::numeric BETWEEN 1 AND 9007199254740991
            AND trunc((policy->>'maxUnits')::numeric) = (policy->>'maxUnits')::numeric
          ELSE false END
      )
    );
    CREATE INDEX gradebook_policies_content_version_idx ON gradebook_policies(content_version_id);
    CREATE INDEX gradebook_policies_creator_idx ON gradebook_policies(created_by);

    CREATE TABLE gradebook_recipients (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      policy_id uuid NOT NULL REFERENCES gradebook_policies(id) ON DELETE CASCADE,
      learner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      UNIQUE (policy_id, learner_id),
      UNIQUE (id, policy_id)
    );
    CREATE INDEX gradebook_recipients_learner_idx ON gradebook_recipients(learner_id);

    CREATE TABLE gradebook_attempts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      recipient_id uuid NOT NULL,
      policy_id uuid NOT NULL,
      response_revision_id uuid NOT NULL UNIQUE,
      sequence integer NOT NULL CHECK (sequence > 0),
      response jsonb NOT NULL CHECK (jsonb_typeof(response) = 'object'),
      request_key text NOT NULL CHECK (length(btrim(request_key)) > 0 AND length(request_key) <= 128),
      submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      FOREIGN KEY (recipient_id, policy_id) REFERENCES gradebook_recipients(id, policy_id) ON DELETE CASCADE,
      UNIQUE (recipient_id, sequence),
      UNIQUE (recipient_id, request_key),
      UNIQUE (id, recipient_id, policy_id)
    );

    CREATE TABLE gradebook_grade_revisions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      recipient_id uuid NOT NULL,
      policy_id uuid NOT NULL,
      sequence integer NOT NULL CHECK (sequence > 0),
      attempt_id uuid,
      supersedes_id uuid,
      kind text NOT NULL CHECK (kind IN ('scored', 'missing_zero')),
      earned_units bigint NOT NULL CHECK (earned_units BETWEEN 0 AND 9007199254740991),
      evaluator_version_id text NOT NULL CHECK (length(btrim(evaluator_version_id)) > 0),
      criterion_scores jsonb NOT NULL CHECK (jsonb_typeof(criterion_scores) = 'object'),
      reason text NOT NULL CHECK (length(btrim(reason)) > 0),
      authored_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      request_key text NOT NULL CHECK (length(btrim(request_key)) > 0 AND length(request_key) <= 128),
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      UNIQUE (id, recipient_id, policy_id),
      UNIQUE (recipient_id, sequence),
      UNIQUE (recipient_id, request_key),
      FOREIGN KEY (recipient_id, policy_id) REFERENCES gradebook_recipients(id, policy_id) ON DELETE CASCADE,
      FOREIGN KEY (attempt_id, recipient_id, policy_id) REFERENCES gradebook_attempts(id, recipient_id, policy_id),
      FOREIGN KEY (supersedes_id, recipient_id, policy_id) REFERENCES gradebook_grade_revisions(id, recipient_id, policy_id),
      CHECK ((kind = 'scored' AND attempt_id IS NOT NULL)
        OR (kind = 'missing_zero' AND attempt_id IS NULL AND earned_units = 0)),
      CHECK (supersedes_id IS NULL OR supersedes_id <> id)
    );
    CREATE INDEX gradebook_grades_attempt_idx ON gradebook_grade_revisions(attempt_id, recipient_id, policy_id);
    CREATE INDEX gradebook_grades_supersedes_idx ON gradebook_grade_revisions(supersedes_id, recipient_id, policy_id);
    CREATE INDEX gradebook_grades_author_idx ON gradebook_grade_revisions(authored_by);

    CREATE TABLE gradebook_publications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      recipient_id uuid NOT NULL,
      policy_id uuid NOT NULL,
      grade_revision_id uuid NOT NULL,
      sequence integer NOT NULL CHECK (sequence > 0),
      reason text NOT NULL CHECK (length(btrim(reason)) > 0),
      published_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      request_key text NOT NULL CHECK (length(btrim(request_key)) > 0 AND length(request_key) <= 128),
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      UNIQUE (recipient_id, sequence),
      UNIQUE (recipient_id, request_key),
      FOREIGN KEY (recipient_id, policy_id) REFERENCES gradebook_recipients(id, policy_id) ON DELETE CASCADE,
      FOREIGN KEY (grade_revision_id, recipient_id, policy_id) REFERENCES gradebook_grade_revisions(id, recipient_id, policy_id)
    );
    CREATE INDEX gradebook_publications_grade_idx ON gradebook_publications(grade_revision_id, recipient_id, policy_id);
    CREATE INDEX gradebook_publications_publisher_idx ON gradebook_publications(published_by);

    CREATE FUNCTION gradebook_validate_policy_content() RETURNS trigger
      LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog
      AS $function$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM public.class_assignments a
          JOIN public.content_versions cv ON cv.content_id = a.content_id
          WHERE a.id = NEW.assignment_id AND cv.id = NEW.content_version_id
        ) THEN
          RAISE EXCEPTION 'Grade policy content must belong to its assignment'
            USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END;
      $function$;
    REVOKE ALL ON FUNCTION gradebook_validate_policy_content() FROM PUBLIC, anon, authenticated;
    CREATE TRIGGER gradebook_policy_content BEFORE INSERT ON gradebook_policies
      FOR EACH ROW EXECUTE FUNCTION gradebook_validate_policy_content();

    CREATE FUNCTION gradebook_validate_grade_points() RETURNS trigger
      LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog
      AS $function$
      DECLARE
        maximum numeric;
        scoring_mode text;
      BEGIN
        SELECT (policy->>'maxUnits')::numeric, policy->'scoring'->>'mode'
          INTO maximum, scoring_mode
          FROM public.gradebook_policies WHERE id = NEW.policy_id;
        IF NOT FOUND OR NEW.earned_units > maximum THEN
          RAISE EXCEPTION 'Grade points exceed their published policy maximum'
            USING ERRCODE = '23514';
        END IF;
        IF NEW.kind = 'scored' AND scoring_mode = 'verified_completion'
          AND NEW.earned_units NOT IN (0, maximum) THEN
          RAISE EXCEPTION 'Verified completion grades must award zero or full points'
            USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END;
      $function$;
    REVOKE ALL ON FUNCTION gradebook_validate_grade_points() FROM PUBLIC, anon, authenticated;
    CREATE TRIGGER gradebook_grade_points BEFORE INSERT ON gradebook_grade_revisions
      FOR EACH ROW EXECUTE FUNCTION gradebook_validate_grade_points();

    CREATE FUNCTION gradebook_reject_update() RETURNS trigger
      LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog
      AS $function$
      BEGIN
        RAISE EXCEPTION 'Gradebook records are immutable; append a revision instead'
          USING ERRCODE = '23514';
      END;
      $function$;
    REVOKE ALL ON FUNCTION gradebook_reject_update() FROM PUBLIC, anon, authenticated;
  `);

  // Deletion remains available to existing account/class lifecycle cascades.
  // Browser roles cannot access these tables; repositories authorize each call.
  for (const table of ['gradebook_policies', 'gradebook_recipients', 'gradebook_attempts', 'gradebook_grade_revisions', 'gradebook_publications']) {
    pgm.sql(`
      ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
      REVOKE ALL ON TABLE ${table} FROM PUBLIC, anon, authenticated;
      CREATE TRIGGER ${table}_immutable BEFORE UPDATE ON ${table}
        FOR EACH ROW EXECUTE FUNCTION gradebook_reject_update();
    `);
  }
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('gradebook_publications');
  pgm.dropTable('gradebook_grade_revisions');
  pgm.dropTable('gradebook_attempts');
  pgm.dropTable('gradebook_recipients');
  pgm.dropTable('gradebook_policies');
  pgm.sql('DROP FUNCTION gradebook_validate_grade_points()');
  pgm.sql('DROP FUNCTION gradebook_validate_policy_content()');
  pgm.sql('DROP FUNCTION gradebook_reject_update()');
}
