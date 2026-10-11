// SERVER-ONLY. Never import this from client code (the `.server.ts` suffix makes
// TanStack Start fail the build if it ever ends up in the browser bundle).
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

export function getServiceClient(): SupabaseClient {
  if (_client) return _client

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) {
    throw new Error(
      'Server is missing SUPABASE_URL (Netlify → Site configuration → Environment variables).',
    )
  }
  if (!key) {
    throw new Error(
      'Server is missing SUPABASE_SERVICE_ROLE_KEY (Netlify → Site configuration → Environment variables).',
    )
  }

  _client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return _client
}
