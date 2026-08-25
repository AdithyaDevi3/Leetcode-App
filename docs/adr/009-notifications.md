# ADR-009: Notifications

## Status

Accepted

## Context

Users need timely notifications for practice reminders, evaluation results, achievements, and system updates. Notifications must be respectful, configurable, and privacy-conscious while driving engagement without creating anxiety or compulsive behavior.

## Decision

### Notification Channels

1. **Email** (primary) - Via SendGrid or AWS SES
2. **In-App** (badges, toast) - Real-time via WebSocket or polling
3. **Push Notifications** (PWA) - Web Push API for mobile/desktop
4. **SMS** (future) - High-value only (security, urgent)

### Notification Types

| Type | Channel | Default | User Control |
|------|---------|---------|--------------|
| Evaluation Complete | In-App, Push | On | Can disable |
| Practice Reminder | Email, Push | Off | Can enable with schedule |
| Weekly Progress | Email | Off | Opt-in |
| Achievement Unlocked | In-App | On | Cannot disable |
| Security Alert | Email, SMS | On | Cannot disable |
| System Maintenance | Email, In-App | On | Cannot disable |
| New Content | Email | Off | Opt-in |

### Notification Principles

**Respect and Consent:**
- Explicit opt-in for promotional/engagement notifications
- Easy unsubscribe (one-click from email)
- Frequency caps (max 1 email/day for non-critical)
- Quiet hours respected (no push 10pm-8am user local time)

**Value and Clarity:**
- Every notification must be actionable
- No "streak" anxiety or FOMO patterns
- Clear preview without requiring app open
- Deep links to relevant content

**Privacy:**
- No user data in notification content visible to others
- Generic subjects for email (not "You failed Problem X")
- Server-side rendering (no tracking pixels)

### Email Templates

**Transactional Email Provider: SendGrid or AWS SES**

Template Requirements:
- Plain text + HTML versions
- Accessible (tested with screen readers)
- Mobile-responsive
- Unsubscribe link in footer
- Privacy policy link
- Company address (CAN-SPAM compliance)

Template Categories:
- **Transactional:** Account, security, data requests (cannot unsubscribe)
- **Behavioral:** Evaluation complete, practice suggestions (opt-out)
- **Marketing:** New features, content updates (opt-in only)

### Push Notification Architecture

```
┌──────────────┐
│ Notification │
│   Worker     │
└──────┬───────┘
       │
       ▼
┌──────────────────┐
│ Notification API │
└────┬─────────────┘
     │
     ├─────────▶ Email (SendGrid)
     │
     ├─────────▶ Web Push (Browser Push API)
     │
     └─────────▶ In-App (WebSocket/Polling)
```

### Scheduling Strategy

**Practice Reminders:**
- User sets preferred days/times
- Respects timezone
- Intelligent: Don't remind if user already practiced
- Adaptive: Reduce frequency if consistently ignored

**Spaced Repetition:**
- Algorithm-driven review reminders
- Based on mastery decay model
- No reminders during user-blocked times

### Notification Queue

**Separate queue: notification-queue**

Job Schema:
```json
{
  "userId": "uuid",
  "type": "practice_reminder",
  "channel": ["email", "push"],
  "priority": "normal",
  "scheduledAt": "2026-08-18T09:00:00Z",
  "data": {
    "activityId": "uuid",
    "reason": "spaced_repetition"
  }
}
```

Delivery:
- Deduplication window (10 minutes)
- Retry on transient failure (3 attempts)
- Mark failed deliveries for investigation
- Respect user opt-out status

### Privacy Compliance

- **Consent:** Explicit opt-in for non-transactional
- **Transparency:** Clear explanation of each notification type
- **Control:** Granular per-channel, per-type settings
- **Retention:** Notification history for 90 days, then deleted
- **Audit:** Log opt-in/opt-out events

### Rate Limiting

Per user:
- **Email:** Max 1 non-critical per day
- **Push:** Max 5 per day
- **In-App:** No limit (user-initiated context)

Global:
- **Email sending:** Respect SendGrid/SES limits
- **Cost monitoring:** Alert at 80% of budget

### Deliverability

**Email Best Practices:**
- SPF, DKIM, DMARC configured
- Warm-up sending IP gradually
- Monitor bounce and complaint rates (<5%)
- Remove hard bounces immediately
- Honor opt-outs instantly

### Testing

- **Template rendering:** Visual regression tests
- **Localization:** Test all supported languages
- **Accessibility:** Screen reader testing
- **Links:** Automated link validation
- **Spam score:** Test with Mail-Tester

## Consequences

### Easier

- Re-engagement without being intrusive
- Timely feedback drives learning continuity
- Managed service handles deliverability complexity
- Granular controls build trust

### More Difficult

- Complex preference management UI
- Timezone and scheduling logic
- Email deliverability requires monitoring
- Must balance engagement and annoyance
- CAN-SPAM and GDPR compliance overhead

## Review Date

2027-02-17 (6 months) - Review open rates, unsubscribe rates, user feedback, and notification effectiveness

## Owners

- Product Lead: Notification strategy and frequency policies
- Backend Lead: Notification system implementation
- Design Lead: Templates and in-app notification UX
- DevOps Lead: Deliverability monitoring and email infrastructure
