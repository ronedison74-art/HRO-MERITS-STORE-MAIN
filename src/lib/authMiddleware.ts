import { createMiddleware } from '@tanstack/react-start'

/**
 * Runs on EVERY protected server function.
 *  - browser side: attaches the Supabase login token to the request
 *  - server side : verifies the token and loads the user's role from ms_users
 * Server-only modules are imported lazily so they never reach the browser bundle.
 */
export const authMiddleware = createMiddleware({ type: 'function' })
  .client(async ({ next }) => {
    const { getAccessToken } = await import('./authClient')
    const token = await getAccessToken()
    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
  })
  .server(async ({ next }) => {
    const { getRequestHeader } = await import('@tanstack/react-start/server')
    const { authenticate } = await import('../server/auth.server')
    const user = await authenticate(getRequestHeader('authorization'))
    return next({ context: { user } })
  })

/** Same as authMiddleware, but only lets admins through. */
export const adminMiddleware = createMiddleware({ type: 'function' })
  .middleware([authMiddleware])
  .server(async ({ context, next }) => {
    if (context.user.role !== 'admin') {
      throw new Error('Admin access required.')
    }
    return next()
  })
