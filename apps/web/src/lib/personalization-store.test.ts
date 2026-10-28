import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseClient } from '@leetcode-app/database';
import { createPersonalizationStore } from './personalization-store';

const query = vi.fn();
const database = { query } as unknown as DatabaseClient;
const profile = { goal: 'interview', experience: 'new', preferredLanguage: 'typescript', weeklyMinutes: 90,
  timezone: 'America/New_York', diagnosticOptIn: true } as const;
const row = { goal: profile.goal, target_date: null, experience: profile.experience, preferred_language: profile.preferredLanguage,
  weekly_minutes: profile.weeklyMinutes, timezone: profile.timezone, accessibility_notes: null, diagnostic_opt_in: true,
  personalization_opt_out: true };

beforeEach(() => { vi.resetAllMocks(); query.mockResolvedValue({ rows: [row] }); });

describe('profile personalization consent persistence', () => {
  it('preserves an existing opt-out when an unrelated profile save omits the preference', async () => {
    const saved = await createPersonalizationStore(database).upsertProfile('owner-1', profile);
    expect(saved.personalizationOptOut).toBe(true);
    const [sql, values] = query.mock.calls[0];
    expect(sql).toContain('COALESCE($11::boolean, learner_profiles.personalization_opt_out)');
    expect(values[0]).toBe('owner-1');
    expect(values[10]).toBeNull();
  });

  it.each([true, false])('passes explicit consent preference %s without defaulting false to omission', async personalizationOptOut => {
    query.mockResolvedValue({ rows: [{ ...row, personalization_opt_out: personalizationOptOut }] });
    const saved = await createPersonalizationStore(database).upsertProfile('owner-1', { ...profile, personalizationOptOut });
    expect(query.mock.calls[0][1][9]).toBe(personalizationOptOut);
    expect(query.mock.calls[0][1][10]).toBe(personalizationOptOut);
    expect(saved.personalizationOptOut).toBe(personalizationOptOut);
  });
});
