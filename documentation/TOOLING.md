# Tooling

**Last Updated:** 2026-08-18

## Overview

This document details all development tools, configurations, and IDE setup for the Leetcode-App project.

## Package Manager: pnpm

### Why pnpm?
- **Disk Efficiency:** Content-addressable storage (saves GB of space)
- **Fast:** Parallel installs, hard links instead of copies
- **Strict:** Better dependency resolution than npm/yarn
- **Monorepo Support:** Built-in workspace protocol
- **Deterministic:** Lock file ensures consistent installs

### Installation

```bash
# Install pnpm globally
npm install -g pnpm

# Or via Corepack (recommended)
corepack enable
corepack prepare pnpm@latest --activate
```

### Commands

```bash
# Install dependencies
pnpm install

# Add dependency to specific workspace
pnpm add react --filter @leetcode-app/web

# Add dev dependency
pnpm add -D vitest --filter @leetcode-app/database

# Update dependencies
pnpm update

# Remove dependency
pnpm remove <package-name>

# Run script
pnpm run <script-name>

# Run script in workspace
pnpm --filter @leetcode-app/web dev
```

### Configuration

**`pnpm-workspace.yaml`:**
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

**`.npmrc`:**
```
# Hoist shared dependencies to root node_modules
hoist=true

# Use workspace protocol for local packages
link-workspace-packages=true

# Strict peer dependencies
strict-peer-dependencies=false

# Auto-install peers
auto-install-peers=true
```

---

## TypeScript

### Configuration

**Root `tsconfig.json`:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "allowJs": true,
    "checkJs": false,
    "jsx": "preserve",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "incremental": true,
    "paths": {
      "@leetcode-app/*": ["./packages/*/src"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules", "dist", ".next"]
}
```

**Web App `tsconfig.json` (extends root):**
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"],
      "@leetcode-app/database": ["../../packages/database/src"],
      "@leetcode-app/domain": ["../../packages/domain/src"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

### Type Checking

```bash
# Check all TypeScript files
pnpm typecheck

# Check specific workspace
pnpm --filter @leetcode-app/web typecheck
```

### VS Code Integration

**Settings:**
- Use Workspace TypeScript version (not VS Code's bundled version)
- Enable "TypeScript: Enable Prompt UX" for auto-imports

**`settings.json`:**
```json
{
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true
}
```

---

## Linting: ESLint 9

### Configuration

**`eslint.config.mjs`:**
```javascript
import js from '@eslint/js';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import nextPlugin from '@next/eslint-plugin-next';

export default [
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': typescript,
      'react': reactPlugin,
      'react-hooks': reactHooksPlugin,
      '@next/next': nextPlugin,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@next/next/no-html-link-for-pages': 'error',
    },
  },
];
```

### Commands

```bash
# Lint all files
pnpm lint

# Auto-fix issues
pnpm lint:fix

# Lint specific file
pnpm eslint src/app/page.tsx
```

### VS Code Integration

**Install Extension:**
- ESLint (dbaeumer.vscode-eslint)

**Auto-fix on save:**
```json
{
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "eslint.validate": [
    "javascript",
    "typescript",
    "typescriptreact"
  ]
}
```

---

## Formatting: Prettier (Optional)

### Configuration

**`.prettierrc`:**
```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false
}
```

### Commands

```bash
# Format all files
pnpm format

# Check formatting
pnpm format:check
```

### VS Code Integration

**Install Extension:**
- Prettier - Code formatter (esbenp.prettier-vscode)

**Auto-format on save:**
```json
{
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true,
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  }
}
```

---

## Testing: Vitest

### Configuration

**`vitest.config.ts`:**
```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 60000,
    hookTimeout: 60000,
    setupFiles: ['./src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', '**/*.test.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@leetcode-app/database': path.resolve(__dirname, '../../packages/database/src'),
      '@leetcode-app/domain': path.resolve(__dirname, '../../packages/domain/src'),
    },
  },
});
```

### Commands

```bash
# Run tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage report
pnpm test:coverage

# Run specific test
pnpm test src/lib/auth/session.test.ts

# UI mode (interactive)
pnpm vitest --ui
```

### VS Code Integration

**Install Extension:**
- Vitest (ZixuanChen.vitest-explorer)

**Configuration:**
```json
{
  "vitest.enable": true,
  "vitest.commandLine": "pnpm test"
}
```

---

## Database Tools

### node-pg-migrate

**Configuration:** `packages/database/migrations/.migrate`

```json
{
  "database-url": "postgresql://postgres:postgres@localhost:5432/leetcode_app",
  "migrations-table": "pgmigrations",
  "dir": "migrations",
  "schema": "public"
}
```

### PostgreSQL CLI Tools

#### psql (Interactive Shell)

```bash
# Connect to database
psql -h localhost -U postgres -d leetcode_app

