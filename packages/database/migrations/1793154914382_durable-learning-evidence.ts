import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE learning_review_versions (
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      concept_id text NOT NULL,
      revision integer NOT NULL CHECK (revision > 0),
      PRIMARY KEY(user_id,concept_id)
    );
    CREATE TABLE learning_evidence_work (
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source_kind text NOT NULL CHECK (source_kind IN ('quiz','practice')),
      source_id uuid NOT NULL,
      revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
      processed_revision bigint NOT NULL DEFAULT 0 CHECK (processed_revision >= 0 AND processed_revision <= revision),
      requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      PRIMARY KEY (user_id,source_kind,source_id)
    );
    CREATE INDEX learning_evidence_work_pending_idx ON learning_evidence_work(user_id,requested_at) WHERE processed_revision < revision;
    CREATE TABLE learning_practice_reports (
      session_id uuid PRIMARY KEY REFERENCES practice_sessions(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content_id uuid NOT NULL,
      request_id text NOT NULL,
      grade jsonb NOT NULL CHECK (jsonb_typeof(grade)='object'),
      verified_at timestamptz NOT NULL,
      captured_at timestamptz NOT NULL DEFAULT clock_timestamp()
    );
    CREATE INDEX learning_practice_reports_owner_idx ON learning_practice_reports(user_id);
    CREATE TABLE learning_evidence_sources (
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source_kind text NOT NULL CHECK (source_kind IN ('quiz','practice')),
      source_id uuid NOT NULL,
      source_revision text NOT NULL,
      observations jsonb NOT NULL CHECK (jsonb_typeof(observations)='array'),
      PRIMARY KEY(user_id,source_kind,source_id)
    );
    CREATE TABLE learning_concept_estimates (
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      concept_id text NOT NULL,
      algorithm_version text NOT NULL,
      estimate jsonb NOT NULL CHECK (jsonb_typeof(estimate)='object'),
      evidence_fingerprint text NOT NULL,
      review_due_at timestamptz NOT NULL,
      review_revision integer NOT NULL CHECK (review_revision > 0),
      PRIMARY KEY(user_id,concept_id)
    );
    CREATE TABLE learning_review_receipts (
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      request_key text NOT NULL CHECK (length(request_key) BETWEEN 1 AND 128),
      input_fingerprint text NOT NULL,
      receipt jsonb NOT NULL CHECK (jsonb_typeof(receipt)='object'),
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      PRIMARY KEY(user_id,request_key)
    );
    CREATE FUNCTION learning_queue_quiz_source() RETURNS trigger
      LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $function$
      DECLARE owner_id uuid;
      BEGIN
        SELECT learner_id INTO owner_id FROM public.gradebook_recipients WHERE id=NEW.recipient_id;
        IF owner_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.learner_profiles WHERE user_id=owner_id AND personalization_opt_out) THEN
          INSERT INTO public.learning_evidence_work(user_id,source_kind,source_id) VALUES(owner_id,'quiz',NEW.recipient_id)
          ON CONFLICT(user_id,source_kind,source_id) DO UPDATE SET revision=learning_evidence_work.revision+1,requested_at=clock_timestamp();
        END IF;
        RETURN NEW;
      END; $function$;
    CREATE TRIGGER learning_quiz_release AFTER INSERT ON gradebook_publications FOR EACH ROW EXECUTE FUNCTION learning_queue_quiz_source();
    CREATE TRIGGER learning_quiz_applicability AFTER INSERT ON gradebook_applicability_revisions FOR EACH ROW EXECUTE FUNCTION learning_queue_quiz_source();
    CREATE TRIGGER learning_quiz_dispute AFTER INSERT ON gradebook_dispute_events FOR EACH ROW EXECUTE FUNCTION learning_queue_quiz_source();
    CREATE FUNCTION learning_capture_practice_report() RETURNS trigger
      LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $function$
      DECLARE report jsonb; reserved jsonb;
      BEGIN
        IF current_user IN ('anon','authenticated') AND (
          (TG_OP='INSERT' AND (NEW.session_metadata ? 'verification' OR NEW.session_metadata ? 'verificationRequest'))
          OR (TG_OP='UPDATE' AND (NEW.session_metadata->'verification' IS DISTINCT FROM OLD.session_metadata->'verification'
            OR NEW.session_metadata->'verificationRequest' IS DISTINCT FROM OLD.session_metadata->'verificationRequest'))
        ) THEN RAISE EXCEPTION 'Practice verification is server owned' USING ERRCODE='42501'; END IF;
        IF TG_OP='INSERT' THEN RETURN NEW; END IF;
        IF NEW.session_metadata->'verification' IS NOT DISTINCT FROM OLD.session_metadata->'verification' THEN RETURN NEW; END IF;
        IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
        report=NEW.session_metadata->'verification'; reserved=OLD.session_metadata->'verificationRequest';
        IF report IS NULL OR jsonb_typeof(report)<>'object'
          OR reserved IS NULL OR jsonb_typeof(reserved)<>'object'
          OR reserved->>'id' IS NULL OR report->>'requestId' IS DISTINCT FROM reserved->>'id'
          OR NEW.session_metadata->'verificationRequest' IS DISTINCT FROM reserved
          OR report->>'source' IS DISTINCT FROM reserved->>'source'
          OR report->>'language' IS DISTINCT FROM reserved->>'language'
          OR jsonb_typeof(report->'grade') IS DISTINCT FROM 'object'
          OR report->>'verifiedAt' IS NULL
        THEN RAISE EXCEPTION 'Practice report requires its reserved server request' USING ERRCODE='23514'; END IF;
        IF EXISTS (SELECT 1 FROM public.learner_profiles WHERE user_id=NEW.user_id AND personalization_opt_out) THEN RETURN NEW; END IF;
        INSERT INTO public.learning_practice_reports(session_id,user_id,content_id,request_id,grade,verified_at)
          VALUES(NEW.id,NEW.user_id,NEW.content_id,reserved->>'id',report->'grade',(report->>'verifiedAt')::timestamptz)
          ON CONFLICT(session_id) DO UPDATE SET user_id=EXCLUDED.user_id,content_id=EXCLUDED.content_id,
            request_id=EXCLUDED.request_id,grade=EXCLUDED.grade,verified_at=EXCLUDED.verified_at,captured_at=clock_timestamp();
        INSERT INTO public.learning_evidence_work(user_id,source_kind,source_id) VALUES(NEW.user_id,'practice',NEW.id)
          ON CONFLICT(user_id,source_kind,source_id) DO UPDATE SET revision=learning_evidence_work.revision+1,requested_at=clock_timestamp();
        RETURN NEW;
      END; $function$;
    CREATE TRIGGER learning_practice_report BEFORE INSERT OR UPDATE ON practice_sessions FOR EACH ROW EXECUTE FUNCTION learning_capture_practice_report();
    CREATE FUNCTION learning_clear_deleted_source() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $function$
      BEGIN
        DELETE FROM public.learning_evidence_sources WHERE source_id=OLD.id AND source_kind=CASE WHEN TG_TABLE_NAME='practice_sessions' THEN 'practice' ELSE 'quiz' END;
        DELETE FROM public.learning_evidence_work WHERE source_id=OLD.id AND source_kind=CASE WHEN TG_TABLE_NAME='practice_sessions' THEN 'practice' ELSE 'quiz' END;
        RETURN OLD;
      END; $function$;
    CREATE TRIGGER learning_practice_delete BEFORE DELETE ON practice_sessions FOR EACH ROW EXECUTE FUNCTION learning_clear_deleted_source();
    CREATE TRIGGER learning_quiz_delete BEFORE DELETE ON gradebook_recipients FOR EACH ROW EXECUTE FUNCTION learning_clear_deleted_source();
    CREATE FUNCTION learning_personalization_consent() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $function$
      BEGIN
        PERFORM id FROM public.users WHERE id=NEW.user_id FOR UPDATE;
        IF NEW.personalization_opt_out THEN
          DELETE FROM public.learning_concept_estimates WHERE user_id=NEW.user_id;
          DELETE FROM public.learning_evidence_sources WHERE user_id=NEW.user_id;
          DELETE FROM public.learning_evidence_work WHERE user_id=NEW.user_id;
          DELETE FROM public.learning_practice_reports WHERE user_id=NEW.user_id;
        END IF;
        RETURN NEW;
      END; $function$;
    CREATE TRIGGER learning_consent BEFORE INSERT OR UPDATE OF personalization_opt_out ON learner_profiles FOR EACH ROW EXECUTE FUNCTION learning_personalization_consent();
  `);
  for (const table of ['learning_review_versions','learning_evidence_work','learning_practice_reports','learning_evidence_sources','learning_concept_estimates','learning_review_receipts']) {
    pgm.sql(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY; REVOKE ALL ON TABLE ${table} FROM PUBLIC,anon,authenticated;`);
  }
  for (const name of ['learning_queue_quiz_source','learning_capture_practice_report','learning_clear_deleted_source','learning_personalization_consent']) {
    pgm.sql(`REVOKE ALL ON FUNCTION ${name}() FROM PUBLIC,anon,authenticated;`);
  }
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DO $block$ BEGIN
      IF EXISTS(SELECT 1 FROM learning_review_versions) OR EXISTS(SELECT 1 FROM learning_evidence_work)
        OR EXISTS(SELECT 1 FROM learning_practice_reports) OR EXISTS(SELECT 1 FROM learning_evidence_sources)
        OR EXISTS(SELECT 1 FROM learning_concept_estimates) OR EXISTS(SELECT 1 FROM learning_review_receipts)
      THEN RAISE EXCEPTION 'Cannot reverse used learning evidence storage; this migration is forward-only after use' USING ERRCODE='55000'; END IF;
    END $block$;
    DROP TRIGGER learning_consent ON learner_profiles;
    DROP TRIGGER learning_quiz_release ON gradebook_publications;
    DROP TRIGGER learning_quiz_applicability ON gradebook_applicability_revisions;
    DROP TRIGGER learning_quiz_dispute ON gradebook_dispute_events;
    DROP TRIGGER learning_practice_report ON practice_sessions;
    DROP TRIGGER learning_practice_delete ON practice_sessions;
    DROP TRIGGER learning_quiz_delete ON gradebook_recipients;
    DROP FUNCTION learning_personalization_consent();
    DROP FUNCTION learning_queue_quiz_source();
    DROP FUNCTION learning_capture_practice_report();
    DROP FUNCTION learning_clear_deleted_source();
    DROP TABLE learning_review_receipts,learning_concept_estimates,learning_evidence_sources,learning_practice_reports,learning_evidence_work,learning_review_versions;
  `);
}
