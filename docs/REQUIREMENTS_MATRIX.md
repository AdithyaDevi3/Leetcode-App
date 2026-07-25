# Requirements Matrix

This matrix tracks the functional and operational requirements defined in [PRODUCT_PLAN.md](PRODUCT_PLAN.md) against implementation phases and evidence. Update it in every pull request that adds, removes, or changes a requirement.

## Status definitions

- **Implemented:** Production-shaped behavior exists and has the required automated evidence.
- **Prototype:** The user interaction is demonstrated, but persistence, generality, safety, or operational support is incomplete.
- **Planned:** Approved scope with an implementation phase.
- **Decision required:** A product, legal, provider, or architecture decision blocks implementation.

## Learning experience

| ID | Requirement | Status | Phase | Acceptance evidence |
|---|---|---|---|---|
| LEARN-001 | Concept lesson with objectives, examples, and prerequisites | Prototype | 2 | Versioned content renders and prerequisite links are validated |
| LEARN-002 | Original/licensed problem prompt, examples, and constraints | Prototype | 2, 6 | Provenance-approved immutable content version |
| LEARN-003 | Guided semantic-block pseudocode | Prototype | 2 | Blockly adapter edits typed AST with keyboard text equivalent |
| LEARN-004 | Free-form structured-English pseudocode | Prototype | 2 | Parser preserves semantics or creates explicit intent nodes |
| LEARN-005 | Text/block interoperability without semantic loss | Planned | 2 | Round-trip/property suite passes for supported AST nodes |
| LEARN-006 | Autosaved, versioned attempts and exact resume | Prototype | 1 | Cross-device E2E resumes exact revision/stage |
| LEARN-007 | Pseudocode-only completion mode | Prototype | 1 | Persisted completion state and history evidence |
| LEARN-008 | Pseudocode-then-code gated mode | Prototype | 1, 5 | Approved evaluation persists unlock; sandbox handoff works |
| LEARN-009 | Direct-code advanced mode | Planned | 5 | Preference-controlled flow with safety/usage telemetry |
| LEARN-010 | Graduated hints without silent answer rewriting | Planned | 2, 3 | Authored hint ladder and hint-usage mastery evidence |
| LEARN-011 | Reflection, mistake category, and confidence | Planned | 4 | Persisted reflection affects explainable follow-up recommendation |
| LEARN-012 | Notes and bookmarks | Planned | 4 | Ownership-tested CRUD and export/deletion coverage |
| LEARN-013 | History with revisions and feedback | Planned | 1, 4 | User can inspect immutable revision/evaluation timeline |
| LEARN-014 | Diagnostic assessment | Planned | 4 | Optional assessment produces editable explained plan |
| LEARN-015 | Review mode and spaced repetition | Planned | 4 | Deterministic scheduling tests and due-review UI |
| LEARN-016 | Explain-aloud practice | Decision required | Expansion | Consent, retention, accessibility, and provider review complete |

## Pseudocode and evaluation

| ID | Requirement | Status | Phase | Acceptance evidence |
|---|---|---|---|---|
| EVAL-001 | Versioned pseudocode AST with source spans | Planned | 2 | Schema, fixtures, migrations, and round-trip tests |
| EVAL-002 | Static data/control-flow analysis | Planned | 2 | Findings identify initialization, use, branches, returns, and cost |
| EVAL-003 | Problem-specific deterministic rubrics | Prototype | 3 | Rubric schema supports accepted strategies and critical checks |
| EVAL-004 | Curated trace/counterexample execution | Planned | 3 | Bounded traces find seeded algorithm defects |
| EVAL-005 | Evidence-linked findings | Prototype | 3 | Every finding cites source span/node and rubric rule |
| EVAL-006 | Complexity analysis and contradiction checks | Prototype | 2, 3 | Curated complexity suite passes by strategy family |
| EVAL-007 | AI semantic reviewer with strict output schema | Planned | 3 | Provider contract, redaction, injection, timeout, and schema tests |
| EVAL-008 | Deterministic evidence overrides AI contradiction | Planned | 3 | Conflict fixtures never incorrectly unlock |
| EVAL-009 | Confidence display and low-confidence fallback | Planned | 3 | Low-confidence flow does not trap learner |
| EVAL-010 | Appeals and expert override | Planned | 3, 6 | Second path, review queue, reason, and audit event |
| EVAL-011 | Versioned evaluator prompt/model/rubric | Planned | 3 | Historical result resolves exact versions |
| EVAL-012 | Gold-set quality gates | Planned | 3 | Expert thresholds run on parser/rubric/prompt/model changes |
| EVAL-013 | AI kill switch and deterministic fallback | Planned | 0, 3 | Provider-outage synthetic journey completes core flow |

## Coding workspace

