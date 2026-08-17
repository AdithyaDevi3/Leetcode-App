# Branch Protection and Repository Policies

This document describes the branch protection rules and repository policies that should be configured in GitHub settings.

> **Note:** These settings must be configured by a repository administrator through GitHub's web interface at:
> `Settings → Branches → Branch protection rules`

## Branch Protection Rules

### `main` Branch

**Required status checks:**
- ✅ `lint` - ESLint checks must pass
- ✅ `typecheck` - TypeScript compilation must succeed
- ✅ `format-check` - Code formatting must match Prettier rules
- ✅ `test` - All tests must pass
- ✅ `build` - Production build must succeed

**Protection settings:**
- ✅ Require a pull request before merging
  - ✅ Require approvals: **1** (from CODEOWNERS)
  - ✅ Dismiss stale pull request approvals when new commits are pushed
  - ✅ Require review from Code Owners
- ✅ Require status checks to pass before merging
  - ✅ Require branches to be up to date before merging
- ✅ Require conversation resolution before merging
- ✅ Require signed commits
- ✅ Require linear history
- ✅ Do not allow bypassing the above settings (even for admins)
- ❌ Allow force pushes (disabled)
- ❌ Allow deletions (disabled)

**Restrictions:**
- Only maintainers can push to `main` directly (emergency only)
- All changes must go through pull requests

### `phase-*` Branches

**Required status checks:**
- ✅ `lint`
- ✅ `typecheck`
- ✅ `test`

**Protection settings:**
- ✅ Require a pull request before merging
  - ✅ Require approvals: **1**
- ✅ Require status checks to pass before merging
- ❌ Require branches to be up to date (optional for development branches)
- ✅ Require conversation resolution before merging
- ❌ Allow force pushes (enabled for phase branches during active development)
- ❌ Allow deletions (disabled)

## Repository Settings

### General

**Default branch:** `main`

**Features:**
- ✅ Issues
- ✅ Discussions
- ✅ Projects
- ❌ Wiki (documentation in `/docs` instead)
- ❌ Sponsorships (not applicable during MVP)

**Pull Requests:**
- ✅ Allow merge commits
- ❌ Allow squash merging (use merge commits for traceability)
- ❌ Allow rebase merging
- ✅ Always suggest updating pull request branches
- ✅ Automatically delete head branches after merge

**Archives:**
- ❌ Repository is not archived

### Security

**Dependency graph:**
- ✅ Enabled (automatic)

**Dependabot alerts:**
- ✅ Enabled
- Alert for vulnerabilities in dependencies
- Notify maintainers via email and GitHub notifications

**Dependabot security updates:**
- ✅ Enabled
- Automatically open PRs to update vulnerable dependencies

**Code scanning:**
- ✅ CodeQL enabled (via `.github/workflows/security.yml`)
- Weekly scheduled scans
- Scan on every push to `main`

**Secret scanning:**
- ✅ Enabled (GitHub native)
- Push protection enabled (blocks commits with secrets)

### Access Control

**Collaborators and teams:**
- `@leetcode-app/maintainers` - Admin access
- `@leetcode-app/frontend` - Write access (apps/web)
- `@leetcode-app/backend` - Write access (apps/api, apps/worker)
- `@leetcode-app/devops` - Write access (infra/, .github/)
- `@leetcode-app/security` - Read access (security reviews)
- `@leetcode-app/docs-team` - Write access (docs/)

**Base permissions:** Read (public after launch)

**Allow forking:** ✅ Yes (encourage community contributions post-launch)

## Tag Protection Rules

### Version Tags

Pattern: `v*.*.*`

**Protection settings:**
- ✅ Only maintainers can create tags
- ✅ Tags are immutable (cannot be deleted or force-pushed)

## Merge Strategies

### For Pull Requests

1. **Feature branches → `main`:**
   - Use: **Merge commit** (preserves full history)
   - Commit message: Auto-generated from PR title and description
   - Example: `Merge pull request #123 from feature/add-evaluation`

2. **Phase branches → `main`:**
   - Use: **Merge commit**
   - Create a merge commit that summarizes the phase
   - Tag the merge commit with phase version (e.g., `v0.1-phase-0`)

3. **Hotfix branches → `main`:**
   - Use: **Merge commit**
   - Fast-track approval if critical security fix
   - Still require CI to pass

## Commit Message Convention

Enforced via PR titles (not automated yet, manual review):

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:** feat, fix, docs, style, refactor, perf, test, chore, ci

**Scopes:** phase-0, evaluation, auth, api, web, infra, ci

**Examples:**
- `feat(evaluation): add deterministic rubric checker`
- `fix(auth): handle expired guest sessions`
- `docs(adr): add ADR for code sandbox strategy`
- `chore(deps): update dependencies`

## Code Review Guidelines

**Reviewer responsibilities:**
1. Check that PR template is filled out
2. Verify tests are included for new features
3. Ensure documentation is updated
4. Confirm no security issues (secrets, injection, etc.)
5. Validate code quality and maintainability
6. Check for breaking changes and migration plans

**Approval criteria:**
- ✅ All CI checks pass
- ✅ Code follows project conventions
- ✅ Tests provide adequate coverage
- ✅ Documentation is clear and complete
- ✅ No unresolved review comments

## Emergency Procedures

### Hotfix Process

For critical security vulnerabilities or production outages:

1. Create branch from `main`: `hotfix/issue-description`
2. Fix the issue with minimal changes
3. Open PR with `[HOTFIX]` prefix in title
4. Request immediate review from security lead + one maintainer
5. CI must still pass (no exceptions)
6. Merge and deploy immediately
7. Post-mortem issue created within 24 hours

### Rollback Process

If a deployment causes issues:

1. Revert the merge commit on `main`
2. Deploy the revert immediately
3. Create issue to fix properly
4. Re-implement fix with additional tests

## Automation

**GitHub Actions:**
- CI runs on all PRs and pushes to protected branches
- Dependabot PRs auto-labeled and assigned to teams
- Stale PRs labeled after 30 days of inactivity
- Release notes generated from merged PRs (future)

## Review Schedule

Review these policies:
- **Quarterly:** Adjust protection rules based on team feedback
- **After incidents:** Update policies to prevent recurrence
- **Before Phase 9:** Tighten security for public release

## Questions?

For questions about these policies:
- Open a [GitHub Discussion](https://github.com/your-org/leetcode-app/discussions)
- Tag with `repository-policy` label
- Contact DevOps team for urgent access issues
