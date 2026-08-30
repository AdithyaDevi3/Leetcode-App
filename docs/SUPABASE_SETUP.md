# Supabase production integration

Supabase is the production identity and PostgreSQL platform for the application.
Vercel runs the Next.js web service; local Docker PostgreSQL is retained only as
an optional development fallback. The application uses Supabase email/password
Auth and the server-only PostgreSQL repository layer.

## 1. Configure public client values

In `apps/web/.env.local`, set the public project values supplied by Supabase:

```ini
NEXT_PUBLIC_SUPABASE_URL=https://gxbznjytsgrabmvjtyje.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

The publishable key is safe to expose to the browser. It is not a substitute
for row-level security and must never be used as a server administrator key.

## 2. Connect the PostgreSQL repository layer

Get the server-only connection string from the Supabase project's Connect
dialog. Put it in `apps/web/.env.local` as `DATABASE_URL`; use a pooler URL for
serverless production deployments and include `sslmode=require`.

```ini
DATABASE_URL=postgresql://postgres.your-project-ref:your-password@your-host:6543/postgres?sslmode=require
```

When `DATABASE_URL` exists, `DatabaseClient` uses it in preference to the five
local `POSTGRES_*` variables. This preserves local Docker development while
letting the current repositories run against Supabase Postgres.

## 3. Apply the migration chain

Run the repository migration workflow against a staging Supabase project first,
then against production after review. The current chain includes the original
curriculum, durable guest workspace state, and learner question/feature
requests. Record the migration result and verify `pgmigrations`, application
tables, seeded content, and authenticated API paths. Never paste a connection
string into source control, CI logs, PR descriptions, or chat.

From the repository root, with `DATABASE_URL` exported in the shell:

```bash
pnpm --filter @leetcode-app/database run migrate:up
```

The current Supabase project was previously verified through
`1734528009000_notification-preferences`; production still needs migrations
`1734528010000`, `1734528012000`, `1734528013000`, and `1734528014000`.

## Authentication boundary

Supabase Auth owns sign-up, email confirmation, sign-in, sign-out, and session
refresh. The app maps authenticated Supabase users to its `public.users` row and
keeps guest practice state separate until account upgrade. Do not reintroduce
NextAuth or a second session system. Keep service/database credentials
server-only; browser code may use only the publishable key.

## Validation checklist

- Run `pnpm --filter web test` and `pnpm --filter web typecheck`.
- With only `POSTGRES_*`, verify local Docker PostgreSQL behavior is unchanged.
- With `DATABASE_URL`, run the full migration chain against a staging Supabase
  project and verify learner/auth API paths.
- Keep application database access server-side unless a feature explicitly uses
  the Supabase Data API; every exposed table needs explicit grants, RLS, and
  ownership tests.
