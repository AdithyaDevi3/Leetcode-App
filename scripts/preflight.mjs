#!/usr/bin/env node
/**
 * Preflight check runner.
 *
 * Runs the same mandatory repository checks CI runs without changing source
 * files. Run this before opening a pull request.
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
  "--frozen-lockfile",
]);

if (!installOk) {
  printSummary();
  process.exit(1);
}

const domainBuildOk = run("Build domain workspace", "pnpm", [
  "--filter",
  "@leetcode-app/domain",
  "build",
]);
const databaseBuildOk = run("Build database workspace", "pnpm", [
  "--filter",
  "@leetcode-app/database",
  "build",
]);
const lintOk = run("Lint", "pnpm", ["--filter", "web", "lint"]);

const typecheckOk = run("Type check", "pnpm", ["--filter", "web", "typecheck"]);
const testOk = run("All workspace tests", "pnpm", ["-r", "test"]);
const buildOk = run("Build", "pnpm", ["--filter", "web", "build"]);
const browserOk = run("Critical-path browser tests", "pnpm", [
  "--filter",
  "web",
  "test:e2e",
]);

printSummary();

const allPassed = [
  domainBuildOk,
  databaseBuildOk,
  lintOk,
  typecheckOk,
  testOk,
  buildOk,
  browserOk,
].every(Boolean);
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
      "\nSome checks still need fixes (lint, type errors, workspace tests,\n" +
        "browser tests, or a broken build). Fix the\n" +
        "reported output above, then re-run `pnpm preflight`.\n",
    );
  } else {
    process.stdout.write("\nAll checks passed. Safe to open the pull request.\n");
  }
}
