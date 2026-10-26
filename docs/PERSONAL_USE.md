# Personal and local use

Use [usage](USAGE.md) to run Method locally. The repository uses Node.js, pnpm,
and a Docker PostgreSQL service. Some guest UI flows work without hosted services;
account authentication and isolated code execution require their own settings.

## Data responsibilities

Browser drafts and local learning estimates belong to the current device.
Clearing browser storage can remove them. Account-backed features use the
configured database, so check synchronization before changing devices.

The local database uses a persistent Docker volume. Stopping it with pnpm db:down
preserves data; removing the volume deletes it. Use synthetic data for local
development. Keep database exports in private storage and test restoration before
relying on a backup. Never commit exports, credentials, or learner records.

Detailed planning and reference material is local working data. Git ignore rules
prevent routine staging but do not back it up. Preserve private documents through
an owner-controlled backup outside the public repository when needed.

## Hosted integrations and costs

Keep code execution disabled for ordinary local UI work. Do not execute submitted
code directly in the application server as a substitute for an isolated provider.
Default automated tests use safe fixtures and should not call paid services.

Hosting, authentication, database, and sandbox providers have their own permitted
uses and quotas. Existing adapters do not guarantee free unlimited operation.
Check the current provider terms and usage settings before enabling hosted users
or code verification. Keep private keys server-side and use the example
environment file only as a configuration template.

## Support and distribution

The maintained code line is main. Report reproducible bugs with sanitized
examples; use [SECURITY.md](../SECURITY.md) for sensitive issues. Check third-party
dependency licenses, content provenance, and hosting terms before redistributing
or operating the app. Do not assume public problem statements are reusable.
