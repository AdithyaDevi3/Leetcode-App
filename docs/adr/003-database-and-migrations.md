# ADR-003: Database and Migrations

## Status

Accepted

## Context

The application requires persistent storage for user data, content, attempts, evaluations, and mastery tracking. We need a database that supports strong consistency, relational integrity, and safe schema evolution.

## Decision

### Database System

**PostgreSQL 16+ on managed service (AWS RDS, Google Cloud SQL, or Azure Database)**

Rationale:
- Strong ACID guarantees for financial/progress data
- Rich data types (JSONB, arrays, full-text search)
- Excellent query optimizer and indexing
- Proven at scale with proper partitioning
- Mature ecosystem and tooling

### Schema Design Principles

1. **UUID Primary Keys** - Avoid enumeration, enable distributed generation
2. **Explicit Timestamps** - `created_at`, `updated_at` in UTC (timestamptz)
3. **Soft Deletes Where Required** - `deleted_at` for audit and recovery
4. **Optimistic Concurrency** - Version columns for mutable user documents
5. **Immutable Content** - Versioned content/rubrics never updated, only deprecated
6. **Explicit State Machines** - State columns use enums, not booleans

### Migration Strategy

**Tool: Flyway or Prisma Migrate**

Migration Requirements:
- **Versioned:** Sequential numbering with descriptive names
- **Idempotent:** Migrations must be rerunnable
- **Tested:** Every migration has rollback test in CI
- **Reviewed:** Schema changes require explicit approval
- **Automated:** Migrations run automatically in deployment pipeline
- **Zero-Downtime:** Use expand-contract pattern for breaking changes

### Migration Naming Convention

```
V{version}__{description}.sql

Examples:
V001__initial_schema.sql
V002__add_user_preferences.sql
V003__add_attempt_versioning.sql
```

### Backup and Recovery

- **Automated Backups:** Daily with 30-day retention
- **Point-in-Time Recovery:** Enabled with 7-day window
- **Regional Replication:** Read replicas in same region for scaling
- **Disaster Recovery:** Cross-region backup for production only

### Data Retention

- **Transactional Data:** Retained per ADR-001 retention policy
- **Audit Logs:** 1 year retention
- **AI Processing Logs:** 30 days
- **Deleted User Data:** Hard deleted after 30-day grace period

## Consequences

### Easier

- Strong consistency guarantees for critical data
- Rich querying with SQL and indexes
- Mature migration tooling
- Excellent monitoring and tuning tools

### More Difficult

- Requires careful schema design for performance
- Migration rollbacks need explicit testing
- Cost increases with storage and IOPS
- Vertical scaling limits (though high for our scale)

## Review Date

2027-08-17 (1 year) - Review performance metrics, consider read replicas or partitioning strategies

## Owners

- Backend Lead: Schema design and migration strategy
- DevOps Lead: Backup, monitoring, and infrastructure
