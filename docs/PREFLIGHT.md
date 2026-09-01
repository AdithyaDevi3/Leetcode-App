# Preflight Checks

`pnpm preflight` runs the same mandatory repository checks CI runs before you
open a pull request, so failures show up on your machine instead of in a CI
run you have to wait on.

## What it does

Running `pnpm preflight` (or `node scripts/preflight.mjs` directly) executes,
in order:

1. **Install** — `pnpm install --frozen-lockfile` so dependency declarations
   cannot silently rewrite the lockfile.
2. **Shared builds** — builds the domain and database workspaces used through
   their package exports.
3. **Lint** — verifies ESLint without changing source files.
4. **Type check** — runs `tsc --noEmit` against the web workspace.
5. **Workspace tests** — `pnpm -r test`, covering every workspace package.
6. **Production build** — `pnpm --filter web build`.
7. **Browser tests** — runs the Playwright critical learner journey.

Each step prints a pass/fail line in a summary at the end, so you can see at a
glance what needs attention.

## Non-mutating validation

Preflight does not auto-fix or rewrite source. Make intentional fixes in a
reviewable diff, then run it again. Install the Chromium runtime once with
`pnpm --filter web exec playwright install chromium` if Playwright reports
that the local browser is missing.

## When to run it

- Before opening any pull request.
- After resolving merge conflicts, especially in `package.json`,
  `tsconfig.base.json`, or CI configuration.
- Whenever CI fails on a pushed branch and you want to reproduce the failure
  locally instead of waiting for another CI run.

## Exit codes

The script exits `0` only if shared builds, lint, typecheck, workspace tests,
the production build, and browser tests all pass. Any other outcome exits
non-zero.

## Related

- [`.npmrc`](../.npmrc) disables pnpm's self-managed package manager version
  switching, which otherwise can fail with an `ENOENT` or `fetch failed` error
  when it cannot resolve the pinned `packageManager` version. See
  [DEVELOPMENT.md](DEVELOPMENT.md#pnpm-self-managed-version-note) for details.
