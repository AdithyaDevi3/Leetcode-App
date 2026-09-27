import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE gradebook_verification_jobs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      attempt_id uuid NOT NULL UNIQUE,
      recipient_id uuid NOT NULL,
      policy_id uuid NOT NULL,
      learner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      verifier_version_id text NOT NULL CHECK (length(btrim(verifier_version_id)) BETWEEN 1 AND 255),
      language varchar(32) NOT NULL CHECK (language IN ('python','cpp','typescript')),
      source text NOT NULL CHECK (length(btrim(source)) > 0),
      pinned_tests jsonb NOT NULL CHECK (jsonb_typeof(pinned_tests) = 'array'),
      status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed','unavailable','superseded')),
      attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
      max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
      available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      lease_token uuid,
      lease_expires_at timestamptz,
      result_summary jsonb CHECK (result_summary IS NULL OR jsonb_typeof(result_summary) = 'object'),
      error_code varchar(80),
      queued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      started_at timestamptz,
      completed_at timestamptz,
      FOREIGN KEY (attempt_id, recipient_id, policy_id)
        REFERENCES gradebook_attempts(id, recipient_id, policy_id) ON DELETE CASCADE,
      CHECK ((status = 'running' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
        OR (status <> 'running' AND lease_token IS NULL AND lease_expires_at IS NULL)),
      CHECK (error_code IS NULL OR length(btrim(error_code)) > 0)
    );
    CREATE INDEX gradebook_verification_jobs_claim_idx
      ON gradebook_verification_jobs(status, available_at, queued_at);
    CREATE INDEX gradebook_verification_jobs_recipient_idx
      ON gradebook_verification_jobs(recipient_id, queued_at DESC);

    CREATE TABLE gradebook_verification_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      verification_job_id uuid NOT NULL REFERENCES gradebook_verification_jobs(id) ON DELETE CASCADE,
      status text NOT NULL CHECK (status IN ('queued','running','completed','failed','unavailable','superseded')),
      reason varchar(255) NOT NULL CHECK (length(btrim(reason)) > 0),
      created_at timestamptz NOT NULL DEFAULT clock_timestamp()
    );
    CREATE INDEX gradebook_verification_events_job_idx
      ON gradebook_verification_events(verification_job_id, created_at);

    ALTER TABLE gradebook_grade_revisions ALTER COLUMN authored_by DROP NOT NULL;
    ALTER TABLE gradebook_grade_revisions ADD COLUMN verification_job_id uuid UNIQUE
      REFERENCES gradebook_verification_jobs(id);

    CREATE FUNCTION gradebook_validate_verification_job() RETURNS trigger
      LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $function$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM public.gradebook_attempts a
          JOIN public.gradebook_recipients r ON r.id = a.recipient_id
          JOIN public.gradebook_policies p ON p.id = a.policy_id
          WHERE a.id = NEW.attempt_id
            AND a.recipient_id = NEW.recipient_id
            AND a.policy_id = NEW.policy_id
            AND r.learner_id = NEW.learner_id
            AND p.policy->'scoring'->>'mode' = 'verified_completion'
            AND p.policy->'scoring'->>'verifierVersionId' = NEW.verifier_version_id
            AND a.response->>'language' = NEW.language
            AND a.response->>'text' = NEW.source
            AND p.content_snapshot->'test_cases' = NEW.pinned_tests
        ) THEN
          RAISE EXCEPTION 'Verification job evidence does not match assignment lineage' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END; $function$;
    REVOKE ALL ON FUNCTION gradebook_validate_verification_job() FROM PUBLIC, anon, authenticated;
    CREATE TRIGGER gradebook_verification_job_lineage BEFORE INSERT ON gradebook_verification_jobs
      FOR EACH ROW EXECUTE FUNCTION gradebook_validate_verification_job();

    CREATE FUNCTION gradebook_validate_grade_authorship() RETURNS trigger
      LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $function$
      DECLARE scoring_mode text;
      BEGIN
        SELECT policy->'scoring'->>'mode' INTO scoring_mode
          FROM public.gradebook_policies WHERE id = NEW.policy_id;
        IF NEW.kind = 'missing_zero' THEN
          IF NEW.authored_by IS NULL OR NEW.verification_job_id IS NOT NULL THEN
            RAISE EXCEPTION 'Missing-work grades require human authorship' USING ERRCODE = '23514';
          END IF;
        ELSIF scoring_mode = 'verified_completion' THEN
          IF NEW.verification_job_id IS NULL OR NEW.authored_by IS NOT NULL THEN
            RAISE EXCEPTION 'Verified grades require system verification provenance' USING ERRCODE = '23514';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM public.gradebook_verification_jobs j
            WHERE j.id = NEW.verification_job_id AND j.attempt_id = NEW.attempt_id
              AND j.recipient_id = NEW.recipient_id AND j.policy_id = NEW.policy_id
              AND j.status = 'running' AND j.lease_expires_at >= clock_timestamp()
              AND j.verifier_version_id = NEW.evaluator_version_id) THEN
            RAISE EXCEPTION 'Verification provenance does not match grade lineage' USING ERRCODE = '23514';
          END IF;
        ELSIF NEW.authored_by IS NULL OR NEW.verification_job_id IS NOT NULL THEN
          RAISE EXCEPTION 'Reviewed grades require human authorship' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END; $function$;
    REVOKE ALL ON FUNCTION gradebook_validate_grade_authorship() FROM PUBLIC, anon, authenticated;
    CREATE TRIGGER gradebook_grade_authorship BEFORE INSERT ON gradebook_grade_revisions
      FOR EACH ROW EXECUTE FUNCTION gradebook_validate_grade_authorship();

    CREATE FUNCTION gradebook_protect_verification_evidence() RETURNS trigger
      LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $function$
      BEGIN
        IF TG_TABLE_NAME = 'gradebook_verification_events' THEN
          RAISE EXCEPTION 'Verification events are immutable' USING ERRCODE = '23514';
        END IF;
        IF (OLD.attempt_id,OLD.recipient_id,OLD.policy_id,OLD.learner_id,OLD.verifier_version_id,OLD.language,OLD.source,OLD.pinned_tests)
          IS DISTINCT FROM
          (NEW.attempt_id,NEW.recipient_id,NEW.policy_id,NEW.learner_id,NEW.verifier_version_id,NEW.language,NEW.source,NEW.pinned_tests) THEN
          RAISE EXCEPTION 'Verification evidence is immutable' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END; $function$;
    REVOKE ALL ON FUNCTION gradebook_protect_verification_evidence() FROM PUBLIC, anon, authenticated;
    CREATE TRIGGER gradebook_verification_job_evidence BEFORE UPDATE ON gradebook_verification_jobs
      FOR EACH ROW EXECUTE FUNCTION gradebook_protect_verification_evidence();
    CREATE TRIGGER gradebook_verification_event_immutable BEFORE UPDATE ON gradebook_verification_events
      FOR EACH ROW EXECUTE FUNCTION gradebook_protect_verification_evidence();

    ALTER TABLE gradebook_verification_jobs ENABLE ROW LEVEL SECURITY;
    ALTER TABLE gradebook_verification_events ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE gradebook_verification_jobs, gradebook_verification_events FROM PUBLIC, anon, authenticated;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('DROP TRIGGER gradebook_grade_authorship ON gradebook_grade_revisions');
  pgm.sql('DROP FUNCTION gradebook_validate_grade_authorship()');
  pgm.sql('DROP TRIGGER gradebook_verification_event_immutable ON gradebook_verification_events');
  pgm.sql('DROP TRIGGER gradebook_verification_job_evidence ON gradebook_verification_jobs');
  pgm.sql('DROP FUNCTION gradebook_protect_verification_evidence()');
  pgm.sql('DROP TRIGGER gradebook_verification_job_lineage ON gradebook_verification_jobs');
  pgm.sql('DROP FUNCTION gradebook_validate_verification_job()');
  pgm.dropColumn('gradebook_grade_revisions', 'verification_job_id');
  pgm.sql('ALTER TABLE gradebook_grade_revisions ALTER COLUMN authored_by SET NOT NULL');
  pgm.dropTable('gradebook_verification_events');
  pgm.dropTable('gradebook_verification_jobs');
}
