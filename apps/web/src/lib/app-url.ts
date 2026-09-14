type RuntimeEnvironment = Record<string, string | undefined>;

function validHttpUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function applicationUrl(environment: RuntimeEnvironment = process.env): string {
  const configured = validHttpUrl(environment.NEXT_PUBLIC_APP_URL);
  if (configured) return configured;

  const deployment = validHttpUrl(environment.VERCEL_URL ? `https://${environment.VERCEL_URL}` : undefined);
  if (deployment) return deployment;

  const production = validHttpUrl(environment.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${environment.VERCEL_PROJECT_PRODUCTION_URL}`
    : undefined);
  return production ?? 'http://localhost:3000';
}

export function safeAppDestination(value: FormDataEntryValue | null): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/practice';
  return value;
}
