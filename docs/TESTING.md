# Phase 0 Integration Tests

This directory contains integration tests for Phase 0: Foundations.

## Test Coverage

### Package Tests

- **@leetcode-app/observability**
  - Logger instantiation and basic logging
  - OpenTelemetry API exports (trace, metrics)
  - Tracer and span creation

- **@leetcode-app/feature-flags**
  - Flag initialization with defaults
  - Flag overrides
  - User context evaluation
  - Percentage rollout consistency
  - Test helpers

### Infrastructure Tests

Infrastructure tests (Terraform, CI workflows) are validated through:
- Terraform format and validate checks
- GitHub Actions syntax validation
- Dry-run deployments in CI

### Future Test Areas

As we build out the platform, we'll add integration tests for:

**Phase 1:**
- Database schema migrations
- API endpoint authentication
- ECS task deployment
- S3 file upload/download

**Phase 2:**
- Code evaluation end-to-end
- SQS message processing
- Redis session management
- WebSocket connections

**Phase 3:**
- AI API integration (hints, explanations)
- Prompt engineering workflows
- Token usage tracking

## Running Tests

### All Package Tests

```bash
npm test
```

### Specific Package

```bash
npm test --workspace=@leetcode-app/feature-flags
npm test --workspace=@leetcode-app/observability
```

### Watch Mode

```bash
npm test -- --watch
```

### Coverage

```bash
npm test -- --coverage
```

## Test Philosophy

### Unit Tests
- Test individual functions in isolation
- Mock external dependencies
- Fast, deterministic

### Integration Tests
- Test interactions between components
- Use real implementations when possible
- May use TestContainers for databases

### E2E Tests
- Full user workflows (Phase 2+)
- Run against deployed environments
- Use Playwright for browser testing

## CI Integration

Tests run automatically on:
- Pull request creation
- Push to main branch
- Manual workflow dispatch

See [.github/workflows/ci.yml](../.github/workflows/ci.yml) for details.
