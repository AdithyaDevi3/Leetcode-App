# Contributing to Leetcode-App

Thank you for your interest in contributing to the Leetcode-App project! This document provides guidelines and information for contributors.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Testing Requirements](#testing-requirements)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)
- [Phase-Based Development](#phase-based-development)

## Code of Conduct

- Be respectful and inclusive
- Welcome newcomers and help them learn
- Focus on constructive feedback
- Assume good intentions
- Report unacceptable behavior to project maintainers

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- pnpm 9 (managed through Corepack)
- Git

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/your-org/leetcode-app.git
cd leetcode-app

# Install dependencies
corepack enable
pnpm install --frozen-lockfile

# Run development server
pnpm dev

# Run tests
pnpm test

# Run linting
pnpm lint
```

## Development Workflow

### Branch Strategy

- `main` - Production-ready code, protected branch
- `phase-N-*` - Feature branches for implementation phases
- `feature/*` - Individual feature branches
- `fix/*` - Bug fix branches
- `docs/*` - Documentation updates

### Creating a Feature Branch

```bash
# Create and switch to a new branch
git checkout -b feature/your-feature-name

# Make your changes
# ...

# Commit your changes
git add .
git commit -m "feat: add your feature"

# Push to remote
git push origin feature/your-feature-name
```

## Coding Standards

### TypeScript

- Use strict TypeScript configuration
- Avoid `any` types; use `unknown` when type is truly unknown
- Prefer interfaces over type aliases for object shapes
- Document public APIs with JSDoc comments

### Code Style

- Follow the Prettier configuration (`.prettierrc.json`)
- Run `npm run format` before committing
- Use meaningful variable and function names
- Keep functions small and focused (single responsibility)
- Avoid deep nesting (max 3 levels)

### File Organization

```
packages/
  package-name/
    src/
      index.ts          # Public API exports
      __tests__/        # Unit tests
      types.ts          # Type definitions
      utils.ts          # Utility functions
    package.json
    tsconfig.json
    README.md
```

## Testing Requirements

### Test Coverage

- All new features must include tests
- Aim for >80% code coverage
- Test both happy paths and error cases
- Test edge cases and boundary conditions

### Test Types

1. **Unit Tests** - Test individual functions/classes in isolation
2. **Integration Tests** - Test component interactions
3. **E2E Tests** - Test complete user workflows

### Running Tests

```bash
# Run the required local preflight
pnpm preflight

# Run tests for specific workspace
pnpm --filter web test
```

## Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, no logic change)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Build process or auxiliary tool changes
- `ci`: CI/CD changes

### Examples

```
feat(evaluation): add deterministic rubric checker

Implements keyword-based rubric checking for pseudocode evaluation.
Includes tests for edge case detection and complexity analysis.

Closes #123
```

```
fix(auth): handle expired guest sessions

Guest sessions now properly refresh or redirect to login when expired.

Fixes #456
```

## Pull Request Process

### Before Submitting

1. Run the required validation: `pnpm preflight`
2. Run PR-specific integration, migration, browser, accessibility, or security checks.
3. Confirm the branch is current with `origin/main`.
4. Update documentation if needed
5. Add/update tests for your changes
6. Rebase on latest `main` if needed

### PR Requirements

- Fill out the PR template completely
- Link related issues
- Provide clear description of changes
- Include test instructions
- Add screenshots for UI changes
- Ensure CI passes
- Request review from maintainers

### Review Process

- At least one approval required from maintainers
- Address all review feedback
- Keep discussions respectful and constructive
- Be responsive to questions and suggestions

### After Approval

- Maintainer will merge using the repository's configured merge strategy
- Delete your branch after merge
- Update local `main` branch

## Phase-Based Development

This project follows a phased implementation roadmap. See [IMPLEMENTATION_ROADMAP.md](docs/IMPLEMENTATION_ROADMAP.md) for details.

### Phase Exit Criteria

Each phase has specific exit criteria that must be met:
- All features implemented and tested
- Documentation updated
- Integration tests passing
- Security review completed (if applicable)
- Performance benchmarks met (if applicable)

### Current Phase

Check the project README or roadmap document for the current active phase.

## Questions?

- Open a [GitHub Discussion](https://github.com/your-org/leetcode-app/discussions) for questions
- Check existing issues and PRs for similar work
- Read the [documentation](docs/) for architecture and design decisions

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (see LICENSE file).
