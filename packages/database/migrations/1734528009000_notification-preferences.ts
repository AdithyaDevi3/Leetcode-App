import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('notification_preferences', {
    user_id: { type: 'uuid', notNull: true, references: 'users(id)', onDelete: 'CASCADE' },
    channel: { type: 'varchar(16)', notNull: true },
    enabled: { type: 'boolean', notNull: true, default: false },
    quiet_hours_start: { type: 'smallint' },
    quiet_hours_end: { type: 'smallint' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  }, { constraints: { primaryKey: ['user_id', 'channel'] } });
  pgm.addConstraint('notification_preferences', 'notification_preferences_channel_check', {
    check: "channel IN ('in_app', 'email', 'push')",
  });
  pgm.addConstraint('notification_preferences', 'notification_preferences_quiet_hours_pair_check', {
    check: '(quiet_hours_start IS NULL) = (quiet_hours_end IS NULL)',
  });
  pgm.addConstraint('notification_preferences', 'notification_preferences_quiet_hours_range_check', {
    check: '(quiet_hours_start IS NULL OR (quiet_hours_start >= 0 AND quiet_hours_start <= 23 AND quiet_hours_end >= 0 AND quiet_hours_end <= 23))',
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('notification_preferences');
}
