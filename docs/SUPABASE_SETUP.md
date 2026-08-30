# Supabase staged integration

Supabase is introduced as this repository's managed PostgreSQL provider first.
The existing NextAuth sign-in and repository layer remain in place during this
stage, so enabling these variables does not change learner sign-in behavior or
replace the practice workspace with the Supabase `todos` example.

## 1. Configure public client values

In `apps/web/.env.local`, set the public project values supplied by Supabase:

```ini
NEXT_PUBLIC_SUPABASE_URL=https://gxbznjytsgrabmvjtyje.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

The publishable key is safe to expose to the browser. It is not a substitute
for row-level security and must never be used as a server administrator key.

## 2. Connect the existing PostgreSQL repository layer

Get the server-only connection string from the Supabase project's Connect
dialog. Put it in `apps/web/.env.local` as `DATABASE_URL`; use a pooler URL for
serverless production deployments and include `sslmode=require`.

```ini
DATABASE_URL=postgresql://postgres.your-project-ref:your-password@your-host:6543/postgres?sslmode=require
```

When `DATABASE_URL` exists, `DatabaseClient` uses it in preference to the five
local `POSTGRES_*` variables. This preserves local Docker development while
letting the current repositories run against Supabase Postgres.

## 3. Apply the existing migration chain

Use the repository migration workflow against a non-production Supabase
database before pointing any deployed environment at it. Record the migration
result, verify the NextAuth tables and application tables, and exercise the
existing authenticated API paths. Do not paste a connection string into source
control, CI logs, PR descriptions, or chat.

## Authentication boundary

`createSupabaseBrowserClient` and `createSupabaseServerClient` are available for
new Supabase-backed features. They are not wired into `middleware.ts` yet.
Adding Supabase Auth session refresh while NextAuth owns sign-in would create two
independent session systems. A dedicated later migration must move providers,
map users, enable and test RLS policies, and then retire NextAuth.

## Validation checklist

- Run `pnpm --filter web test` and `pnpm --filter web typecheck`.
- With only `POSTGRES_*`, verify local Docker PostgreSQL behavior is unchanged.
- With `DATABASE_URL`, run migrations against a non-production Supabase project
  and verify the API paths that persist learner data.
- Before enabling browser table access, add explicit RLS policies and tests for
  every exposed table.