# Common commands
\dt                    # List tables
\d <table>             # Describe table
\di                    # List indexes
\df                    # List functions
SELECT * FROM users;   # Query data
\q                     # Quit
```

#### pg_dump (Backup)

```bash
# Backup database
pg_dump -U postgres leetcode_app > backup.sql

# Backup specific tables
pg_dump -U postgres -t users -t sessions leetcode_app > users_backup.sql

# Restore database
psql -U postgres leetcode_app < backup.sql
```

### Database GUI Tools

**Recommended:**
- **pgAdmin:** Full-featured GUI
- **DBeaver:** Universal database tool
- **TablePlus:** Modern, fast GUI (macOS/Windows)
- **Postico:** Simple, elegant (macOS only)

---

## Docker

### PostgreSQL Container

**Start:**
```bash
docker run -d \
  --name leetcode-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=leetcode_app \
  -p 5432:5432 \
  -v leetcode-data:/var/lib/postgresql/data \
  postgres:15-alpine
```

**Commands:**
```bash
# Start container
docker start leetcode-postgres

# Stop container
docker stop leetcode-postgres

# View logs
docker logs leetcode-postgres

# Execute command inside container
docker exec -it leetcode-postgres psql -U postgres -d leetcode_app

# Remove container
docker rm leetcode-postgres

# Remove volume
docker volume rm leetcode-data
```

### Docker Compose (Alternative)

**`docker-compose.yml`:**
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: leetcode-postgres
    environment:
      POSTGRES_DB: leetcode_app
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - '5432:5432'
    volumes:
      - postgres-data:/var/lib/postgresql/data

volumes:
  postgres-data:
```

**Commands:**
```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f

# Rebuild
docker-compose up -d --build
```

---

## VS Code Setup

### Recommended Extensions

**Essential:**
- ESLint (dbaeumer.vscode-eslint)
- TypeScript and JavaScript Language Features (built-in)
- Prettier - Code formatter (esbenp.prettier-vscode)
- Vitest (ZixuanChen.vitest-explorer)
- GitLens (eamodio.gitlens)

**Nice to Have:**
- Error Lens (usernamehw.errorlens) - Inline errors
- Pretty TypeScript Errors (yoavbls.pretty-ts-errors)
- Tailwind CSS IntelliSense (bradlc.vscode-tailwindcss)
- PostgreSQL (ckolkman.vscode-postgres)
- Docker (ms-azuretools.vscode-docker)
- GitHub Copilot (GitHub.copilot)

### Workspace Settings

**`.vscode/settings.json`:**
```json
{
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true,
  
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  
  "files.associations": {
    "*.css": "tailwindcss"
  },
  
  "tailwindCSS.experimental.classRegex": [
    ["cva\\(([^)]*)\\)", "[\"'`]([^\"'`]*).*?[\"'`]"],
    ["cn\\(([^)]*)\\)", "[\"'`]([^\"'`]*).*?[\"'`]"]
  ],
  
  "vitest.enable": true,
  "vitest.commandLine": "pnpm test",
  
  "eslint.validate": [
    "javascript",
    "typescript",
    "typescriptreact"
  ],
  
  "files.exclude": {
    "**/.next": true,
    "**/node_modules": true,
    "**/dist": true
  },
  
  "search.exclude": {
    "**/node_modules": true,
    "**/.next": true,
    "**/dist": true,
    "**/pnpm-lock.yaml": true
  }
}
```

### Keyboard Shortcuts

**`.vscode/keybindings.json`:**
```json
[
  {
    "key": "cmd+shift+t",
    "command": "vitest.runAll"
  },
  {
    "key": "cmd+shift+r",
    "command": "vitest.runCurrentFile"
  }
]
```

### Launch Configuration

**`.vscode/launch.json`:**
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Next.js: debug server-side",
      "type": "node-terminal",
      "request": "launch",
      "command": "pnpm dev",
      "cwd": "${workspaceFolder}/apps/web"
    },
    {
      "name": "Next.js: debug client-side",
      "type": "chrome",
      "request": "launch",
      "url": "http://localhost:3000",
      "webRoot": "${workspaceFolder}/apps/web"
    },
    {
      "name": "Debug Vitest Tests",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "pnpm",
      "runtimeArgs": ["test", "--run", "--threads", "false"],
      "console": "integratedTerminal"
    }
  ]
}
```

