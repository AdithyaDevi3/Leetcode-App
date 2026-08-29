# ADR-010: Parallel Roadmap Delivery and Integration

## Status

Accepted for the current roadmap implementation period.

## Context

The remaining roadmap contains independent foundations across learning,
notifications, system design, administration, and privacy. Completing them in
one shared working tree obscures review scope and raises merge-conflict risk.
Conversely, opening every historical branch directly into `main` would create
overlapping, duplicate pull requests because the integration branch already
contains those commits.

## Decision

- Keep `phase-3-evaluation-platform` as the integration branch and its open
  pull request as the single route to `main`.
- Create one focused branch and pull request per new roadmap work package.
  Focused pull requests target `phase-3-evaluation-platform` while the
  integration PR remains open.
- Permit parallel work only where file ownership and schema migration scope are
  disjoint. A task must declare its intended write paths and migration name
  before implementation starts.
- Require each focused PR to document outcome, excluded scope, security and
  privacy impact, migration compatibility, validation commands, operational
  signals, rollback/forward-fix approach, and known remaining evidence.
- Merge focused PRs only after review and validation. The integration PR then
  updates automatically; it is refreshed against `origin/main` before its own
  merge.
- Do not delete historical branches or drop stashes until their reachable
  commits and review status have been confirmed.

## Consequences

This makes review smaller and preserves clear ownership, at the cost of more
short-lived PRs and periodic integration rebases. It prevents accidental
duplicate PRs to `main`, reduces conflicting writes, and keeps architecture
decisions traceable. It does not allow production claims without staging,
security, operational, and acceptance evidence.

## Review Date

After the Phase 3 integration PR is merged to `main`, or sooner if the number
of simultaneous focused PRs makes the integration branch unstable.

## Owners

Engineering and product owners responsible for the roadmap and release gates.
