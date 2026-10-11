import { createFileRoute, Link } from '@tanstack/react-router'
import { AppShell } from '@/components/AppShell'
import { LuxIcon, type LuxIconName } from '@/components/LuxIcons'
import { useMeritStore } from '@/lib/useMeritStore'
import { useAuth } from '@/lib/auth'

export const Route = createFileRoute('/')({
  component: Portal,
})

const FLEET_LOOKUP = 'https://fleethro.netlify.app/'
const FLEET_ENCODE = 'https://fleethro.netlify.app/pages/encode'

interface Tile {
  key: string
  label: string
  desc: string
  cta: string
  icon: LuxIconName
  to?: '/encode' | '/confirm' | '/records' | '/reports' | '/admin'
  href?: string
  adminOnly?: boolean
  badge?: string
}

function TileCard({ tile, index }: { tile: Tile; index: number }) {
  const inner = (
    <>
      <div className="lux-card-top">
        <span className="lux-icon">
          <LuxIcon name={tile.icon} />
        </span>
        {tile.badge && <span className="lux-badge">{tile.badge}</span>}
      </div>
      <div className="lux-label">{tile.label}</div>
      <div className="lux-desc">{tile.desc}</div>
      <div className="lux-cta">
        <span>{tile.cta}</span>
        <span className="lux-arrow" aria-hidden="true">
          {tile.href ? '↗' : '→'}
        </span>
      </div>
    </>
  )
  const style = { ['--i' as string]: index } as React.CSSProperties
  return tile.href ? (
    <a
      className="lux-card"
      style={style}
      href={tile.href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {inner}
    </a>
  ) : (
    <Link className="lux-card" style={style} to={tile.to!}>
      {inner}
    </Link>
  )
}

function Portal() {
  const { transactions, cadets, ready, backend } = useMeritStore()
  const { isAdmin, role } = useAuth()
  const pending = ready ? transactions.filter((t) => t.status === 'Pending').length : 0

  const status = !ready
    ? { text: 'Connecting…', cls: 'wait' }
    : backend
      ? { text: 'Live · shared by all operators', cls: 'ok' }
      : { text: 'Offline · changes will not be saved', cls: 'off' }

  const workflow: Tile[] = [
    {
      key: 'encode',
      label: 'Encode',
      desc: 'Day 1. Record privilege availments and their merit cost.',
      cta: 'Open Encode',
      icon: 'encode',
      to: '/encode',
    },
    {
      key: 'confirm',
      label: 'Confirm',
      desc: 'Day 2. Resolve the pending queue and deduct merits.',
      cta: 'Open Confirm',
      icon: 'confirm',
      to: '/confirm',
      badge: pending > 0 ? `${pending} pending` : undefined,
    },
    {
      key: 'records',
      label: 'Records',
      desc: 'Complete transaction history, with Excel export.',
      cta: 'Open Records',
      icon: 'records',
      to: '/records',
    },
    {
      key: 'reports',
      label: 'Reports',
      desc: 'Summaries and printable reports for HR.',
      cta: 'Open Reports',
      icon: 'reports',
      to: '/reports',
    },
  ]

  const more: Tile[] = [
    {
      key: 'admin',
      label: 'Admin',
      desc: `Roster, privileges, quotas and access${ready ? ` · ${cadets.length} cadets` : ''}.`,
      cta: 'Open Admin',
      icon: 'admin',
      to: '/admin',
      adminOnly: true,
    },
    {
      key: 'lookup',
      label: 'Cadet Merit Lookup',
      desc: 'Live balances, activity and quotas on Fleet Merits.',
      cta: 'Open Lookup',
      icon: 'lookup',
      href: FLEET_LOOKUP,
    },
    {
      key: 'fleet-encode',
      label: 'Fleet Encode',
      desc: 'The official operator Encode on Fleet Merits.',
      cta: 'Open live site',
      icon: 'globe',
      href: FLEET_ENCODE,
    },
  ].filter((t) => !t.adminOnly || isAdmin) as Tile[]

  return (
    <AppShell title="Merit Store" bare>
      <section className="lux-hero">
        <div className="lux-logo">
          <span className="lux-logo-ring" />
          <span className="lux-logo-ring2" />
          <img src="/fleet-logo.png" alt="Fleet Merits" />
        </div>
        <div className="lux-eyebrow">Fleet Merits · Human Resource Department</div>
        <h1 className="lux-title">Merit Store</h1>
        <p className="lux-sub">Privilege availment and merit management</p>
        <div className="lux-rule" aria-hidden="true">
          <span />
          <i />
          <span />
        </div>
        <div className={`lux-status ${status.cls}`}>
          <span className="lux-dot" />
          {status.text}
          {role ? <em>{role === 'admin' ? 'Administrator' : 'Encoder'}</em> : null}
        </div>
      </section>

      <div className="lux-section">Workflow</div>
      <div className="lux-grid">
        {workflow.map((t, i) => (
          <TileCard key={t.key} tile={t} index={i} />
        ))}
      </div>

      <div className="lux-section">Management &amp; Fleet Merits</div>
      <div className="lux-grid">
        {more.map((t, i) => (
          <TileCard key={t.key} tile={t} index={i + workflow.length} />
        ))}
      </div>

      <p className="lux-foot">
        Merit Store runs the availment workflow. Lookup and Fleet Encode open in a new tab on Fleet
        Merits.
      </p>
    </AppShell>
  )
}
