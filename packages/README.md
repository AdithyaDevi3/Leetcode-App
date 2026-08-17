# Shared Packages

This directory contains shared packages used across multiple applications in the monorepo.

## Package Structure

Each package follows this structure:

```
packages/
  package-name/
    src/
      index.ts          # Public API exports
      __tests__/        # Unit tests
      types.ts          # Type definitions
    package.json
    tsconfig.json
    README.md
```

## Planned Packages

As outlined in [ARCHITECTURE.md](../docs/ARCHITECTURE.md), the following packages will be created during implementation:

### Phase 1: Persistent Vertical Slice
- **domain** - Core domain types and value objects
- **contracts** - Shared interfaces and API contracts

### Phase 2: Pseudocode Platform
- **pseudocode** - Pseudocode parsing and analysis

### Phase 3: Evaluation Platform
- **evaluator** - Evaluation engine with rubrics and AI integration

### Phase 4: Learning and Personalization
- **mastery** - Spaced repetition and mastery tracking
- **recommendations** - Personalized content recommendations

### Phase 5: Safe Code Execution
- **sandbox** - Code execution orchestration

### Phase 6: Content and Operations
- **content** - Content management and versioning

### Cross-Cutting Concerns
- **ui** - Shared React components and design system
- **observability** - Telemetry, logging, and tracing utilities

## Package Guidelines

### Naming

- Use lowercase with hyphens for package names
- Namespace under `@leetcode-app/` (configured in Phase 0)
- Example: `@leetcode-app/domain`

### Dependencies

- Minimize external dependencies
- Share common dependencies at root level
- Document why each dependency is needed

### Testing

- Each package must have tests in `src/__tests__/`
- Aim for >80% code coverage
- Use Vitest for testing framework

### Documentation

- Each package must have a README.md
- Document public API with JSDoc comments
- Provide usage examples

### TypeScript

- Extend from root `tsconfig.base.json`
- Enable `composite: true` for project references
- Generate declaration files

## Development

### Adding a New Package

```bash
# Create package directory
mkdir -p packages/package-name/src/__tests__

# Create package.json
cat > packages/package-name/package.json << EOF
{
  "name": "@leetcode-app/package-name",
  "version": "0.1.0",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {},
  "devDependencies": {
    "typescript": "^5.7.2",
    "vitest": "^4.1.10"
  }
}
EOF

# Create tsconfig.json
cat > packages/package-name/tsconfig.json << EOF
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "src/__tests__"]
}
EOF

# Install dependencies
npm install
```

### Using a Package

In another package or app:

```json
{
  "dependencies": {
    "@leetcode-app/package-name": "*"
  }
}
```

Then import:

```typescript
import { Something } from "@leetcode-app/package-name";
```

## Maintenance

- Keep packages focused and cohesive
- Avoid circular dependencies
- Regularly audit unused dependencies
- Update documentation when APIs change
