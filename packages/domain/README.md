# @leetcode-app/domain

Domain models, types, and schemas for the Leetcode App.

## Overview

This package contains the core domain entities that represent the application's business logic and data structures. All schemas follow UTC timestamps and include optimistic concurrency support via version numbers.

## Exports

- `user` - User, UserPreference, and GuestIdentity
- `content` - ContentItem, ContentVersion, and RubricVersion
- `practice` - PracticeSession, Attempt, and PseudocodeRevision
- `evaluation` - Evaluation and EvaluationFinding

## Usage

```typescript
import { User, UserPreference, GuestIdentity } from '@leetcode-app/domain/user';
import { ContentItem, ContentVersion, RubricVersion } from '@leetcode-app/domain/content';
import { PracticeSession, Attempt, PseudocodeRevision } from '@leetcode-app/domain/practice';
import { Evaluation, EvaluationFinding } from '@leetcode-app/domain/evaluation';
```

## Design Principles

1. **UTC Timestamps**: All timestamps are stored in UTC
2. **Optimistic Concurrency**: Version numbers for conflict detection
3. **Immutable History**: Revisions are append-only
4. **Type Safety**: Comprehensive TypeScript types with strict validation
5. **Domain-Driven Design**: Models reflect business concepts, not database structure

## Phase 1.1 Milestone

This package implements the domain contracts defined in Phase 1.1 of the Implementation Roadmap.
