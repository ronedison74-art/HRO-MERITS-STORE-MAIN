// SERVER-ONLY. Verifies the caller's Supabase login token and looks up their role.
import { getServiceClient } from './supabase.server'

export type Role = 'admin' | 'encoder'

export interface AuthUser {
  id: string
  email: string
  role: Role
}

export class AuthError extends Error {}

/** Verify "Authorization: Bearer <jwt>" and return the user + their role. */
export async function authenticate(
  header: string | null | undefined,
): Promise<AuthUser> {
  const token = /^Bearer\s+(.+)$/i.exec(header ?? '')?.[1]?.trim()
  if (!token) throw new AuthError('Please sign in.')

  const db = getServiceClient()

  const { data, error } = await db.auth.getUser(token)
  const user = data?.user
  if (error || !user?.email) {
    throw new AuthError('Your session has expired. Please sign in again.')
  }

  const email = user.email.trim().toLowerCase()

  const { data: row, error: roleErr } = await db
    .from('ms_users')
    .select('role, active')
    .eq('email', email)
    .maybeSingle()

  if (roleErr) throw new Error(`Could not check your access: ${roleErr.message}`)
  if (!row || !row.active) {
    throw new AuthError(
      'Your email is not authorized for Merit Store. Ask an admin to add you.',
    )
  }

  const role: Role = row.role === 'admin' ? 'admin' : 'encoder'
  return { id: user.id, email, role }
}

/** Timing-safe string comparison (for the re-entered confirmation password). */
export function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const x = enc.encode(a)
  const y = enc.encode(b)
  let diff = x.length ^ y.length
  const len = Math.max(x.length, y.length)
  for (let i = 0; i < len; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}
