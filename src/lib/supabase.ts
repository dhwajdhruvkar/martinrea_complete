import { createClient } from '@supabase/supabase-js';

/**
 * Single Supabase client for the whole app.
 *
 * Auth, Postgres (PostgREST + RPC), and Storage all go through this instance.
 * The session (JWT) is persisted + auto-refreshed by supabase-js in
 * localStorage, and is attached to every PostgREST/RPC/Storage call.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  // Surface a clear, early error instead of cryptic network failures later.
  // eslint-disable-next-line no-console
  console.error(
    'Missing Supabase config. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY ' +
      '(see .env.example). The app cannot reach the backend without them.',
  );
}

export const supabase = createClient(url ?? '', anonKey ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'martinrea.supabase.auth',
  },
});

export const DOCUMENTS_BUCKET = 'invoice-documents';
