import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { DatabaseClient, createDatabaseClient, type DatabaseConfig } from '../src/client.js';
import { runMigrations } from '../src/migrations/index.js';
import { prepareSupabaseTestDatabase } from './support/supabase.js';

let container: StartedTestContainer;
let dbClient: DatabaseClient;
let dbConfig: DatabaseConfig;

beforeAll(async () => {
  // Start PostgreSQL container
  container = await new GenericContainer('postgres:16-alpine')
    .withEnvironment({
      POSTGRES_USER: 'test',
      POSTGRES_PASSWORD: 'test',
      POSTGRES_DB: 'testdb',
    })
    .withExposedPorts(5432)
    .start();

  // Configure database connection
  dbConfig = {
    host: container.getHost(),
    port: container.getMappedPort(5432),
    database: 'testdb',
    user: 'test',
    password: 'test',
  };

  // Create client and run migrations
  dbClient = createDatabaseClient(dbConfig);
  await prepareSupabaseTestDatabase(dbClient);
  await runMigrations(dbConfig, 'up');
}, 60000);

afterAll(async () => {
  await dbClient.close();
  await container.stop();
});

describe('DatabaseClient', () => {
  it('should execute simple query', async () => {
    const result = await dbClient.query('SELECT 1 as value');
    expect(result.rows[0].value).toBe(1);
  });

  it('should execute parameterized query', async () => {
    const result = await dbClient.query('SELECT $1 as value', ['hello']);
    expect(result.rows[0].value).toBe('hello');
  });

  it('should handle transactions with commit', async () => {
    const userId = await dbClient.transaction(async (client) => {
      const result = await client.query(
        `INSERT INTO users (email, display_name, role) 
         VALUES ($1, $2, $3) 
         RETURNING id`,
        ['test@example.com', 'Test User', 'learner']
      );
      return result.rows[0].id;
    });

    const result = await dbClient.query('SELECT * FROM users WHERE id = $1', [userId]);
    expect(result.rows[0].email).toBe('test@example.com');
  });

  it('should handle transactions with rollback', async () => {
    await expect(async () => {
      await dbClient.transaction(async (client) => {
        await client.query(
          `INSERT INTO users (email, display_name, role) 
           VALUES ($1, $2, $3)`,
          ['rollback@example.com', 'Rollback User', 'learner']
        );
        throw new Error('Force rollback');
      });
    }).rejects.toThrow('Force rollback');

    const result = await dbClient.query('SELECT * FROM users WHERE email = $1', [
      'rollback@example.com',
    ]);
    expect(result.rows.length).toBe(0);
  });
});