| ID | Requirement | Status | Phase | Acceptance evidence |
|---|---|---|---|---|
| CODE-001 | Approved plan visible beside implementation | Prototype | 5 | Responsive/accessible side-by-side editor |
| CODE-002 | TypeScript execution | Planned | 5 | Isolated sandbox passes functional and malicious-code suites |
| CODE-003 | Python execution | Planned | 5 | Isolated sandbox passes functional and malicious-code suites |
| CODE-004 | Formatting, console, and public tests | Prototype | 5 | Provider-backed E2E with accessible status output |
| CODE-005 | Hidden tests without answer leakage | Planned | 5 | Contract tests verify redacted failure classes |
| CODE-006 | Plan-to-code mapping and divergence | Planned | 5 | AST/code mapping produces evidence-linked guidance |
| CODE-007 | Strict compute/network/filesystem limits | Planned | 5 | Independent isolation review and resource-limit tests |
| CODE-008 | Run quotas, abuse controls, and kill switch | Planned | 5 | Per-user/IP limits and emergency-disable drill |

## Curriculum and personalization

| ID | Requirement | Status | Phase | Acceptance evidence |
|---|---|---|---|---|
| PERS-001 | Versioned concept prerequisite graph | Planned | 4 | Cycle/reachability/content mapping validation in CI |
| PERS-002 | Goal, level, language, availability, and accessibility onboarding | Planned | 4 | Editable preferences and explained initial plan |
| PERS-003 | Interpretable mastery per concept | Planned | 4 | Versioned score with event-level explanation |
| PERS-004 | Rules-based next-activity recommendation | Planned | 4 | Stored factors reproduce selection and alternatives |
| PERS-005 | “Why this?” explanation and user overrides | Planned | 4 | E2E for reason, too easy/hard, irrelevant, and alternate |
| PERS-006 | Concept map and progress history | Planned | 4 | Accessible graph/list and mastery-history views |
| PERS-007 | Difficulty across concept/reasoning/implementation/communication | Planned | 4, 6 | Content schemas and UI expose calibrated dimensions |
| PERS-008 | Recommendation diversity and overload controls | Planned | 4 | Policy tests prevent repetition and excessive challenge |
| PERS-009 | Personalization opt-out | Planned | 4 | User can disable and receive deterministic non-personalized plan |

## Identity, privacy, and account lifecycle

| ID | Requirement | Status | Phase | Acceptance evidence |
|---|---|---|---|---|
| ID-001 | Guest mode | Prototype | 1 | Secure guest identity and persistent owned attempts |
| ID-002 | Email magic link and major OAuth provider | Planned | 1 | Provider integration and auth threat-model tests |
| ID-003 | Guest-to-account upgrade | Planned | 1 | Deterministic merge and collision E2E |
| ID-004 | Profile, goals, locale, timezone, and accessibility | Planned | 4 | Ownership-tested preferences API and UI |
| ID-005 | Session/device listing and revocation | Planned | 1 | Revoked session fails immediately per policy |
| PRIV-001 | Plain-language privacy notice and consent record | Planned | 6, 9 | Versioned notice and consent history |
| PRIV-002 | Data export | Planned | 6, 9 | Idempotent export job and download-expiry tests |
| PRIV-003 | Account deletion | Planned | 6, 9 | End-to-end deletion including provider/device propagation |
| PRIV-004 | Retention schedules by data class | Decision required | 0, 9 | Approved policy enforced by tested jobs |
| PRIV-005 | AI processing disclosure and no training by default | Planned | 3, 9 | Provider contract/configuration and public disclosure |
| PRIV-006 | Age eligibility and regional processing | Decision required | 0, 9 | Product/legal decision enforced at onboarding/deployment |

## Content, administration, and support

| ID | Requirement | Status | Phase | Acceptance evidence |
|---|---|---|---|---|
| OPS-001 | Versioned content and rubric authoring | Planned | 6 | Draft/review/publish/deprecate/rollback E2E |
| OPS-002 | Preview lessons, blocks, tests, and design cases | Planned | 6, 8 | Preview uses unpublished immutable version |
| OPS-003 | Subject-matter, editorial, and rights approval | Planned | 6 | Publication blocked until required approvals exist |
| OPS-004 | Provenance/license metadata | Planned | 6 | Schema validation and immutable approval audit |
| OPS-005 | Notice-and-takedown workflow | Planned | 6 | Timed tabletop exercise and corrected republish |
| OPS-006 | Least-privilege administration roles | Planned | 6 | Role matrix and authorization tests |
| OPS-007 | Evaluation review and replay | Planned | 6 | Explicit-version replay never mutates history |
| OPS-008 | Feature flags and kill switches | Planned | 0, 6 | Audited changes and emergency drill |
| OPS-009 | Privileged audit log | Planned | 6 | Tamper-evident events with retention/access policy |
| OPS-010 | Read-only support diagnostics | Planned | 6 | No unrestricted impersonation; access is audited |

