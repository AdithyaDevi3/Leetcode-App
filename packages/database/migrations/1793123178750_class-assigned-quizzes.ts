import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TYPE content_type ADD VALUE IF NOT EXISTS 'quiz';
    ALTER TABLE content_items ADD COLUMN class_private boolean NOT NULL DEFAULT false;
    ALTER TABLE content_items ENABLE ROW LEVEL SECURITY;
    ALTER TABLE content_versions ENABLE ROW LEVEL SECURITY;
    CREATE POLICY class_content_private ON content_items AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (NOT class_private);
    CREATE POLICY class_content_version_private ON content_versions AS RESTRICTIVE FOR SELECT TO anon, authenticated
      USING (EXISTS (SELECT 1 FROM content_items ci WHERE ci.id = content_id AND NOT ci.class_private));

    CREATE TABLE quiz_publications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      draft_id uuid NOT NULL UNIQUE REFERENCES assessment_drafts(id) DEFERRABLE INITIALLY DEFERRED,
      draft_revision integer NOT NULL CHECK (draft_revision > 0),
      class_id uuid NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
      assignment_id uuid NOT NULL UNIQUE REFERENCES class_assignments(id) ON DELETE CASCADE,
      policy_id uuid NOT NULL UNIQUE REFERENCES gradebook_policies(id) ON DELETE CASCADE,
      title text NOT NULL,
      instructions text NOT NULL,
      audience_kind text NOT NULL CHECK (audience_kind IN ('class', 'selected')),
      audience_learner_ids uuid[] NOT NULL CHECK (cardinality(audience_learner_ids) > 0),
      roster_fingerprint text NOT NULL CHECK (roster_fingerprint ~ '^[a-f0-9]{64}$'),
      snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
      snapshot_hash text NOT NULL CHECK (snapshot_hash = encode(sha256(convert_to(snapshot::text, 'UTF8')), 'hex')),
      available_at timestamptz,
      due_at timestamptz,
      closes_at timestamptz,
      published_by uuid REFERENCES users(id) ON DELETE RESTRICT,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      CHECK (available_at IS NULL OR due_at IS NULL OR available_at <= due_at),
      CHECK (due_at IS NULL OR closes_at IS NULL OR due_at <= closes_at),
      CHECK (available_at IS NULL OR closes_at IS NULL OR available_at <= closes_at),
      UNIQUE (id, policy_id)
    );
    CREATE INDEX quiz_publications_class_idx ON quiz_publications(class_id);
    CREATE INDEX quiz_publications_publisher_idx ON quiz_publications(published_by);

    CREATE FUNCTION quiz_validate_publication() RETURNS trigger
      LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $function$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM public.assessment_drafts d
          JOIN public.class_assignments a ON a.id = NEW.assignment_id AND a.class_id = d.class_id
          JOIN public.content_items ci ON ci.id = a.content_id AND ci.type::text = 'quiz' AND ci.class_private
          JOIN public.gradebook_policies p ON p.id = NEW.policy_id AND p.assignment_id = a.id
          WHERE d.id = NEW.draft_id AND d.class_id = NEW.class_id AND d.revision = NEW.draft_revision
            AND NEW.title = d.title AND NEW.instructions = d.instructions
            AND NEW.available_at IS NOT DISTINCT FROM d.available_at
            AND NEW.due_at IS NOT DISTINCT FROM d.due_at
            AND NEW.closes_at IS NOT DISTINCT FROM d.closes_at
            AND p.closes_at IS NOT DISTINCT FROM NEW.closes_at
            AND p.policy->'scoring' = jsonb_build_object('mode','multiple_choice','scoringVersion','multiple-choice-v1',
              'attemptLimit',1,'releasePolicy','instructor','audience','frozen')
            AND NEW.snapshot->>'scoringVersion' = 'multiple-choice-v1'
            AND NEW.snapshot->'maxUnits' = p.policy->'maxUnits'
            AND (SELECT jsonb_agg(jsonb_build_object('questionVersionId', q.value->'question'->>'versionId', 'maxUnits', q.value->'maxUnits') ORDER BY q.ordinality)
              FROM jsonb_array_elements(NEW.snapshot->'questions') WITH ORDINALITY q) = d.questions
        ) THEN RAISE EXCEPTION 'Quiz publication does not match the saved draft and policy' USING ERRCODE = '23514'; END IF;
        IF cardinality(NEW.audience_learner_ids) <> (SELECT count(DISTINCT learner) FROM unnest(NEW.audience_learner_ids) learner)
          OR EXISTS (SELECT 1 FROM unnest(NEW.audience_learner_ids) learner
            WHERE NOT EXISTS (SELECT 1 FROM public.class_enrollments e WHERE e.class_id = NEW.class_id AND e.user_id = learner))
          OR EXISTS (SELECT 1 FROM public.gradebook_recipients r WHERE r.policy_id = NEW.policy_id
            AND NOT (r.learner_id = ANY(NEW.audience_learner_ids)))
          OR cardinality(NEW.audience_learner_ids) <> (SELECT count(*) FROM public.gradebook_recipients r WHERE r.policy_id = NEW.policy_id)
        THEN RAISE EXCEPTION 'Quiz audience does not match enrolled recipients' USING ERRCODE = '23514'; END IF;
        RETURN NEW;
      END; $function$;
    CREATE TRIGGER quiz_publication_lineage BEFORE INSERT ON quiz_publications FOR EACH ROW EXECUTE FUNCTION quiz_validate_publication();

    CREATE TABLE quiz_answer_drafts (
      recipient_id uuid PRIMARY KEY,
      policy_id uuid NOT NULL,
      revision integer NOT NULL CHECK (revision > 0),
      answers jsonb NOT NULL CHECK (jsonb_typeof(answers) = 'object'),
      updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      FOREIGN KEY (recipient_id, policy_id) REFERENCES gradebook_recipients(id, policy_id) ON DELETE CASCADE
    );
    CREATE INDEX quiz_answer_drafts_policy_idx ON quiz_answer_drafts(policy_id);
    CREATE FUNCTION quiz_validate_answer_draft() RETURNS trigger
      LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $function$
      DECLARE frozen jsonb;
      BEGIN
        PERFORM id FROM public.gradebook_recipients WHERE id=NEW.recipient_id FOR UPDATE;
        SELECT snapshot INTO frozen FROM public.quiz_publications WHERE policy_id=NEW.policy_id;
        IF frozen IS NULL OR EXISTS (SELECT 1 FROM public.gradebook_attempts WHERE recipient_id=NEW.recipient_id)
          OR (TG_OP='INSERT' AND NEW.revision <> 1)
          OR (TG_OP='UPDATE' AND (NEW.recipient_id <> OLD.recipient_id OR NEW.policy_id <> OLD.policy_id OR NEW.revision <> OLD.revision+1))
          OR (SELECT count(*) FROM jsonb_object_keys(NEW.answers)) <> jsonb_array_length(frozen->'questions')
          OR EXISTS (SELECT 1 FROM jsonb_each(NEW.answers) answer WHERE NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(frozen->'questions') q WHERE q->'question'->>'versionId'=answer.key
              AND (answer.value='null'::jsonb OR EXISTS (SELECT 1 FROM jsonb_array_elements(q->'question'->'options') o WHERE to_jsonb(o->>'id')=answer.value))))
          THEN RAISE EXCEPTION 'Quiz answer draft is invalid, stale, or finalized' USING ERRCODE='23514'; END IF;
        RETURN NEW;
      END; $function$;
    CREATE TRIGGER quiz_answer_draft_shape BEFORE INSERT OR UPDATE ON quiz_answer_drafts
      FOR EACH ROW EXECUTE FUNCTION quiz_validate_answer_draft();
    CREATE TABLE quiz_score_evidence (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      attempt_id uuid NOT NULL UNIQUE,
      recipient_id uuid NOT NULL,
      policy_id uuid NOT NULL,
      publication_id uuid NOT NULL,
      answer_revision integer NOT NULL CHECK (answer_revision >= 0),
      scoring_version text NOT NULL CHECK (scoring_version = 'multiple-choice-v1'),
      snapshot_hash text NOT NULL,
      response_hash text NOT NULL,
      earned_units integer NOT NULL CHECK (earned_units >= 0),
      max_units integer NOT NULL CHECK (max_units BETWEEN 1 AND 1000000 AND earned_units <= max_units),
      result jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object'),
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      FOREIGN KEY (attempt_id, recipient_id, policy_id) REFERENCES gradebook_attempts(id, recipient_id, policy_id) ON DELETE CASCADE,
      FOREIGN KEY (publication_id, policy_id) REFERENCES quiz_publications(id, policy_id) ON DELETE CASCADE
    );
    CREATE INDEX quiz_score_evidence_recipient_idx ON quiz_score_evidence(recipient_id);
    CREATE INDEX quiz_score_evidence_policy_idx ON quiz_score_evidence(policy_id);
    CREATE INDEX quiz_score_evidence_publication_idx ON quiz_score_evidence(publication_id);
    ALTER TABLE gradebook_grade_revisions ADD COLUMN quiz_score_id uuid UNIQUE
      REFERENCES quiz_score_evidence(id) DEFERRABLE INITIALLY DEFERRED;

    CREATE FUNCTION quiz_validate_attempt() RETURNS trigger
      LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $function$
      DECLARE mode text;
      BEGIN
        SELECT policy->'scoring'->>'mode' INTO mode FROM public.gradebook_policies WHERE id = NEW.policy_id;
        IF mode = 'multiple_choice' THEN
          PERFORM id FROM public.gradebook_recipients WHERE id = NEW.recipient_id FOR UPDATE;
          IF EXISTS (SELECT 1 FROM public.gradebook_attempts WHERE recipient_id = NEW.recipient_id)
            OR NEW.sequence <> 1 OR NEW.response->>'kind' IS DISTINCT FROM 'multiple_choice'
            OR jsonb_typeof(NEW.response->'answers') IS DISTINCT FROM 'object'
            OR (SELECT count(*) FROM jsonb_object_keys(NEW.response)) <> 2
          THEN RAISE EXCEPTION 'Quiz accepts one typed final attempt' USING ERRCODE = '23514'; END IF;
        END IF;
        RETURN NEW;
      END; $function$;
    CREATE TRIGGER quiz_attempt_shape BEFORE INSERT ON gradebook_attempts FOR EACH ROW EXECUTE FUNCTION quiz_validate_attempt();

    CREATE FUNCTION quiz_validate_score_evidence() RETURNS trigger
      LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $function$
      DECLARE frozen jsonb; response jsonb; expected_earned numeric; expected_max numeric; saved_revision integer;
      BEGIN
        SELECT p.snapshot, a.response INTO frozen, response
          FROM public.quiz_publications p JOIN public.gradebook_attempts a ON a.id = NEW.attempt_id
          WHERE p.id = NEW.publication_id AND p.policy_id = NEW.policy_id AND a.policy_id = p.policy_id
            AND a.recipient_id = NEW.recipient_id AND p.snapshot_hash = NEW.snapshot_hash;
        IF frozen IS NULL OR response IS NULL OR NEW.response_hash <> encode(sha256(convert_to(response::text, 'UTF8')), 'hex')
          THEN RAISE EXCEPTION 'Quiz scoring evidence lineage mismatch' USING ERRCODE = '23514'; END IF;
        SELECT revision INTO saved_revision FROM public.quiz_answer_drafts WHERE recipient_id = NEW.recipient_id;
        IF NEW.answer_revision <> COALESCE(saved_revision, 0) OR response->'answers' IS DISTINCT FROM
          COALESCE((SELECT answers FROM public.quiz_answer_drafts WHERE recipient_id = NEW.recipient_id),
            (SELECT jsonb_object_agg(q->'question'->>'versionId', 'null'::jsonb) FROM jsonb_array_elements(frozen->'questions') q))
          THEN RAISE EXCEPTION 'Final quiz response differs from saved revision' USING ERRCODE = '23514'; END IF;
        SELECT sum((q->>'maxUnits')::numeric), sum(CASE WHEN response->'answers'->>(q->'question'->>'versionId') = q->'question'->>'correctOptionId'
          THEN (q->>'maxUnits')::numeric ELSE 0 END) INTO expected_max, expected_earned FROM jsonb_array_elements(frozen->'questions') q;
        IF NEW.max_units <> expected_max OR NEW.earned_units <> expected_earned
          OR NEW.result->>'scoringVersion' IS DISTINCT FROM NEW.scoring_version
          OR NEW.result->'earnedUnits' IS DISTINCT FROM to_jsonb(NEW.earned_units)
          OR NEW.result->'maxUnits' IS DISTINCT FROM to_jsonb(NEW.max_units)
          THEN RAISE EXCEPTION 'Quiz score is inconsistent with pinned answers' USING ERRCODE = '23514'; END IF;
        RETURN NEW;
      END; $function$;
    CREATE TRIGGER quiz_score_lineage BEFORE INSERT ON quiz_score_evidence FOR EACH ROW EXECUTE FUNCTION quiz_validate_score_evidence();

    CREATE OR REPLACE FUNCTION gradebook_validate_grade_authorship() RETURNS trigger
      LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $function$
      DECLARE scoring_mode text;
      BEGIN
        SELECT policy->'scoring'->>'mode' INTO scoring_mode FROM public.gradebook_policies WHERE id = NEW.policy_id;
        IF NEW.kind = 'missing_zero' THEN
          IF NEW.authored_by IS NULL OR NEW.verification_job_id IS NOT NULL OR NEW.quiz_score_id IS NOT NULL THEN
            RAISE EXCEPTION 'Missing-work grades require human authorship' USING ERRCODE = '23514'; END IF;
        ELSIF scoring_mode = 'verified_completion' THEN
          IF NEW.verification_job_id IS NULL OR NEW.authored_by IS NOT NULL OR NEW.quiz_score_id IS NOT NULL THEN
            RAISE EXCEPTION 'Verified grades require system verification provenance' USING ERRCODE = '23514'; END IF;
          IF NOT EXISTS (SELECT 1 FROM public.gradebook_verification_jobs j
            WHERE j.id = NEW.verification_job_id AND j.attempt_id = NEW.attempt_id
              AND j.recipient_id = NEW.recipient_id AND j.policy_id = NEW.policy_id
              AND j.status = 'running' AND j.lease_expires_at >= clock_timestamp()
              AND j.verifier_version_id = NEW.evaluator_version_id) THEN
            RAISE EXCEPTION 'Verification provenance does not match grade lineage' USING ERRCODE = '23514'; END IF;
        ELSIF scoring_mode = 'multiple_choice' THEN
          IF NEW.quiz_score_id IS NULL OR NEW.authored_by IS NOT NULL OR NEW.verification_job_id IS NOT NULL
            OR NEW.criterion_scores <> '{}'::jsonb OR NOT EXISTS (
              SELECT 1 FROM public.quiz_score_evidence e WHERE e.id = NEW.quiz_score_id AND e.attempt_id = NEW.attempt_id
                AND e.recipient_id = NEW.recipient_id AND e.policy_id = NEW.policy_id
                AND e.earned_units = NEW.earned_units AND e.scoring_version = NEW.evaluator_version_id)
          THEN RAISE EXCEPTION 'Quiz grades require pinned deterministic scoring provenance' USING ERRCODE = '23514'; END IF;
        ELSIF NEW.authored_by IS NULL OR NEW.verification_job_id IS NOT NULL OR NEW.quiz_score_id IS NOT NULL THEN
          RAISE EXCEPTION 'Reviewed grades require human authorship' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END; $function$;

    CREATE TABLE quiz_request_receipts (
      actor_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      request_key text NOT NULL CHECK (length(btrim(request_key)) BETWEEN 1 AND 128),
      publication_id uuid NOT NULL REFERENCES quiz_publications(id) ON DELETE CASCADE,
      recipient_id uuid REFERENCES gradebook_recipients(id) ON DELETE CASCADE,
      operation text NOT NULL CHECK (operation IN ('publish', 'save', 'submit')),
      request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
      response jsonb NOT NULL CHECK (jsonb_typeof(response) = 'object'),
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      PRIMARY KEY (actor_id, request_key)
    );
    CREATE INDEX quiz_receipts_publication_idx ON quiz_request_receipts(publication_id);
    CREATE INDEX quiz_receipts_recipient_idx ON quiz_request_receipts(recipient_id);
    CREATE FUNCTION quiz_reject_immutable_update() RETURNS trigger
      LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $function$
      BEGIN RAISE EXCEPTION 'Quiz history is immutable' USING ERRCODE = '55000'; END; $function$;
    CREATE TRIGGER quiz_publication_immutable BEFORE UPDATE ON quiz_publications FOR EACH ROW EXECUTE FUNCTION quiz_reject_immutable_update();
    CREATE TRIGGER quiz_score_immutable BEFORE UPDATE ON quiz_score_evidence FOR EACH ROW EXECUTE FUNCTION quiz_reject_immutable_update();
    CREATE TRIGGER quiz_receipt_immutable BEFORE UPDATE ON quiz_request_receipts FOR EACH ROW EXECUTE FUNCTION quiz_reject_immutable_update();
    ALTER TABLE quiz_publications ENABLE ROW LEVEL SECURITY;
    ALTER TABLE quiz_answer_drafts ENABLE ROW LEVEL SECURITY;
    ALTER TABLE quiz_score_evidence ENABLE ROW LEVEL SECURITY;
    ALTER TABLE quiz_request_receipts ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE quiz_publications, quiz_answer_drafts, quiz_score_evidence, quiz_request_receipts FROM PUBLIC, anon, authenticated;
    REVOKE ALL ON FUNCTION quiz_validate_publication(), quiz_validate_attempt(), quiz_validate_score_evidence(),
      quiz_reject_immutable_update(), quiz_validate_answer_draft(), gradebook_validate_grade_authorship() FROM PUBLIC, anon, authenticated;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // An unused feature can be reversed in isolation. Persisted assessment history requires a forward fix.
  // PostgreSQL enum values and enabled RLS are deliberately retained; neither is safe to destructively recreate.
  pgm.sql(`
    DO $rollback$ BEGIN
      IF EXISTS (SELECT 1 FROM quiz_publications) OR EXISTS (SELECT 1 FROM content_items WHERE class_private)
        OR EXISTS (SELECT 1 FROM gradebook_policies WHERE policy->'scoring'->>'mode'='multiple_choice')
      THEN RAISE EXCEPTION 'Persisted class quizzes require a forward-only rollback'; END IF;
    END $rollback$;
    DROP TRIGGER quiz_attempt_shape ON gradebook_attempts;
    DROP FUNCTION quiz_validate_attempt();
    DROP TRIGGER quiz_score_lineage ON quiz_score_evidence;
    DROP FUNCTION quiz_validate_score_evidence();
    DROP TRIGGER quiz_answer_draft_shape ON quiz_answer_drafts;
    DROP FUNCTION quiz_validate_answer_draft();
    DROP TRIGGER quiz_publication_lineage ON quiz_publications;
    DROP FUNCTION quiz_validate_publication();
    CREATE OR REPLACE FUNCTION gradebook_validate_grade_authorship() RETURNS trigger
      LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $function$
      DECLARE scoring_mode text;
      BEGIN
        SELECT policy->'scoring'->>'mode' INTO scoring_mode FROM public.gradebook_policies WHERE id=NEW.policy_id;
        IF NEW.kind='missing_zero' THEN
          IF NEW.authored_by IS NULL OR NEW.verification_job_id IS NOT NULL THEN
            RAISE EXCEPTION 'Missing-work grades require human authorship' USING ERRCODE='23514'; END IF;
        ELSIF scoring_mode='verified_completion' THEN
          IF NEW.verification_job_id IS NULL OR NEW.authored_by IS NOT NULL THEN
            RAISE EXCEPTION 'Verified grades require system verification provenance' USING ERRCODE='23514'; END IF;
          IF NOT EXISTS (SELECT 1 FROM public.gradebook_verification_jobs j WHERE j.id=NEW.verification_job_id
            AND j.attempt_id=NEW.attempt_id AND j.recipient_id=NEW.recipient_id AND j.policy_id=NEW.policy_id
            AND j.status='running' AND j.lease_expires_at>=clock_timestamp() AND j.verifier_version_id=NEW.evaluator_version_id)
          THEN RAISE EXCEPTION 'Verification provenance does not match grade lineage' USING ERRCODE='23514'; END IF;
        ELSIF NEW.authored_by IS NULL OR NEW.verification_job_id IS NOT NULL THEN
          RAISE EXCEPTION 'Reviewed grades require human authorship' USING ERRCODE='23514';
        END IF;
        RETURN NEW;
      END; $function$;
    ALTER TABLE gradebook_grade_revisions DROP COLUMN quiz_score_id;
    DROP TABLE quiz_request_receipts,quiz_score_evidence,quiz_answer_drafts,quiz_publications;
    DROP FUNCTION quiz_reject_immutable_update();
    DROP POLICY class_content_version_private ON content_versions;
    DROP POLICY class_content_private ON content_items;
    ALTER TABLE content_items DROP COLUMN class_private;
  `);
}
