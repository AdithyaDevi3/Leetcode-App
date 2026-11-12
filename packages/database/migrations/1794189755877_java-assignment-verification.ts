import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`ALTER TABLE gradebook_verification_jobs
    DROP CONSTRAINT gradebook_verification_jobs_language_check,
    ADD CONSTRAINT gradebook_verification_jobs_language_check
      CHECK (language IN ('python','cpp','typescript','java'))`);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // A rollback with Java evidence must fail atomically rather than delete it.
  pgm.sql(`ALTER TABLE gradebook_verification_jobs
    DROP CONSTRAINT gradebook_verification_jobs_language_check,
    ADD CONSTRAINT gradebook_verification_jobs_language_check
      CHECK (language IN ('python','cpp','typescript'))`);
}
