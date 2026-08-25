# Preflight Checks

`pnpm preflight` runs the same checks CI runs for the web workspace before you
open a pull request, so failures show up on your machine instead of in a CI
run you have to wait on.

## What it does

Running `pnpm preflight` (or `node scripts/preflight.mjs` directly) executes,
in order:

1. **Install** — `pnpm install --filter web...` so the workspace matches what
   CI installs.
2. **Lint (auto-fix)** — runs ESLint with `--fix` first, so formatting and
   auto-fixable rule violations are corrected automatically.
3. **Lint (verify)** — runs ESLint again without `--fix` to confirm nothing
   auto-fixable was missed and to surface any remaining issues that need a
   manual change.
4. **Type check** — `tsc --noEmit` against the web workspace.
5. **Unit tests** — `pnpm -r test`, covering every workspace package.
6. **Build** — `pnpm --filter web build`, the same production build CI runs.

Each step prints a pass/fail line in a summary at the end, so you can see at a
glance what needs attention.

## What it fixes automatically

Only lint issues that ESLint's `--fix` can safely resolve (formatting, import
ordering, and similar mechanical rules) are corrected automatically. Type
errors, failing tests, and build failures are **not** auto-fixed — those
require a human decision about the actual code change, so the script reports
them clearly instead of guessing.

## When to run it

- Before opening any pull request.
- After resolving merge conflicts, especially in `package.json`,
  `tsconfig.base.json`, or CI configuration.
- Whenever CI fails on a pushed branch and you want to reproduce the failure
  locally instead of waiting for another CI run.

## Exit codes

The script exits `0` only if lint, type check, tests, and build all pass. Any
other outcome exits non-zero, so it can also be wired into a git hook or CI
step if desired.

## Related

- [`.npmrc`](../.npmrc) disables pnpm's self-managed package manager version
  switching, which otherwise can fail with an `ENOENT` or `fetch failed` error
  when it cannot resolve the pinned `packageManager` version. See
  [DEVELOPMENT.md](DEVELOPMENT.md#pnpm-self-managed-version-note) for details.
