import { createFileRoute, Link } from '@tanstack/react-router'
import { AppShell } from '@/components/AppShell'
import { LuxIcon, type LuxIconName } from '@/components/LuxIcons'
import {
  CountUp,
  JourneyTrack,
  LuxBackdrop,
  LuxTitle,
  Reveal,
  glowHandlers,
} from '@/components/LuxEffects'
import { useMeritStore } from '@/lib/useMeritStore'
import { useAuth } from '@/lib/auth'

export const Route = createFileRoute('/')({
  component: Portal,
})

const FLEET_LOOKUP = 'https://fleethro.netlify.app/'
const FLEET_ENCODE = 'https://fleethro.netlify.app/pages/encode'

interface Step {
  key: string
  to: '/encode' | '/confirm' | '/records' | '/reports'
  title: string
  chip: string
  desc: string
  cta: string
  badge?: string
}

interface Tool {
  key: string
  label: string
  desc: string
  icon: LuxIconName
  to?: '/admin'
  href?: string
  adminOnly?: boolean
}

const idx = (i: number) => ({ ['--i' as string]: i }) as React.CSSProperties

function Portal() {
  const { transactions, cadets, ready, backend } = useMeritStore()
  const { isAdmin, role } = useAuth()
  const pending = ready ? transactions.filter((t) => t.status === 'Pending').length : 0

  const status = !ready
    ? { text: 'Connecting…', cls: 'wait' }
    : backend
      ? { text: 'Live · shared by all operators', cls: 'ok' }
      : { text: 'Offline · changes will not be saved', cls: 'off' }

  const steps: Step[] = [
    {
      key: 'availment',
      to: '/encode',
      title: 'Merit Store Availment',
      chip: 'Day 1 · Start here',
      desc: 'Record privilege availments, including ED and demerit hours, with live balance and quota checks.',
      cta: 'Start an availment',
    },
    {
      key: 'confirm',
      to: '/confirm',
      title: 'Confirm',
      chip: 'Day 2',
      desc: 'Resolve the pending queue. Merits are deducted only when an availment is logged.',
      cta: 'Review the queue',
      badge: pending > 0 ? `${pending} pending` : undefined,
    },
    {
      key: 'records',
      to: '/records',
      title: 'Records',
      chip: 'History',
      desc: 'Every transaction, filterable by date and status, exported to Excel one sheet per privilege.',
      cta: 'Open records',
    },
    {
      key: 'reports',
      to: '/reports',
      title: 'Reports',
      chip: 'HR',
      desc: 'Printable summaries for the department.',
      cta: 'Open reports',
    },
  ]

  const allTools: Tool[] = [
    {
      key: 'admin',
      label: 'Admin',
      desc: `Roster, privileges, quotas, access${ready ? ` · ${cadets.length} cadets` : ''}`,
      icon: 'admin',
      to: '/admin',
      adminOnly: true,
    },
    {
      key: 'lookup',
      label: 'Cadet Merit Lookup',
      desc: 'Live balances and quotas on Fleet Merits',
      icon: 'lookup',
      href: FLEET_LOOKUP,
    },
    {
      key: 'fleet-encode',
      label: 'Fleet Encode',
      desc: 'The official operator Encode on Fleet Merits',
      icon: 'globe',
      href: FLEET_ENCODE,
    },
  ]
  const tools = allTools.filter((t) => !t.adminOnly || isAdmin)

  return (
    <AppShell title="Merit Store" bare>
      <LuxBackdrop />

      <section className="lux-hero">
        <div className="lux-hero-inner" data-parallax="0.2" data-fade="560">
          <div className="lux-logo">
            <span className="lux-logo-ring" />
            <span className="lux-logo-ring2" />
            <img src="/fleet-logo.png" alt="Fleet Merits" />
          </div>
          <div className="lux-eyebrow">Fleet Merits · Human Resource Department</div>
          <LuxTitle text="Merit Store" />
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
        </div>
      </section>

      <div className="jr-layout">
        <section aria-label="Workflow">
          <Reveal className="lux-section">The workflow</Reveal>
          <JourneyTrack>
            {steps.map((st, i) => (
              <Reveal key={st.key} className="jr-step" style={idx(i)}>
                <span className="jr-node" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <Link className="jr-card" to={st.to} {...glowHandlers}>
                  <span className="jr-num" aria-hidden="true">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className="jr-head">
                    <h2 className="jr-title">{st.title}</h2>
                    {st.badge && <span className="lux-badge">{st.badge}</span>}
                  </div>
                  <p className="jr-desc">{st.desc}</p>
                  <div className="jr-meta">
                    <span className="jr-chip">{st.chip}</span>
                    <span className="jr-go">
                      {st.cta} <span className="jr-arrow">→</span>
                    </span>
                  </div>
                </Link>
              </Reveal>
            ))}
          </JourneyTrack>
        </section>

        <aside className="jr-side" aria-label="Overview and tools">
          <Reveal className="jr-panel" style={idx(2)}>
            <div className="jr-eyebrow">Awaiting confirmation</div>
            <div className="jr-big">
              <CountUp value={pending} />
            </div>
            <div className="jr-big-sub">
              {!ready
                ? 'Loading the queue…'
                : pending === 0
                  ? 'All clear. Nothing is waiting.'
                  : pending === 1
                    ? 'availment is waiting for a decision'
                    : 'availments are waiting for a decision'}
            </div>
            <Link className="sub-btn blue" to="/confirm">
              Review the queue
            </Link>
          </Reveal>

          <Reveal className="jr-panel" style={idx(3)}>
            <div className="jr-eyebrow">Toolkit</div>
            <div className="jr-tools">
              {tools.map((t) => {
                const body = (
                  <>
                    <span className="jr-tool-icon">
                      <LuxIcon name={t.icon} />
                    </span>
                    <span className="jr-tool-text">
                      <div className="jr-tool-label">{t.label}</div>
                      <div className="jr-tool-desc">{t.desc}</div>
                    </span>
                    <span className="jr-arrow" aria-hidden="true">
                      {t.href ? '↗' : '→'}
                    </span>
                  </>
                )
                return t.href ? (
                  <a
                    key={t.key}
                    className="jr-tool"
                    href={t.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {body}
                  </a>
                ) : (
                  <Link key={t.key} className="jr-tool" to={t.to!}>
                    {body}
                  </Link>
                )
              })}
            </div>
          </Reveal>
        </aside>
      </div>

      <p className="lux-foot">
        Lookup and Fleet Encode open in a new tab on Fleet Merits.
      </p>
    </AppShell>
  )
}
