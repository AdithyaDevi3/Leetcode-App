#!/usr/bin/env node
/**
 * Preflight check runner.
 *
 * Runs the same checks CI runs for the web workspace, auto-fixing what is
 * safely auto-fixable (lint) and reporting anything that needs a human to
 * look at (typecheck, tests, build). Run this before opening a pull request.
 *
 * Usage:
 *   node scripts/preflight.mjs
 *   pnpm preflight
 */
import { spawnSync } from "node:child_process";

const steps = [];

function run(label, command, args, options = {}) {
  process.stdout.write(`\n▶ ${label}\n`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });
  const passed = result.status === 0;
  steps.push({ label, passed });
  return passed;
}

const installOk = run("Install workspace dependencies", "pnpm", [
  "install",
  "--filter",
  "web...",
  "--no-frozen-lockfile",
]);

if (!installOk) {
  printSummary();
  process.exit(1);
}

// Lint is auto-fixable: try --fix first, then verify with a clean run.
run("Lint (auto-fix)", "pnpm", ["--filter", "web", "lint", "--", "--fix"]);
const lintOk = run("Lint (verify)", "pnpm", ["--filter", "web", "lint"]);

const typecheckOk = run("Type check", "pnpm", ["--filter", "web", "typecheck"]);
const testOk = run("Unit tests", "pnpm", ["-r", "test"]);
const buildOk = run("Build", "pnpm", ["--filter", "web", "build"]);

printSummary();

const allPassed = [lintOk, typecheckOk, testOk, buildOk].every(Boolean);
process.exit(allPassed ? 0 : 1);

function printSummary() {
  process.stdout.write("\nPreflight summary\n");
  process.stdout.write("-----------------\n");
  for (const step of steps) {
    process.stdout.write(`${step.passed ? "✔" : "✘"} ${step.label}\n`);
  }

  const failed = steps.filter((step) => !step.passed);
  if (failed.length > 0) {
    process.stdout.write(
      "\nSome checks still need manual fixes (lint issues that could not be\n" +
        "auto-fixed, type errors, failing tests, or a broken build). Fix the\n" +
        "reported output above, then re-run `pnpm preflight`.\n",
    );
  } else {
    process.stdout.write("\nAll checks passed. Safe to open the pull request.\n");
  }
}
