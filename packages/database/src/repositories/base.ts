import type { PoolClient } from 'pg';

/** Convert a PostgreSQL row's top-level snake_case columns to API camelCase. */
export function mapDatabaseRow<T>(row: object): T {
  return Object.fromEntries(
    Object.entries(row as Record<string, unknown>).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
      value,
    ])
  ) as T;
}

export function mapDatabaseRows<T>(rows: object[]): T[] {
  return rows.map((row) => mapDatabaseRow<T>(row));
}

/**
 * Base repository interface with common CRUD operations
 */
export interface Repository<T, ID = string> {
  findById(id: ID, client?: PoolClient): Promise<T | null>;
  findAll(client?: PoolClient): Promise<T[]>;
  create(entity: Omit<T, 'id' | 'createdAt' | 'updatedAt'>, client?: PoolClient): Promise<T>;
  update(id: ID, entity: Partial<T>, revision: number, client?: PoolClient): Promise<T>;
  delete(id: ID, client?: PoolClient): Promise<void>;
}

/**
 * Optimistic concurrency error
 */
export class OptimisticConcurrencyError extends Error {
  constructor(message: string = 'Entity was modified by another transaction') {
    super(message);
    this.name = 'OptimisticConcurrencyError';
  }
}

/**
 * Entity not found error
 */
export class EntityNotFoundError extends Error {
  constructor(entityName: string, id: string) {
    super(`${entityName} with id ${id} not found`);
    this.name = 'EntityNotFoundError';
  }
}
