import { describe, expect, it } from 'vitest';
import { getSupabasePublicConfig, isSupabaseConfigured } from './config';

describe('Supabase public configuration', () => {
  it('remains opt-in until both public variables are configured', () => {
    expect(isSupabaseConfigured({})).toBe(false);
    expect(isSupabaseConfigured({ NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co' })).toBe(false);
  });

  it('returns valid configured values', () => {
    const environment = {
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
    };
    expect(isSupabaseConfigured(environment)).toBe(true);
    expect(getSupabasePublicConfig(environment)).toEqual({
      url: environment.NEXT_PUBLIC_SUPABASE_URL,
      publishableKey: environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    });
  });

  it('rejects an invalid project URL', () => {
    expect(() => getSupabasePublicConfig({
      NEXT_PUBLIC_SUPABASE_URL: 'not-a-url',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
    })).toThrow('NEXT_PUBLIC_SUPABASE_URL must be a valid URL.');
  });
});
