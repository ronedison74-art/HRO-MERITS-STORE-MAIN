import { Link, useRouterState } from '@tanstack/react-router'
import { useState } from 'react'
import { useAuth } from '@/lib/auth'
import { LoginGate } from '@/components/LoginGate'

const NAV_ITEMS = [
  { to: '/', label: 'Portal', icon: '🏠', adminOnly: false },
  { to: '/encode', label: 'Encode', icon: '✏️', adminOnly: false },
  { to: '/confirm', label: 'Confirm', icon: '✅', adminOnly: false },
  { to: '/records', label: 'Records', icon: '📋', adminOnly: false },
  { to: '/reports', label: 'Reports', icon: '🖨️', adminOnly: false },
  { to: '/admin', label: 'Admin', icon: '⚙️', adminOnly: true },
] as const

export function AppShell({
  title,
  subtitle,
  adminOnly = false,
  children,
}: {
  title: string
  subtitle?: string
  /** Page is only for admins (encoders see an "Admin access required" message). */
  adminOnly?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const { status, email, role, isAdmin, signOut } = useAuth()

  // Nothing renders (and no data loads) until the user is signed in AND allowed.
  if (status !== 'signedIn') return <LoginGate />

  const navItems = NAV_ITEMS.filter((item) => isAdmin || !item.adminOnly)

  return (
    <div className="page">
      <nav>
        <div className="nav-brand">
          <img src="/fleet-logo.png" className="nav-logo-img" alt="Fleet Merits" />
          <div className="nav-name">
            Fleet <span>Merits</span>
          </div>
          <div className="ms-tag">Merit Store</div>
        </div>
        <div className="nav-links">
          <div className="nb-group">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`nb ${item.to === '/' ? 'nb-home' : ''} ${pathname === item.to ? 'act' : ''}`}
              >
                {item.icon} {item.label}
              </Link>
            ))}
            <button
              type="button"
              className="nb"
              title={`${email} (${role})`}
              onClick={() => void signOut()}
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
            >
              🚪 Sign out
            </button>
          </div>
          <button className="mbtn" aria-label="Open menu" onClick={() => setOpen(true)}>
            <span style={{ display: 'block', width: 20, height: 3, background: '#fff', borderRadius: 2 }} />
            <span style={{ display: 'block', width: 20, height: 3, background: '#fff', borderRadius: 2 }} />
            <span style={{ display: 'block', width: 20, height: 3, background: '#fff', borderRadius: 2 }} />
          </button>
        </div>
      </nav>

      <div className={`moverlay ${open ? 'on' : ''}`} onClick={() => setOpen(false)} />
      <div className={`mdrawer ${open ? 'on' : ''}`}>
        <div className="mhdr">
          <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 15 }}>Menu</span>
          <button
            onClick={() => setOpen(false)}
            style={{ background: 'none', border: 'none', color: 'var(--tx3)', cursor: 'pointer', fontSize: 20 }}
          >
            ×
          </button>
        </div>
        {navItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={`mi ${item.to === '/' ? 'mi-home' : ''} ${pathname === item.to ? 'act' : ''}`}
            onClick={() => setOpen(false)}
          >
            {item.icon} {item.label}
          </Link>
        ))}
        <div className="field-hint" style={{ padding: '12px 16px' }}>
          Signed in as <strong>{email}</strong> ({role})
        </div>
        <button
          type="button"
          className="mi"
          onClick={() => {
            setOpen(false)
            void signOut()
          }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }}
        >
          🚪 Sign out
        </button>
      </div>

      <main className="app-content">
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-sub">{subtitle}</p>}
        {adminOnly && !isAdmin ? (
          <div className="card">
            <div className="card-title">Admin access required</div>
            <p className="field-hint">
              Your account ({email}) is an encoder. Ask an admin if you need this page.
            </p>
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  )
}
