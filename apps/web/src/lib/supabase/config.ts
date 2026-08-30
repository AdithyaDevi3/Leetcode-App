const requiredSupabaseEnvironment = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
] as const;

export interface SupabasePublicConfig {
  url: string;
  publishableKey: string;
}

export function isSupabaseConfigured(environment: NodeJS.ProcessEnv = process.env): boolean {
  return requiredSupabaseEnvironment.every((name) => Boolean(environment[name]?.trim()));
}

/**
 * Reads browser-safe Supabase configuration. This is deliberately lazy so the
 * current local-only experience continues to work before Supabase is enabled.
 */
export function getSupabasePublicConfig(
  environment: NodeJS.ProcessEnv = process.env,
): SupabasePublicConfig {
  const missing = requiredSupabaseEnvironment.filter((name) => !environment[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Supabase is not configured. Missing: ${missing.join(', ')}.`);
  }

  const url = environment.NEXT_PUBLIC_SUPABASE_URL!;
  try {
    new URL(url);
  } catch {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL must be a valid URL.');
  }

  return {
    url,
    publishableKey: environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  };
}
