import { useState } from 'react'
import { sendMagicLink, signInWithGoogle } from '@/lib/authClient'
import { useAuth } from '@/lib/auth'

/** Full-screen sign-in / status screen shown instead of any page until the user is allowed in. */
export function LoginGate() {
  const { status, message, signOut, retry } = useAuth()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleGoogle() {
    setError('')
    setBusy(true)
    try {
      await signInWithGoogle() // leaves the page; comes back signed in
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start Google sign-in.')
      setBusy(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await sendMagicLink(email)
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the link.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <main
        className="app-content"
        style={{ maxWidth: 420, margin: '0 auto', paddingTop: 64 }}
      >
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <img src="/fleet-logo.png" alt="Fleet Merits" style={{ height: 56 }} />
          <h1 className="page-title" style={{ marginTop: 12 }}>
            Merit Store
          </h1>
        </div>

        <div className="card">
          {status === 'loading' && <p>Checking your sign-in…</p>}

          {status === 'misconfigured' && (
            <>
              <div className="card-title">Setup needed</div>
              <p className="field-hint">{message}</p>
            </>
          )}

          {status === 'denied' && (
            <>
              <div className="card-title">Access problem</div>
              <p className="field-hint" style={{ marginBottom: 12 }}>
                {message}
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="sub-btn blue" onClick={retry}>
                  Try again
                </button>
                <button type="button" className="sub-btn ghost" onClick={() => void signOut()}>
                  Sign out
                </button>
              </div>
            </>
          )}

          {status === 'signedOut' && !sent && (
            <form onSubmit={handleSubmit}>
              <div className="card-title" style={{ marginBottom: 12 }}>
                Sign in
              </div>
              <button
                type="button"
                className="sub-btn ghost"
                disabled={busy}
                onClick={() => void handleGoogle()}
                style={{ width: '100%', marginBottom: 12 }}
              >
                Sign in with Google
              </button>
              <p className="field-hint" style={{ margin: '4px 0 12px', textAlign: 'center' }}>
                — or use an email link (no password needed) —
              </p>
              <div className="field">
                <label htmlFor="login-email">Email</label>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              {error && (
                <p role="alert" style={{ color: 'var(--red, #c0392b)', margin: '8px 0' }}>
                  {error}
                </p>
              )}
              <button
                type="submit"
                className="sub-btn blue"
                disabled={busy || !email.trim()}
                style={{ marginTop: 8, width: '100%' }}
              >
                {busy ? 'Sending…' : 'Email me a sign-in link'}
              </button>
            </form>
          )}

          {status === 'signedOut' && sent && (
            <>
              <div className="card-title">Check your email</div>
              <p className="field-hint" style={{ marginBottom: 12 }}>
                We sent a sign-in link to <strong>{email.trim().toLowerCase()}</strong>. Open it on
                this device to continue. It can take a minute to arrive — check spam too.
              </p>
              <button
                type="button"
                className="sub-btn ghost"
                onClick={() => {
                  setSent(false)
                  setError('')
                }}
              >
                Use a different email
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