### Tasks

**`.vscode/tasks.json`:**
```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Start Dev Server",
      "type": "shell",
      "command": "pnpm dev",
      "options": {
        "cwd": "${workspaceFolder}/apps/web"
      },
      "isBackground": true,
      "problemMatcher": {
        "owner": "typescript",
        "fileLocation": "relative",
        "pattern": {
          "regexp": ".",
          "file": 1,
          "location": 2,
          "message": 3
        },
        "background": {
          "activeOnStart": true,
          "beginsPattern": "▲ Next.js",
          "endsPattern": "ready on"
        }
      }
    },
    {
      "label": "Run Migrations",
      "type": "shell",
      "command": "pnpm migrate:up",
      "options": {
        "cwd": "${workspaceFolder}/packages/database"
      }
    },
    {
      "label": "Run Tests",
      "type": "shell",
      "command": "pnpm test",
      "group": {
        "kind": "test",
        "isDefault": true
      }
    }
  ]
}
```

---

## Git Hooks (Optional)

### Husky

**Install:**
```bash
pnpm add -D husky lint-staged
npx husky install
```

**Pre-commit hook:**
```bash
npx husky add .husky/pre-commit "pnpm lint-staged"
```

**Pre-push hook:**
```bash
npx husky add .husky/pre-push "pnpm typecheck && pnpm test"
```

### lint-staged

**`package.json`:**
```json
{
  "lint-staged": {
    "*.{ts,tsx}": [
      "eslint --fix",
      "prettier --write"
    ],
    "*.{json,md}": [
      "prettier --write"
    ]
  }
}
```

---

## CI/CD Tools (Planned)

### GitHub Actions

**`.github/workflows/test.yml`:**
```yaml
name: Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15-alpine
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: leetcode_app
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
    
    steps:
      - uses: actions/checkout@v3
      
      - uses: pnpm/action-setup@v2
        with:
          version: 9
      
      - uses: actions/setup-node@v3
        with:
          node-version: 20
          cache: 'pnpm'
      
      - run: pnpm install
      
      - run: pnpm typecheck
      
      - run: pnpm lint
      
      - run: pnpm test:ci
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
```

---

## Monitoring Tools (Planned)

### Sentry

**Install:**
```bash
pnpm add @sentry/nextjs
```

**Configuration:**
```typescript
// sentry.client.config.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
});
```

### Vercel Analytics

**Install:**
```bash
pnpm add @vercel/analytics
```

**Usage:**
```typescript
// app/layout.tsx
import { Analytics } from '@vercel/analytics/react';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
```

---

## Productivity Tips

### Shell Aliases

**`.bashrc` or `.zshrc`:**
```bash
# pnpm shortcuts
alias p='pnpm'
alias pi='pnpm install'
alias pd='pnpm dev'
alias pt='pnpm test'
alias pb='pnpm build'

# Git shortcuts
alias gs='git status'
alias ga='git add .'
alias gc='git commit -m'
alias gp='git push'
alias gl='git pull'

# Docker shortcuts
alias dps='docker ps'
alias dlog='docker logs -f'
alias dex='docker exec -it'
```

### VS Code Snippets

**`.vscode/snippets.json`:**
```json
{
  "React Component": {
    "prefix": "rfc",
    "body": [
      "export function ${1:ComponentName}() {",
      "  return (",
      "    <div>",
      "      ${2}",
      "    </div>",
      "  );",
      "}"
    ]
  },
  "Vitest Test": {
    "prefix": "vtest",
    "body": [
      "import { describe, it, expect } from 'vitest';",
      "",
      "describe('${1:TestSuite}', () => {",
      "  it('${2:should do something}', () => {",
      "    ${3}",
      "  });",
      "});"
    ]
  }
}
```

---

## Performance Tools

### Next.js Bundle Analyzer

**Install:**
```bash
pnpm add -D @next/bundle-analyzer
```

**Configuration:**
```typescript
// next.config.ts
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

module.exports = withBundleAnalyzer({
  // ... other config
});
```

**Usage:**
```bash
ANALYZE=true pnpm build
```

### Lighthouse CI

```bash
# Install
pnpm add -D @lhci/cli

# Run
pnpm lhci autorun
```
