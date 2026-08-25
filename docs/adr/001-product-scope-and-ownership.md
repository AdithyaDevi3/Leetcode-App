# ADR-001: Product Scope and Ownership

## Status

Accepted

## Context

The Leetcode-App is a pseudocode-first interview learning platform. Before building the product, we need to define the initial scope, target audience, supported features, and assign clear ownership for critical decision areas.

## Decision

### Initial Audience and Eligibility

- **Target Audience:** Individual learners preparing for technical interviews (beginner to experienced engineers)
- **Age Eligibility:** Users must be 13 years or older (COPPA compliance)
- **Supported Regions:** Initially US, Canada, EU, UK, Australia (GDPR and similar privacy law compliance)
- **Language Support:** English only for MVP
- **Accessibility:** WCAG 2.1 AA compliance target

### First Two Coding Languages

1. **TypeScript/JavaScript** - Web ecosystem alignment, broad adoption, accessible to beginners
2. **Python** - Ubiquitous in technical interviews, readable syntax, data science/ML relevance

Rationale: These two languages cover the majority of technical interview scenarios and have robust sandboxing options.

### Retention Assumptions

- Guest data: 90 days of inactivity before cleanup
- Authenticated user data: Retained until account deletion requested
- Evaluation history: Retained for mastery tracking and appeal resolution
- AI processing logs: 30 days for debugging, then deleted

### Ownership Assignments

| Area | Owner Role | Responsibilities |
|------|------------|------------------|
| Product | Product Lead | Feature prioritization, user research, roadmap |
| Content Rights | Legal/Content Lead | Licensing, original content, IP protection |
| Security | Security Lead | Threat modeling, security reviews, incident response |
| Privacy | Privacy Officer | Compliance, data protection, consent management |
| Evaluator Quality | ML/Evaluation Lead | Rubric quality, AI reliability, gold-set maintenance |
| Operations | DevOps/SRE Lead | Infrastructure, deployments, monitoring, incidents |

### Evaluator Quality Thresholds

Expert reviewers define these thresholds for production readiness:

- **Accuracy:** ≥95% correct unlock decisions on gold-set problems
- **Safety:** Zero false-positive unlocks on known incorrect solutions
- **Explanation Quality:** ≥90% of findings must cite specific evidence (source span/line)
- **Confidence Calibration:** Low-confidence predictions (<70%) must trigger manual review path
- **Latency:** p95 evaluation time ≤5 seconds for pseudocode-only, ≤10 seconds with AI
- **Availability:** 99.5% uptime for evaluation service (degraded mode acceptable during AI provider outages)

## Consequences

### Easier

- Clear accountability for critical decisions
- Well-defined quality bar prevents premature launch
- Age/region constraints simplify initial compliance
- Two-language focus allows deeper sandbox hardening

### More Difficult

- Non-English speakers excluded from MVP
- Additional languages require new sandbox infrastructure
- Privacy compliance limits some analytics opportunities
- High quality thresholds may delay AI-powered features

## Review Date

2026-11-17 (3 months) - Review language expansion, region expansion, and quality thresholds based on beta feedback

## Owners

- Product Lead: TBD
- Security Lead: TBD
- Privacy Officer: TBD
- Evaluation Lead: TBD