## Mobile and notifications

| ID | Requirement | Status | Phase | Acceptance evidence |
|---|---|---|---|---|
| MOB-001 | Responsive mobile learning workspace | Implemented | Current | Browser checks at 390px and 858px with no overflow |
| MOB-002 | Installable PWA | Planned | 7 | Install/update/offline-cache tests |
| MOB-003 | Offline content and safe edit queue | Planned | 7 | Reconnect, duplication, conflict, and account-switch E2E |
| MOB-004 | In-app reminders | Planned | 7 | Consent, schedule, snooze, cap, and dismissal tests |
| MOB-005 | Email reminders and weekly summary | Planned | 7 | Provider contract, unsubscribe, quiet-hour, and privacy tests |
| MOB-006 | Push notifications | Planned | 7 | Token lifecycle and lock-screen payload review |
| MOB-007 | Timezone-aware quiet hours and frequency caps | Planned | 7 | Boundary/DST/idempotency test suite |
| MOB-008 | React Native clients | Decision required | Expansion | Evidence that PWA cannot meet validated user needs |

## System design

| ID | Requirement | Status | Phase | Acceptance evidence |
|---|---|---|---|---|
| SYS-001 | Requirements and scope clarification stage | Planned | 8 | Versioned semantic document and rubric checks |
| SYS-002 | Capacity estimates and assumptions | Planned | 8 | Units/assumptions preserved and feedback cites them |
| SYS-003 | API/event and data-model design | Planned | 8 | Semantic nodes validated and linked to flows |
| SYS-004 | Interactive component/flow canvas | Planned | 8 | Keyboard canvas plus equivalent list/tree editor |
| SYS-005 | Failure, security, privacy, reliability, and cost review | Planned | 8 | Rubric requires explicit analysis and alternatives |
| SYS-006 | Tradeoffs and evolution path | Planned | 8 | Feedback evaluates learner-stated alternatives |
| SYS-007 | Original case-study curriculum | Planned | 8 | Provenance-approved cases with expert rubrics |
| SYS-008 | Evidence-based evaluation and appeals | Planned | 8 | Expert agreement threshold and appeal flow |

## Platform, security, and operations

| ID | Requirement | Status | Phase | Acceptance evidence |
|---|---|---|---|---|
| PLAT-001 | CI lint, test, and production build | Implemented | Current | GitHub Actions passes on `main` |
| PLAT-002 | Health endpoint | Implemented | Current | Public `/api/health` synthetic check |
| PLAT-003 | Non-root production container | Implemented | Current | Image build and runtime smoke test |
| PLAT-004 | Secret, dependency, static, container, and IaC scanning | Prototype | 0 | Required CI gates with documented exception policy |
| PLAT-005 | Reproducible development/staging/production IaC | Planned | 0 | Empty-environment provision/destroy rehearsal |
| PLAT-006 | CI OIDC and managed runtime secrets | Planned | 0 | No long-lived cloud key in GitHub/Vercel |
| PLAT-007 | Structured logs, traces, metrics, and redaction | Planned | 0 | Synthetic trace and sensitive-field tests |
| PLAT-008 | PostgreSQL backup and restore | Planned | 1, 9 | Timed restore rehearsal meets RPO/RTO |
| PLAT-009 | Queue retries, dead letters, and backpressure | Planned | 3 | Failure injection and queue-age alerts |
| PLAT-010 | Rate limits, quotas, WAF, and denial-of-wallet controls | Planned | 3, 5, 9 | Abuse suite and cost-limit alert drill |
| PLAT-011 | Immutable artifacts, SBOM, provenance, and release record | Planned | 0, 9 | Production release resolves exact digest/versions |
| PLAT-012 | SLOs, alerts, synthetic journeys, and runbooks | Planned | 9 | User-impact alerts link to tested owner/runbook |
| PLAT-013 | Rollback and provider-outage recovery | Planned | 3, 9 | Staging rollback/outage exercises pass |
| PLAT-014 | Accessibility WCAG 2.2 AA | Prototype | All | Automated and manual keyboard/screen-reader/reflow evidence |
| PLAT-015 | Internationalizable content and UI | Planned | 4, 6 | Locale-safe storage and extracted UI/content strings |

## Pull-request traceability

Reference requirement IDs in pull requests and tests:

```text
Requirements: LEARN-006, ID-001, PLAT-008
Roadmap: Phase 1.2, 1.4, 1.5
Evidence: integration test URL, E2E artifact, migration plan, dashboard
```

A requirement moves to **Implemented** only when its acceptance evidence exists in the repository or linked release system. UI appearance alone does not complete server, security, privacy, accessibility, or operational requirements.
