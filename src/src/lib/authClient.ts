// Browser-side Supabase Auth (magic-link login only — no data access here).
// All data goes through server functions; the anon key can't read any table.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { prepareLoginServer } from './msServerFunctions'

const URL = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined
const ANON = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string | undefined

let _client: SupabaseClient | null = null

export function isAuthConfigured(): boolean {
  return Boolean(URL && ANON)
}

export function getAuthClient(): SupabaseClient {
  if (!URL || !ANON) {
    throw new Error(
      'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Set them in Netlify (or .env) and rebuild.',
    )
  }
  if (!_client) {
    _client = createClient(URL, ANON, {
      auth: {
        // "implicit" so a magic link also works when opened on a different
        // device/browser than the one that requested it (e.g. phone vs laptop).
        flowType: 'implicit',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  }
  return _client
}

export async function getAccessToken(): Promise<string | null> {
  if (!isAuthConfigured()) return null
  const { data } = await getAuthClient().auth.getSession()
  return data.session?.access_token ?? null
}

/** Sends a sign-in link. Only emails an admin has added can get one. */
export async function sendMagicLink(rawEmail: string): Promise<void> {
  const email = rawEmail.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Enter a valid email address.')
  }

  const { ok } = await prepareLoginServer({ data: { email } })
  if (!ok) {
    throw new Error(
      'That email is not registered for Merit Store. Ask an admin to add you.',
    )
  }

  const { error } = await getAuthClient().auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${window.location.origin}/`,
    },
  })
  if (error) throw new Error(error.message)
}

/** Redirects to Google. The server still only lets allow-listed emails in. */
export async function signInWithGoogle(): Promise<void> {
  const { error } = await getAuthClient().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/` },
  })
  if (error) throw new Error(error.message)
}

export async function signOut(): Promise<void> {
  await getAuthClient().auth.signOut()
}
