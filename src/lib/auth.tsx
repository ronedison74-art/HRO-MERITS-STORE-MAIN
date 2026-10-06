import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { getAuthClient, isAuthConfigured, signOut as doSignOut } from './authClient'
import { getMe } from './msClient'
import { resetStore } from './meritStore'

export type Role = 'admin' | 'encoder'

export type AuthStatus =
  | 'loading'
  | 'signedOut'
  | 'signedIn'
  | 'denied' // signed in with Supabase but not allowed (not on the allow-list / lookup failed)
  | 'misconfigured'

interface AuthState {
  status: AuthStatus
  email: string
  role: Role | null
  message: string
}

interface AuthContextValue extends AuthState {
  isAdmin: boolean
  signOut: () => Promise<void>
  retry: () => void
}

const INITIAL: AuthState = { status: 'loading', email: '', role: null, message: '' }

const AuthContext = createContext<AuthContextValue>({
  ...INITIAL,
  isAdmin: false,
  signOut: async () => {},
  retry: () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(INITIAL)
  const userIdRef = useRef<string | null>(null)
  const [nonce, setNonce] = useState(0)

  const load = useCallback(async (userId: string | null) => {
    if (!userId) {
      userIdRef.current = null
      resetStore()
      setState({ status: 'signedOut', email: '', role: null, message: '' })
      return
    }
    userIdRef.current = userId
    try {
      const me = await getMe()
      setState({ status: 'signedIn', email: me.email, role: me.role, message: '' })
    } catch (e) {
      setState({
        status: 'denied',
        email: '',
        role: null,
        message: e instanceof Error ? e.message : 'Could not verify your access.',
      })
    }
  }, [])

  useEffect(() => {
    if (!isAuthConfigured()) {
      setState({
        status: 'misconfigured',
        email: '',
        role: null,
        message:
          'The site is missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Add them in Netlify and redeploy.',
      })
      return
    }

    const client = getAuthClient()
    let cancelled = false

    client.auth.getSession().then(({ data }) => {
      if (!cancelled) void load(data.session?.user.id ?? null)
    })

    const { data: sub } = client.auth.onAuthStateChange((event, session) => {
      // Deferred: calling Supabase from inside this callback can deadlock.
      setTimeout(() => {
        if (cancelled) return
        if (event === 'SIGNED_OUT' || !session) {
          void load(null)
        } else if (
          (event === 'SIGNED_IN' || event === 'USER_UPDATED') &&
          // Supabase re-fires SIGNED_IN when the tab regains focus — ignore if nothing changed.
          session.user.id !== userIdRef.current
        ) {
          void load(session.user.id)
        }
      }, 0)
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
    // `nonce` re-runs the check when the user presses "Try again".
  }, [load, nonce])

  const signOut = useCallback(async () => {
    try {
      await doSignOut()
    } finally {
      await load(null)
    }
  }, [load])

  const retry = useCallback(() => {
    setState(INITIAL)
    userIdRef.current = null
    setNonce((n) => n + 1)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, isAdmin: state.role === 'admin', signOut, retry }),
    [state, signOut, retry],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
