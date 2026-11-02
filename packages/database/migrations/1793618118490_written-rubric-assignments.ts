import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';
export const shorthands: ColumnDefinitions | undefined = undefined;
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE FUNCTION written_criterion_units(criteria jsonb) RETURNS integer
      LANGUAGE plpgsql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog AS $fn$
      DECLARE c jsonb; total numeric:=0; seen text[]:='{}'; cid text;
      BEGIN
        IF jsonb_typeof(criteria)<>'array' OR jsonb_array_length(criteria) NOT BETWEEN 1 AND 20 THEN
          RAISE EXCEPTION 'Invalid written rubric' USING ERRCODE='23514'; END IF;
        FOR c IN SELECT value FROM jsonb_array_elements(criteria) LOOP
          cid:=c->>'id';
          IF jsonb_typeof(c)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(c))<>3
            OR NOT (c ?& ARRAY['id','label','maxUnits']) OR jsonb_typeof(c->'id')<>'string'
            OR cid !~ '^[a-z][a-z0-9_-]{0,63}$' OR cid IN('constructor','prototype','__proto__') OR cid=ANY(seen)
            OR jsonb_typeof(c->'label')<>'string' OR length(btrim(c->>'label')) NOT BETWEEN 1 AND 160
            OR jsonb_typeof(c->'maxUnits')<>'number' OR c->>'maxUnits' !~ '^[1-9][0-9]{0,6}$'
            OR (c->>'maxUnits')::numeric>1000000 THEN RAISE EXCEPTION 'Invalid written rubric criterion' USING ERRCODE='23514'; END IF;
          seen:=array_append(seen,cid); total:=total+(c->>'maxUnits')::numeric;
        END LOOP;
        IF total>1000000 THEN RAISE EXCEPTION 'Written rubric total exceeded' USING ERRCODE='23514'; END IF;
        RETURN total::integer;
      END; $fn$;
    REVOKE ALL ON FUNCTION written_criterion_units(jsonb) FROM PUBLIC,anon,authenticated;
    CREATE TABLE written_assessment_drafts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), class_id uuid NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
      title text NOT NULL CHECK(length(btrim(title)) BETWEEN 3 AND 160), instructions text NOT NULL CHECK(length(instructions)<=2000),
      prompt text NOT NULL CHECK(length(btrim(prompt)) BETWEEN 1 AND 20000), criteria jsonb NOT NULL,
      max_units integer GENERATED ALWAYS AS (written_criterion_units(criteria)) STORED NOT NULL,
      available_at timestamptz,due_at timestamptz,closes_at timestamptz,
      revision integer NOT NULL DEFAULT 1 CHECK(revision>0),created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      CHECK(max_units BETWEEN 1 AND 1000000), CHECK(available_at IS NULL OR due_at IS NULL OR available_at<=due_at),
      CHECK(due_at IS NULL OR closes_at IS NULL OR due_at<=closes_at),CHECK(available_at IS NULL OR closes_at IS NULL OR available_at<=closes_at)
    );
    CREATE INDEX written_drafts_class_idx ON written_assessment_drafts(class_id,updated_at DESC,id);
    CREATE INDEX written_drafts_creator_idx ON written_assessment_drafts(created_by);
    CREATE TABLE written_assessment_publications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), draft_id uuid NOT NULL UNIQUE REFERENCES written_assessment_drafts(id) DEFERRABLE INITIALLY DEFERRED,
      draft_revision integer NOT NULL CHECK(draft_revision>0),class_id uuid NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
      assignment_id uuid NOT NULL UNIQUE REFERENCES class_assignments(id) ON DELETE CASCADE,
      policy_id uuid NOT NULL UNIQUE REFERENCES gradebook_policies(id) ON DELETE CASCADE,
      title text NOT NULL,instructions text NOT NULL,prompt text NOT NULL,criteria jsonb NOT NULL,
      max_units integer GENERATED ALWAYS AS (written_criterion_units(criteria)) STORED NOT NULL,
      available_at timestamptz,due_at timestamptz,closes_at timestamptz,
      audience_kind text NOT NULL CHECK(audience_kind IN('class','selected')),
      audience_learner_ids uuid[] NOT NULL CHECK(cardinality(audience_learner_ids)>0),
      roster_fingerprint text NOT NULL CHECK(roster_fingerprint~'^[a-f0-9]{64}$'),
      published_by uuid REFERENCES users(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      CHECK(available_at IS NULL OR due_at IS NULL OR available_at<=due_at),
      CHECK(due_at IS NULL OR closes_at IS NULL OR due_at<=closes_at),CHECK(available_at IS NULL OR closes_at IS NULL OR available_at<=closes_at)
    );
    CREATE INDEX written_publications_class_idx ON written_assessment_publications(class_id);
    CREATE INDEX written_publications_publisher_idx ON written_assessment_publications(published_by);
    CREATE TABLE written_response_drafts (
      recipient_id uuid PRIMARY KEY,policy_id uuid NOT NULL,
      revision integer NOT NULL CHECK(revision>0),text text NOT NULL CHECK(octet_length(text)<=100000),
      updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      FOREIGN KEY(recipient_id,policy_id) REFERENCES gradebook_recipients(id,policy_id) ON DELETE CASCADE
    );
    CREATE INDEX written_responses_policy_idx ON written_response_drafts(policy_id);
    CREATE TABLE written_request_receipts (
      actor_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,request_key text NOT NULL CHECK(length(btrim(request_key)) BETWEEN 1 AND 128),
      draft_id uuid NOT NULL REFERENCES written_assessment_drafts(id) ON DELETE CASCADE,
      publication_id uuid REFERENCES written_assessment_publications(id) ON DELETE CASCADE,
      recipient_id uuid REFERENCES gradebook_recipients(id) ON DELETE CASCADE,
      operation text NOT NULL CHECK(operation IN('save_draft','publish','save_response','submit_response')),
      fingerprint text NOT NULL CHECK(fingerprint~'^[a-f0-9]{64}$'),response jsonb NOT NULL CHECK(jsonb_typeof(response)='object'),
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(actor_id,request_key)
    );
    CREATE INDEX written_receipts_draft_idx ON written_request_receipts(draft_id);
    CREATE INDEX written_receipts_publication_idx ON written_request_receipts(publication_id);
    CREATE INDEX written_receipts_recipient_idx ON written_request_receipts(recipient_id);
    CREATE FUNCTION written_validate_draft() RETURNS trigger
      LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
      BEGIN
        IF (TG_OP='INSERT' AND NEW.revision<>1) OR (TG_OP='UPDATE' AND
          (NEW.id<>OLD.id OR NEW.class_id<>OLD.class_id OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1
           OR NEW.created_by IS DISTINCT FROM OLD.created_by)) THEN
          -- Account deletion may clear authorship without editing saved content.
          IF TG_OP='UPDATE' AND OLD.created_by IS NOT NULL AND NEW.created_by IS NULL
            AND NOT EXISTS(SELECT 1 FROM public.users WHERE id=OLD.created_by)
            AND (to_jsonb(NEW)-'created_by'-'max_units')=(to_jsonb(OLD)-'created_by'-'max_units') THEN RETURN NEW; END IF;
          RAISE EXCEPTION 'Invalid written draft revision' USING ERRCODE='23514'; END IF;
        RETURN NEW;
      END; $fn$;
    CREATE TRIGGER written_draft_shape BEFORE INSERT OR UPDATE ON written_assessment_drafts FOR EACH ROW EXECUTE FUNCTION written_validate_draft();
    CREATE FUNCTION written_validate_publication() RETURNS trigger
      LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
      BEGIN
        IF NOT EXISTS(SELECT 1 FROM public.written_assessment_drafts d
          JOIN public.class_assignments a ON a.id=NEW.assignment_id AND a.class_id=d.class_id
          JOIN public.content_items ci ON ci.id=a.content_id AND ci.class_private AND ci.type::text='quiz'
          JOIN public.gradebook_policies p ON p.id=NEW.policy_id AND p.assignment_id=a.id
          WHERE d.id=NEW.draft_id AND d.class_id=NEW.class_id AND d.revision=NEW.draft_revision
            AND d.title=NEW.title AND d.instructions=NEW.instructions AND d.prompt=NEW.prompt AND d.criteria=NEW.criteria
            AND d.available_at IS NOT DISTINCT FROM NEW.available_at AND d.due_at IS NOT DISTINCT FROM NEW.due_at
            AND d.closes_at IS NOT DISTINCT FROM NEW.closes_at AND p.closes_at IS NOT DISTINCT FROM NEW.closes_at
            AND p.policy->>'attemptPolicy'='latest' AND p.policy->'maxUnits'=to_jsonb(d.max_units)
            AND p.policy->'scoring'=jsonb_build_object('mode','reviewed_rubric','rubricVersionId',NEW.id::text,'criteria',NEW.criteria))
          THEN RAISE EXCEPTION 'Written publication lineage mismatch' USING ERRCODE='23514'; END IF;
        IF cardinality(NEW.audience_learner_ids)<>(SELECT count(DISTINCT x) FROM unnest(NEW.audience_learner_ids) x)
          OR EXISTS(SELECT 1 FROM unnest(NEW.audience_learner_ids) x WHERE NOT EXISTS(SELECT 1 FROM public.class_enrollments e WHERE e.class_id=NEW.class_id AND e.user_id=x))
          OR EXISTS(SELECT 1 FROM public.gradebook_recipients r WHERE r.policy_id=NEW.policy_id AND NOT(r.learner_id=ANY(NEW.audience_learner_ids)))
          OR cardinality(NEW.audience_learner_ids)<>(SELECT count(*) FROM public.gradebook_recipients WHERE policy_id=NEW.policy_id)
          THEN RAISE EXCEPTION 'Written publication audience mismatch' USING ERRCODE='23514'; END IF;
        RETURN NEW;
      END; $fn$;
    CREATE TRIGGER written_publication_lineage BEFORE INSERT ON written_assessment_publications FOR EACH ROW EXECUTE FUNCTION written_validate_publication();
    CREATE FUNCTION written_validate_response() RETURNS trigger
      LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
      BEGIN
        IF TG_OP='DELETE' THEN
          IF NOT EXISTS(SELECT 1 FROM public.gradebook_recipients WHERE id=OLD.recipient_id) THEN RETURN OLD; END IF;
          RAISE EXCEPTION 'Saved written response cannot be deleted' USING ERRCODE='23514';
        END IF;
        PERFORM id FROM public.gradebook_recipients WHERE id=NEW.recipient_id FOR UPDATE;
        IF NOT EXISTS(SELECT 1 FROM public.written_assessment_publications WHERE policy_id=NEW.policy_id)
          OR EXISTS(SELECT 1 FROM public.gradebook_attempts WHERE recipient_id=NEW.recipient_id)
          OR (TG_OP='INSERT' AND NEW.revision<>1) OR (TG_OP='UPDATE' AND
            (NEW.recipient_id<>OLD.recipient_id OR NEW.policy_id<>OLD.policy_id OR NEW.revision<>OLD.revision+1))
          THEN RAISE EXCEPTION 'Invalid or finalized written response' USING ERRCODE='23514'; END IF;
        RETURN NEW;
      END; $fn$;
    CREATE TRIGGER written_response_shape BEFORE INSERT OR UPDATE OR DELETE ON written_response_drafts FOR EACH ROW EXECUTE FUNCTION written_validate_response();
    CREATE FUNCTION written_validate_attempt() RETURNS trigger
      LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
      DECLARE saved text;
      BEGIN
        IF EXISTS(SELECT 1 FROM public.written_assessment_publications WHERE policy_id=NEW.policy_id) THEN
          PERFORM id FROM public.gradebook_recipients WHERE id=NEW.recipient_id FOR UPDATE;
          SELECT text INTO saved FROM public.written_response_drafts WHERE recipient_id=NEW.recipient_id AND policy_id=NEW.policy_id;
          IF saved IS NULL OR saved !~ '[^[:space:]]' OR NEW.sequence<>1
            OR EXISTS(SELECT 1 FROM public.gradebook_attempts WHERE recipient_id=NEW.recipient_id)
            OR NEW.response IS DISTINCT FROM jsonb_build_object('kind','text','text',saved)
            THEN RAISE EXCEPTION 'Written assignment accepts one exact saved final response' USING ERRCODE='23514'; END IF;
        END IF;
        RETURN NEW;
      END; $fn$;
    CREATE TRIGGER written_attempt_shape BEFORE INSERT ON gradebook_attempts FOR EACH ROW EXECUTE FUNCTION written_validate_attempt();
    CREATE FUNCTION written_reject_history_change() RETURNS trigger
      LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
      BEGIN
        IF TG_OP='DELETE' THEN
          IF TG_TABLE_NAME='written_assessment_publications' AND NOT EXISTS(SELECT 1 FROM public.classrooms WHERE id=(to_jsonb(OLD)->>'class_id')::uuid) THEN RETURN OLD; END IF;
          IF TG_TABLE_NAME='written_request_receipts' AND
            (NOT EXISTS(SELECT 1 FROM public.written_assessment_drafts WHERE id=OLD.draft_id)
             OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=(to_jsonb(OLD)->>'actor_id')::uuid)
             OR ((to_jsonb(OLD)->>'publication_id') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.written_assessment_publications WHERE id=(to_jsonb(OLD)->>'publication_id')::uuid))) THEN RETURN OLD; END IF;
        END IF;
        RAISE EXCEPTION 'Written assessment history is immutable' USING ERRCODE='55000';
      END; $fn$;
    CREATE TRIGGER written_publication_immutable BEFORE UPDATE OR DELETE ON written_assessment_publications FOR EACH ROW EXECUTE FUNCTION written_reject_history_change();
    CREATE TRIGGER written_receipt_immutable BEFORE UPDATE OR DELETE ON written_request_receipts FOR EACH ROW EXECUTE FUNCTION written_reject_history_change();
    ALTER TABLE written_assessment_drafts ENABLE ROW LEVEL SECURITY;
    ALTER TABLE written_assessment_publications ENABLE ROW LEVEL SECURITY;
    ALTER TABLE written_response_drafts ENABLE ROW LEVEL SECURITY;
    ALTER TABLE written_request_receipts ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE written_assessment_drafts,written_assessment_publications,written_response_drafts,written_request_receipts FROM PUBLIC,anon,authenticated;
    REVOKE ALL ON FUNCTION written_validate_draft(),written_validate_publication(),written_validate_response(),written_validate_attempt(),written_reject_history_change() FROM PUBLIC,anon,authenticated;
  `);
}
export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DO $guard$ BEGIN
      IF EXISTS(SELECT 1 FROM written_assessment_drafts) OR EXISTS(SELECT 1 FROM written_assessment_publications)
        OR EXISTS(SELECT 1 FROM written_response_drafts) OR EXISTS(SELECT 1 FROM written_request_receipts)
        THEN RAISE EXCEPTION 'Used written assessments require a forward fix' USING ERRCODE='55000'; END IF;
    END; $guard$;
    DROP TRIGGER written_attempt_shape ON gradebook_attempts;
    DROP TABLE written_request_receipts,written_response_drafts,written_assessment_publications,written_assessment_drafts;
    DROP FUNCTION written_validate_draft(),written_validate_publication(),written_validate_response(),written_validate_attempt(),written_reject_history_change(),written_criterion_units(jsonb);
  `);
}
