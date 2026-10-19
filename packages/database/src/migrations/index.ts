import { runner } from 'node-pg-migrate';
import path from 'node:path';
import type { DatabaseConfig } from '../client.js';

export async function runMigrations(
  config: DatabaseConfig,
  direction: 'up' | 'down' = 'up',
  migrationsDirectory = path.resolve(process.cwd(), 'migrations'),
): Promise<void> {
  await runner({
    databaseUrl: `postgresql://${encodeURIComponent(config.user)}:${encodeURIComponent(config.password)}@${config.host}:${config.port}/${encodeURIComponent(config.database)}${config.ssl ? '?sslmode=require' : ''}`,
    direction,
    dir: migrationsDirectory,
    migrationsTable: 'pgmigrations',
    count: Infinity,
    createSchema: true,
    createMigrationsSchema: true,
    checkOrder: true,
  });
}
