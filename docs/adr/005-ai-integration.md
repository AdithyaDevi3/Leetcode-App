# ADR-005: AI Integration

## Status

Accepted

## Context

AI evaluation is a core feature for semantic pseudocode analysis. However, AI can be unreliable, expensive, and create privacy concerns. We need a strategy that provides value while maintaining quality, safety, and cost controls.

## Decision

### AI Provider Strategy

**Multi-provider with feature flags: OpenAI GPT-4o, Anthropic Claude, Azure OpenAI**

Rationale:
- No single-provider dependency
- Cost and rate-limit flexibility
- A/B testing for quality comparison
- Fallback during provider outages

### AI Usage Boundaries

AI is used **only** for:
1. Semantic pseudocode analysis (logic flow, edge cases)
2. Natural language explanation quality
3. Suggestion generation (hints, improvements)

AI is **never** the sole decision maker for:
- Unlock decisions (deterministic rubrics override)
- Complexity assessment (static analysis + rubrics)
- Correctness of known algorithms (use gold patterns)

### AI Integration Architecture

```
┌────────────────┐
│ Evaluation Job │
└────────┬───────┘
         │
         ▼
┌────────────────────┐
│ Deterministic Pass │◄─── Always runs first
│ (Rubrics + Static) │
└────────┬───────────┘
         │
         ▼
    ┌────────┐
    │Feature │
    │ Flag?  │
    └───┬────┘
        │ (enabled)
        ▼
┌────────────────┐      ┌──────────────┐
│  AI Gateway    ├─────▶│ LLM Provider │
│ (with timeout) │      └──────────────┘
└────────┬───────┘
         │
         ▼
┌────────────────────┐
│  Evidence Merger   │◄─── Deterministic overrides AI
│ (Confidence Check) │
└────────────────────┘
```

### Prompt Engineering Standards

- **Versioned Prompts:** All prompts tracked in git with version numbers
- **Structured Output:** Use JSON schema enforcement (function calling)
- **Injection Prevention:** Sanitize user pseudocode, use XML/JSON delimiters
- **Examples:** Include few-shot examples for consistency
- **Temperature:** 0.0-0.3 for deterministic analysis

### Privacy and Data Protection

- **No Training:** Explicit zero-retention agreements with providers
- **Data Minimization:** Send only pseudocode + problem, no PII
- **Encryption in Transit:** TLS 1.3+ for all API calls
- **Redaction:** Remove any email/name/identifier before sending
- **Logging:** Log request IDs and timing, not full payloads

### Cost Controls

- **Rate Limiting:** Per-user daily limits (20 evaluations/day initially)
- **Caching:** Cache AI responses by pseudocode hash (24-hour TTL)
- **Circuit Breaker:** Auto-disable on cost threshold breach
- **Monitoring:** Alert on >$500/day spend

### Quality Assurance

- **Gold Set Testing:** 100+ expert-reviewed test cases
- **Automated Regression:** Run gold set on prompt/model changes
- **Confidence Thresholds:** Require ≥70% confidence for AI findings
- **Human Review:** Low-confidence predictions routed to manual queue

### Kill Switch

Feature flag: `ai_evaluation_enabled` (default: true)

Disable immediately if:
- Gold set accuracy drops below 90%
- Cost exceeds 2x budget
- Privacy incident involving AI provider
- Provider sustained outage (fallback to deterministic only)

## Consequences

### Easier

- Richer semantic feedback than pure pattern matching
- Handles novel solution approaches
- Natural language explanation evaluation
- Multi-provider reduces vendor lock-in

### More Difficult

- Complex testing and quality assurance
- Cost monitoring and optimization needed
- Provider contract negotiations for zero-retention
- Prompt engineering requires specialized expertise
- Debugging non-deterministic behavior

## Review Date

2026-11-17 (3 months) - Review gold set accuracy, cost per evaluation, and user feedback on AI quality

## Owners

- ML Lead: Prompt engineering and quality thresholds
- Backend Lead: Integration, caching, and fallback logic
- Security Lead: Privacy review and injection prevention
