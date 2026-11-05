import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';
export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE class_announcements (
      id uuid PRIMARY KEY,
      class_id uuid NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp()
    );
    CREATE INDEX class_announcements_class_idx ON class_announcements(class_id,created_at DESC,id DESC);
    CREATE INDEX class_announcements_author_idx ON class_announcements(created_by);
    CREATE TABLE class_announcement_revisions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      announcement_id uuid NOT NULL REFERENCES class_announcements(id) ON DELETE CASCADE,
      sequence integer NOT NULL CHECK(sequence>0),
      title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 160),
      body text NOT NULL CHECK(length(btrim(body)) BETWEEN 1 AND 20000 AND octet_length(body)<=80000),
      actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      UNIQUE(announcement_id,sequence)
    );
    CREATE INDEX class_announcement_revisions_actor_idx ON class_announcement_revisions(actor_id);
    CREATE TABLE class_announcement_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      class_id uuid NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
      announcement_id uuid NOT NULL REFERENCES class_announcements(id) ON DELETE CASCADE,
      actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
      request_key uuid NOT NULL,
      fingerprint text NOT NULL CHECK(fingerprint ~ '^[0-9a-f]{64}$'),
      action text NOT NULL CHECK(action IN ('save','publish','archive','read')),
      sequence integer NOT NULL CHECK(sequence>0),
      revision_id uuid REFERENCES class_announcement_revisions(id) ON DELETE CASCADE,
      publication_sequence integer CHECK(publication_sequence>0),
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      UNIQUE(actor_id,request_key),
      CHECK((action='save' AND revision_id IS NOT NULL AND publication_sequence IS NULL)
        OR (action IN ('publish','read') AND revision_id IS NOT NULL AND publication_sequence=sequence)
        OR (action='archive' AND revision_id IS NULL AND publication_sequence IS NULL))
    );
    CREATE UNIQUE INDEX class_announcement_author_sequence_idx ON class_announcement_events(announcement_id,sequence) WHERE action<>'read';
    CREATE INDEX class_announcement_events_class_idx ON class_announcement_events(class_id);
    CREATE INDEX class_announcement_events_announcement_idx ON class_announcement_events(announcement_id);
    CREATE INDEX class_announcement_events_actor_idx ON class_announcement_events(actor_id);
    CREATE INDEX class_announcement_events_revision_idx ON class_announcement_events(revision_id);
    CREATE INDEX class_announcement_events_lifecycle_idx ON class_announcement_events(announcement_id,sequence DESC) WHERE action IN ('publish','archive');
    CREATE TABLE class_announcement_reads (
      announcement_id uuid NOT NULL REFERENCES class_announcements(id) ON DELETE CASCADE,
      learner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      publication_id uuid NOT NULL REFERENCES class_announcement_events(id) ON DELETE CASCADE,
      publication_sequence integer NOT NULL CHECK(publication_sequence>0),
      updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      PRIMARY KEY(announcement_id,learner_id)
    );
    CREATE INDEX class_announcement_reads_learner_idx ON class_announcement_reads(learner_id);
    CREATE INDEX class_announcement_reads_publication_idx ON class_announcement_reads(publication_id);

    CREATE FUNCTION class_announcement_immutable() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
    BEGIN
      -- Account deletion anonymizes attribution while retaining the published class history.
      IF pg_trigger_depth()>1 AND TG_ARGV[0] IS NOT NULL
        AND to_jsonb(NEW)->TG_ARGV[0]='null'::jsonb
        AND (to_jsonb(OLD)->>TG_ARGV[0]) IS NOT NULL
        AND (to_jsonb(NEW)-TG_ARGV[0])=(to_jsonb(OLD)-TG_ARGV[0])
        AND NOT EXISTS(SELECT 1 FROM public.users WHERE id=(to_jsonb(OLD)->>TG_ARGV[0])::uuid) THEN RETURN NEW; END IF;
      RAISE EXCEPTION 'Announcement history is immutable' USING ERRCODE='23514';
    END; $fn$;
    REVOKE ALL ON FUNCTION class_announcement_immutable() FROM PUBLIC,anon,authenticated;
    CREATE FUNCTION class_announcement_delete_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
    BEGIN
      IF pg_trigger_depth()>1 AND (
        (TG_TABLE_NAME='class_announcements' AND NOT EXISTS(SELECT 1 FROM public.classrooms WHERE id=(to_jsonb(OLD)->>'class_id')::uuid))
        OR (TG_TABLE_NAME<>'class_announcements' AND NOT EXISTS(SELECT 1 FROM public.class_announcements a JOIN public.classrooms c ON c.id=a.class_id WHERE a.id=(to_jsonb(OLD)->>'announcement_id')::uuid))
      ) THEN RETURN OLD; END IF;
      RAISE EXCEPTION 'Announcement history cannot be deleted independently' USING ERRCODE='23514';
    END; $fn$;
    REVOKE ALL ON FUNCTION class_announcement_delete_guard() FROM PUBLIC,anon,authenticated;
    CREATE TRIGGER class_announcements_delete BEFORE DELETE ON class_announcements FOR EACH ROW EXECUTE FUNCTION class_announcement_delete_guard();
    CREATE TRIGGER class_announcement_revisions_delete BEFORE DELETE ON class_announcement_revisions FOR EACH ROW EXECUTE FUNCTION class_announcement_delete_guard();
    CREATE TRIGGER class_announcement_events_delete BEFORE DELETE ON class_announcement_events FOR EACH ROW EXECUTE FUNCTION class_announcement_delete_guard();

    CREATE FUNCTION class_announcement_revision_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
    BEGIN
      IF NEW.actor_id IS NULL OR NEW.sequence<>(SELECT COALESCE(MAX(sequence),0)+1 FROM public.class_announcement_revisions WHERE announcement_id=NEW.announcement_id) THEN
        RAISE EXCEPTION 'Announcement revision sequence or author is invalid' USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END; $fn$;
    REVOKE ALL ON FUNCTION class_announcement_revision_guard() FROM PUBLIC,anon,authenticated;
    CREATE TRIGGER class_announcement_revision_scope BEFORE INSERT ON class_announcement_revisions FOR EACH ROW EXECUTE FUNCTION class_announcement_revision_guard();
    CREATE FUNCTION class_announcement_event_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
    DECLARE prior_sequence integer; selected_revision uuid;
    BEGIN
      IF NEW.actor_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.class_announcements WHERE id=NEW.announcement_id AND class_id=NEW.class_id) THEN
        RAISE EXCEPTION 'Announcement command must match its class and actor' USING ERRCODE='23514';
      END IF;
      IF NEW.revision_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.class_announcement_revisions WHERE id=NEW.revision_id AND announcement_id=NEW.announcement_id) THEN
        RAISE EXCEPTION 'Announcement revision belongs to a different announcement' USING ERRCODE='23514';
      END IF;
      IF NEW.action<>'read' THEN
        SELECT COALESCE(MAX(sequence),0) INTO prior_sequence FROM public.class_announcement_events WHERE announcement_id=NEW.announcement_id AND action<>'read';
        IF NEW.sequence<>prior_sequence+1 THEN RAISE EXCEPTION 'Announcement command sequence changed' USING ERRCODE='23514'; END IF;
        IF NEW.action IN ('save','publish') THEN
          SELECT id INTO selected_revision FROM public.class_announcement_revisions WHERE announcement_id=NEW.announcement_id ORDER BY sequence DESC LIMIT 1;
          IF NEW.revision_id IS DISTINCT FROM selected_revision THEN RAISE EXCEPTION 'Only the latest saved revision can be published' USING ERRCODE='23514'; END IF;
        END IF;
      ELSE
        IF NOT EXISTS(SELECT 1 FROM public.class_announcement_events WHERE announcement_id=NEW.announcement_id AND action='publish' AND sequence=NEW.publication_sequence AND revision_id=NEW.revision_id) THEN
          RAISE EXCEPTION 'Read receipt must pin a published revision' USING ERRCODE='23514';
        END IF;
      END IF;
      RETURN NEW;
    END; $fn$;
    REVOKE ALL ON FUNCTION class_announcement_event_guard() FROM PUBLIC,anon,authenticated;
    CREATE TRIGGER class_announcement_event_scope BEFORE INSERT ON class_announcement_events FOR EACH ROW EXECUTE FUNCTION class_announcement_event_guard();
    CREATE FUNCTION class_announcement_read_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
    BEGIN
      IF NOT EXISTS(SELECT 1 FROM public.class_announcement_events WHERE id=NEW.publication_id AND announcement_id=NEW.announcement_id AND action='publish' AND sequence=NEW.publication_sequence) THEN
        RAISE EXCEPTION 'Read state must match the published announcement' USING ERRCODE='23514';
      END IF;
      IF TG_OP='UPDATE' AND (NEW.announcement_id<>OLD.announcement_id OR NEW.learner_id<>OLD.learner_id OR NEW.publication_sequence<OLD.publication_sequence) THEN
        RAISE EXCEPTION 'Read state cannot change owner or move backwards' USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END; $fn$;
    REVOKE ALL ON FUNCTION class_announcement_read_guard() FROM PUBLIC,anon,authenticated;
    CREATE TRIGGER class_announcement_read_scope BEFORE INSERT OR UPDATE ON class_announcement_reads FOR EACH ROW EXECUTE FUNCTION class_announcement_read_guard();
    CREATE TRIGGER class_announcements_immutable BEFORE UPDATE ON class_announcements FOR EACH ROW EXECUTE FUNCTION class_announcement_immutable('created_by');
    CREATE TRIGGER class_announcement_revisions_immutable BEFORE UPDATE ON class_announcement_revisions FOR EACH ROW EXECUTE FUNCTION class_announcement_immutable('actor_id');
    CREATE TRIGGER class_announcement_events_immutable BEFORE UPDATE ON class_announcement_events FOR EACH ROW EXECUTE FUNCTION class_announcement_immutable('actor_id');
  `);
  for (const table of ['class_announcements','class_announcement_revisions','class_announcement_events','class_announcement_reads']) {
    pgm.sql(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY; REVOKE ALL ON TABLE ${table} FROM PUBLIC,anon,authenticated;`);
  }
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DO $guard$ BEGIN IF EXISTS(SELECT 1 FROM class_announcement_events) THEN
    RAISE EXCEPTION 'Announcement history is forward-only after use' USING ERRCODE='55000'; END IF; END; $guard$;
    DROP TABLE class_announcement_reads; DROP TABLE class_announcement_events; DROP TABLE class_announcement_revisions; DROP TABLE class_announcements;
    DROP FUNCTION class_announcement_delete_guard(); DROP FUNCTION class_announcement_read_guard(); DROP FUNCTION class_announcement_event_guard(); DROP FUNCTION class_announcement_revision_guard(); DROP FUNCTION class_announcement_immutable();`);
}
