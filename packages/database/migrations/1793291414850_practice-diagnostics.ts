import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE learning_evidence_work DROP CONSTRAINT learning_evidence_work_source_kind_check;
    ALTER TABLE learning_evidence_work ADD CONSTRAINT learning_evidence_work_source_kind_check CHECK(source_kind IN('quiz','practice','diagnostic'));
    ALTER TABLE learning_evidence_sources DROP CONSTRAINT learning_evidence_sources_source_kind_check;
    ALTER TABLE learning_evidence_sources ADD CONSTRAINT learning_evidence_sources_source_kind_check CHECK(source_kind IN('quiz','practice','diagnostic'));

    CREATE TABLE practice_diagnostics (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      selection_version text NOT NULL CHECK(length(selection_version) BETWEEN 1 AND 80),
      snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object' AND snapshot->>'scoringVersion'='multiple-choice-v1' AND jsonb_array_length(snapshot->'questions')=10),
      snapshot_hash text NOT NULL CHECK(snapshot_hash=encode(sha256(convert_to(snapshot::text,'UTF8')),'hex')),
      answers jsonb NOT NULL CHECK(jsonb_typeof(answers)='object'),
      answer_revision integer NOT NULL DEFAULT 0 CHECK(answer_revision>=0),
      result jsonb CHECK(jsonb_typeof(result)='object'),
      submit_request_key uuid,
      submitted_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      UNIQUE(user_id,selection_version),
      UNIQUE(id,user_id),
      CHECK((result IS NULL AND submitted_at IS NULL AND submit_request_key IS NULL) OR (result IS NOT NULL AND submitted_at IS NOT NULL AND submit_request_key IS NOT NULL))
    );
    CREATE INDEX practice_diagnostics_owner_idx ON practice_diagnostics(user_id,created_at DESC);
    CREATE TABLE practice_diagnostic_requests (
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      request_key uuid NOT NULL,
      diagnostic_id uuid NOT NULL,
      operation text NOT NULL CHECK(operation IN('save','submit')),
      input_fingerprint text NOT NULL CHECK(input_fingerprint ~ '^[a-f0-9]{64}$'),
      response jsonb NOT NULL CHECK(jsonb_typeof(response)='object'),
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      PRIMARY KEY(user_id,request_key),
      FOREIGN KEY(diagnostic_id,user_id) REFERENCES practice_diagnostics(id,user_id) ON DELETE CASCADE
    );
    CREATE INDEX practice_diagnostic_requests_diagnostic_idx ON practice_diagnostic_requests(diagnostic_id);

    CREATE FUNCTION diagnostic_validate_workspace() RETURNS trigger
      LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $function$
      DECLARE expected_items jsonb; expected_result jsonb;
      BEGIN
        IF current_user IN('anon','authenticated') THEN RAISE EXCEPTION 'Diagnostics are server owned' USING ERRCODE='42501'; END IF;
        IF TG_OP='INSERT' THEN
          IF NEW.answer_revision<>0 OR NEW.result IS NOT NULL OR EXISTS(SELECT 1 FROM jsonb_each(NEW.answers) a WHERE a.value<>'null'::jsonb)
            THEN RAISE EXCEPTION 'A diagnostic starts with unanswered work' USING ERRCODE='23514'; END IF;
        ELSE
          IF NEW.id<>OLD.id OR NEW.user_id<>OLD.user_id OR NEW.selection_version<>OLD.selection_version OR NEW.snapshot<>OLD.snapshot
            OR NEW.snapshot_hash<>OLD.snapshot_hash OR NEW.created_at<>OLD.created_at
            OR OLD.result IS NOT NULL
            OR (NEW.result IS NULL AND NEW.answer_revision<>OLD.answer_revision+1)
            OR (NEW.result IS NOT NULL AND (NEW.answers<>OLD.answers OR NEW.answer_revision<>OLD.answer_revision))
            THEN RAISE EXCEPTION 'Diagnostic state or revision is immutable' USING ERRCODE='23514'; END IF;
        END IF;
        IF (SELECT count(*) FROM jsonb_object_keys(NEW.answers))<>10 OR EXISTS(
          SELECT 1 FROM jsonb_each(NEW.answers) a WHERE NOT EXISTS(
            SELECT 1 FROM jsonb_array_elements(NEW.snapshot->'questions') q
            WHERE q->'question'->>'versionId'=a.key AND (a.value='null'::jsonb OR EXISTS(
              SELECT 1 FROM jsonb_array_elements(q->'question'->'options') o WHERE to_jsonb(o->>'id')=a.value))))
          THEN RAISE EXCEPTION 'Diagnostic answer does not match its frozen question' USING ERRCODE='23514'; END IF;
        IF NEW.result IS NOT NULL THEN
          SELECT jsonb_agg(jsonb_build_object(
            'questionVersionId',q.value->'question'->>'versionId',
            'selectedOptionId',NEW.answers->(q.value->'question'->>'versionId'),
            'correct',COALESCE(NEW.answers->>(q.value->'question'->>'versionId')=q.value->'question'->>'correctOptionId',false),
            'earnedUnits',CASE WHEN NEW.answers->>(q.value->'question'->>'versionId')=q.value->'question'->>'correctOptionId' THEN (q.value->>'maxUnits')::integer ELSE 0 END,
            'maxUnits',(q.value->>'maxUnits')::integer,
            'misconceptionTags',COALESCE((SELECT o->'misconceptionTags' FROM jsonb_array_elements(q.value->'question'->'options') o
              WHERE o->>'id'=NEW.answers->>(q.value->'question'->>'versionId')),'[]'::jsonb)
          ) ORDER BY q.ordinality) INTO expected_items FROM jsonb_array_elements(NEW.snapshot->'questions') WITH ORDINALITY q;
          expected_result=jsonb_build_object('scoringVersion','multiple-choice-v1','items',expected_items,'totalQuestions',10,
            'maxUnits',(NEW.snapshot->>'maxUnits')::integer,
            'earnedUnits',(SELECT sum((i->>'earnedUnits')::integer) FROM jsonb_array_elements(expected_items) i),
            'answeredCount',(SELECT count(*) FROM jsonb_array_elements(expected_items) i WHERE i->'selectedOptionId'<>'null'::jsonb),
            'correctCount',(SELECT count(*) FROM jsonb_array_elements(expected_items) i WHERE (i->>'correct')::boolean));
          IF NEW.result<>expected_result THEN RAISE EXCEPTION 'Diagnostic scoring must match its frozen answers' USING ERRCODE='23514'; END IF;
        END IF;
        RETURN NEW;
      END; $function$;
    CREATE TRIGGER diagnostic_workspace_shape BEFORE INSERT OR UPDATE ON practice_diagnostics FOR EACH ROW EXECUTE FUNCTION diagnostic_validate_workspace();

    CREATE FUNCTION diagnostic_queue_evidence() RETURNS trigger
      LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $function$
      BEGIN
        IF NEW.result IS NOT NULL AND OLD.result IS NULL AND NOT EXISTS(SELECT 1 FROM public.learner_profiles WHERE user_id=NEW.user_id AND personalization_opt_out) THEN
          INSERT INTO public.learning_evidence_work(user_id,source_kind,source_id) VALUES(NEW.user_id,'diagnostic',NEW.id)
            ON CONFLICT(user_id,source_kind,source_id) DO UPDATE SET revision=learning_evidence_work.revision+1,requested_at=clock_timestamp();
        END IF;
        RETURN NEW;
      END; $function$;
    CREATE TRIGGER diagnostic_learning_evidence AFTER UPDATE OF result ON practice_diagnostics FOR EACH ROW EXECUTE FUNCTION diagnostic_queue_evidence();
    CREATE FUNCTION diagnostic_remove_evidence() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $function$
      BEGIN
        DELETE FROM public.learning_evidence_sources WHERE user_id=OLD.user_id AND source_kind='diagnostic' AND source_id=OLD.id;
        DELETE FROM public.learning_evidence_work WHERE user_id=OLD.user_id AND source_kind='diagnostic' AND source_id=OLD.id;
        RETURN OLD;
      END; $function$;
    CREATE TRIGGER diagnostic_delete_evidence BEFORE DELETE ON practice_diagnostics FOR EACH ROW EXECUTE FUNCTION diagnostic_remove_evidence();
    CREATE FUNCTION diagnostic_request_immutable() RETURNS trigger
      LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $function$
      BEGIN RAISE EXCEPTION 'Diagnostic receipts are immutable' USING ERRCODE='23514'; END; $function$;
    CREATE TRIGGER diagnostic_request_no_update BEFORE UPDATE ON practice_diagnostic_requests FOR EACH ROW EXECUTE FUNCTION diagnostic_request_immutable();
  `);
  for (const table of ['practice_diagnostics','practice_diagnostic_requests']) pgm.sql(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY; REVOKE ALL ON TABLE ${table} FROM PUBLIC,anon,authenticated;`);
  for (const fn of ['diagnostic_validate_workspace','diagnostic_queue_evidence','diagnostic_remove_evidence','diagnostic_request_immutable']) pgm.sql(`REVOKE ALL ON FUNCTION ${fn}() FROM PUBLIC,anon,authenticated;`);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DO $block$ BEGIN IF EXISTS(SELECT 1 FROM practice_diagnostics) OR EXISTS(SELECT 1 FROM practice_diagnostic_requests)
      THEN RAISE EXCEPTION 'Used diagnostics require a forward migration' USING ERRCODE='55000'; END IF; END $block$;
    DROP TABLE practice_diagnostic_requests;
    DROP TABLE practice_diagnostics;
    DROP FUNCTION diagnostic_request_immutable(); DROP FUNCTION diagnostic_remove_evidence(); DROP FUNCTION diagnostic_queue_evidence(); DROP FUNCTION diagnostic_validate_workspace();
    ALTER TABLE learning_evidence_work DROP CONSTRAINT learning_evidence_work_source_kind_check;
    ALTER TABLE learning_evidence_work ADD CONSTRAINT learning_evidence_work_source_kind_check CHECK(source_kind IN('quiz','practice'));
    ALTER TABLE learning_evidence_sources DROP CONSTRAINT learning_evidence_sources_source_kind_check;
    ALTER TABLE learning_evidence_sources ADD CONSTRAINT learning_evidence_sources_source_kind_check CHECK(source_kind IN('quiz','practice'));
  `);
}
