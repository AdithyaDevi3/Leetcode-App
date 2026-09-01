## Description

<!-- Provide a clear and concise description of the changes in this PR -->

## Outcome and non-goals

<!-- State the single user/operational outcome and what this PR intentionally does not change. -->

## Related Issues

<!-- Link to related issues, e.g., "Closes #123" or "Related to #456" -->

## Traceability

- Delivery gate / roadmap work package:
- Requirement IDs:
- Acceptance criteria:

## Type of Change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update
- [ ] Refactoring (no functional changes)
- [ ] Infrastructure/DevOps change
- [ ] Testing improvement

## Phase Alignment

Which implementation phase does this PR support? (See IMPLEMENTATION_ROADMAP.md)

- [ ] Phase 0: Foundations
- [ ] Phase 1: Persistent vertical slice
- [ ] Phase 2: Pseudocode platform
- [ ] Phase 3: Evaluation platform
- [ ] Phase 4: Learning and personalization
- [ ] Phase 5: Safe code execution
- [ ] Phase 6: Content and operations
- [ ] Phase 7: Mobile continuity
- [ ] Phase 8: System design
- [ ] Phase 9: Public release

## Checklist

- [ ] My code follows the project's style guidelines
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings or errors
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
- [ ] Any dependent changes have been merged and published

## Testing

<!-- Describe the tests you ran and how to reproduce them -->

### Test Coverage

- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] E2E tests added/updated (if applicable)
- [ ] Manual testing completed

### Test Instructions

<!-- Provide step-by-step instructions for reviewers to test the changes -->

1. 
2. 
3. 

### Evidence

<!-- Link CI jobs/artifacts and record commands. Do not claim staging/production behavior without environment evidence. -->

- Targeted tests:
- `pnpm preflight`:
- Integration/migration/browser/accessibility evidence:

## Security Considerations

- [ ] This PR has no security implications
- [ ] This PR has been reviewed for security issues
- [ ] Security documentation has been updated (if applicable)

## Data, privacy, and authorization

- [ ] No data-contract, retention, consent, export, or deletion impact
- [ ] Ownership/RLS and abuse cases are tested where applicable
- [ ] No direct identifiers, free text, or post-decision data were added to personalization features
- [ ] Model/evaluator inputs, outputs, and versions are allowlisted and auditable where applicable

## Performance Impact

- [ ] No performance impact
- [ ] Performance has been tested and documented
- [ ] Performance benchmarks added/updated

## Screenshots

<!-- If applicable, add screenshots to demonstrate the changes -->

## Additional Notes

<!-- Any additional information that reviewers should know -->

## Deployment Notes

<!-- Any special considerations for deployment? -->

- [ ] Requires database migrations
- [ ] Requires environment variable changes
- [ ] Requires infrastructure changes
- [ ] Requires external service configuration
- [ ] Can be deployed independently

## Failure behavior, observability, and rollback

<!-- Explain retries/idempotency/conflicts/fallbacks, new logs/metrics/alerts, feature flags, and exact rollback or forward-fix steps. -->

- Failure behavior:
- Telemetry/alerts:
- Rollout/feature flag:
- Rollback/forward fix:

## Review handoff

- [ ] Branch is reconciled with the latest `origin/main`
- [ ] Commits are atomic and use Conventional Commits
- [ ] A reviewer other than the implementation agent inspected the branch diff
- [ ] Requirements/status documentation reflects delivered behavior and evidence
