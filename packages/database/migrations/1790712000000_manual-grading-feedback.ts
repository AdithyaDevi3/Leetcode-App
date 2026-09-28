import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns('gradebook_grade_revisions', {
    private_note: { type: 'text', notNull: true, default: '' },
    learner_feedback: { type: 'text', notNull: true, default: '' },
  });
  pgm.addConstraint('gradebook_grade_revisions', 'gradebook_grade_private_note_length', {
    check: 'length(private_note) <= 10000',
  });
  pgm.addConstraint('gradebook_grade_revisions', 'gradebook_grade_learner_feedback_length', {
    check: 'length(learner_feedback) <= 10000',
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns('gradebook_grade_revisions', ['private_note', 'learner_feedback']);
}
