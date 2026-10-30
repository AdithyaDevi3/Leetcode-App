import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE learning_recommendation_selections (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      practice_id text NOT NULL CHECK (length(practice_id) BETWEEN 1 AND 200),
      content_id uuid NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
      decision_key text NOT NULL CHECK (decision_key ~ '^[a-f0-9]{64}$'),
      decision jsonb NOT NULL CHECK (jsonb_typeof(decision)='object' AND octet_length(decision::text) <= 100000),
      selected_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      outcome_source_key text,
      observed_outcome jsonb CHECK (observed_outcome IS NULL OR jsonb_typeof(observed_outcome)='object'),
      CHECK ((outcome_source_key IS NULL) = (observed_outcome IS NULL)),
      UNIQUE(user_id,outcome_source_key)
    );
    CREATE INDEX learning_recommendation_owner_idx ON learning_recommendation_selections(user_id,selected_at DESC,id DESC);
    CREATE INDEX learning_recommendation_pending_idx ON learning_recommendation_selections(user_id,content_id,selected_at DESC) WHERE observed_outcome IS NULL;
    -- Compact receipts outlive the bounded detail history so an uncertain old reply
    -- cannot turn into a different selection after retention pruning.
    CREATE TABLE learning_recommendation_receipts (
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      request_key text NOT NULL CHECK (length(request_key) BETWEEN 1 AND 128),
      input_fingerprint text NOT NULL CHECK (input_fingerprint ~ '^[a-f0-9]{64}$'),
      receipt jsonb NOT NULL CHECK (jsonb_typeof(receipt)='object'),
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      PRIMARY KEY(user_id,request_key)
    );
    CREATE INDEX learning_recommendation_receipt_selection_idx ON learning_recommendation_receipts(user_id,(receipt->>'selectionId'));
    CREATE FUNCTION learning_clear_recommendation_consent() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $function$
      BEGIN
        -- Existing consent processing locks the parent user before this AFTER trigger.
        IF NEW.personalization_opt_out THEN
          DELETE FROM public.learning_recommendation_selections WHERE user_id=NEW.user_id;
          DELETE FROM public.learning_recommendation_receipts WHERE user_id=NEW.user_id;
        END IF;
        RETURN NEW;
      END; $function$;
    CREATE TRIGGER learning_recommendation_consent AFTER INSERT OR UPDATE OF personalization_opt_out ON learner_profiles
      FOR EACH ROW EXECUTE FUNCTION learning_clear_recommendation_consent();
    ALTER TABLE learning_recommendation_selections ENABLE ROW LEVEL SECURITY;
    ALTER TABLE learning_recommendation_receipts ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE learning_recommendation_selections,learning_recommendation_receipts FROM PUBLIC,anon,authenticated;
    REVOKE ALL ON FUNCTION learning_clear_recommendation_consent() FROM PUBLIC,anon,authenticated;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DO $block$ BEGIN
      IF EXISTS(SELECT 1 FROM learning_recommendation_selections) OR EXISTS(SELECT 1 FROM learning_recommendation_receipts)
        OR EXISTS(SELECT 1 FROM learning_evidence_sources) OR EXISTS(SELECT 1 FROM learning_evidence_work)
        OR EXISTS(SELECT 1 FROM learning_concept_estimates) OR EXISTS(SELECT 1 FROM learning_practice_reports)
        OR EXISTS(SELECT 1 FROM learning_review_versions) OR EXISTS(SELECT 1 FROM learning_review_receipts)
      THEN RAISE EXCEPTION 'Cannot reverse used learning evidence storage; this migration is forward-only after use; preserve recommendation receipts with a forward fix' USING ERRCODE='55000'; END IF;
    END $block$;
    DROP TRIGGER learning_recommendation_consent ON learner_profiles;
    DROP FUNCTION learning_clear_recommendation_consent();
    DROP TABLE learning_recommendation_selections,learning_recommendation_receipts;
  `);
}
