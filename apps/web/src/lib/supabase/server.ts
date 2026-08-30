import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabasePublicConfig } from './config';

/**
 * Server Component and Route Handler client. Cookie writes from Server
 * Components are intentionally ignored; a later Supabase Auth migration will
 * add session-refresh middleware alongside retiring NextAuth.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = getSupabasePublicConfig();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot persist cookies. The future Supabase Auth
          // middleware refreshes those sessions before they reach this point.
        }
      },
    },
  });
}
