import { createFileRoute, Link } from '@tanstack/react-router'
import { AppShell } from '@/components/AppShell'
import { useMeritStore } from '@/lib/useMeritStore'

export const Route = createFileRoute('/')({
  component: Portal,
})

const FLEET_LOOKUP = 'https://fleethro.netlify.app/'
const FLEET_ENCODE = 'https://fleethro.netlify.app/pages/encode'

function Portal() {
  const { transactions, cadets, ready, backend } = useMeritStore()
  const pending = ready ? transactions.filter((t) => t.status === 'Pending').length : 0
  const liveLabel = !ready
    ? 'Loading…'
    : backend
      ? '● Shared live store (all operators)'
      : '○ Offline — cannot reach the database (changes will not be saved)'

  return (
    <AppShell
      title="Command Portal"
      subtitle={`Choose where to work — Merit Store tools or live Fleet Merits Lookup.  ${liveLabel}`}
    >
      <div className="portal-grid">
        {/* External: Lookup */}
        <a
          className="portal-card portal-card-lookup"
          href={FLEET_LOOKUP}
          target="_blank"
          rel="noopener noreferrer"
        >
          <div className="portal-icon">🔎</div>
          <div className="portal-label">Cadet Merit Lookup</div>
          <div className="portal-desc">
            Live balances, activity, and quotas on Fleet Merits — public search.
          </div>
          <div className="portal-cta">Open Lookup ↗</div>
        </a>

        {/* Internal: Encode */}
        <Link to="/encode" className="portal-card portal-card-encode">
          <div className="portal-icon">✏️</div>
          <div className="portal-label">Encode</div>
          <div className="portal-desc">
            Day 1 — record privilege availments and merit costs in Merit Store.
          </div>
          <div className="portal-cta">Open Encode →</div>
        </Link>

        {/* Internal: Confirm */}
        <Link to="/confirm" className="portal-card portal-card-confirm">
          <div className="portal-icon">✅</div>
          <div className="portal-label">Confirm</div>
          <div className="portal-desc">
            Day 2 — resolve pending queue, bulk confirm, deduct merits.
          </div>
          <div className="portal-cta">
            Open Confirm →{pending > 0 ? ` (${pending} pending)` : ''}
          </div>
        </Link>

        {/* Internal: Records */}
        <Link to="/records" className="portal-card">
          <div className="portal-icon">📋</div>
          <div className="portal-label">Records</div>
          <div className="portal-desc">Full transaction history, export CSV, secure remove.</div>
          <div className="portal-cta">Open Records →</div>
        </Link>

        {/* Internal: Admin */}
        <Link to="/admin" className="portal-card">
          <div className="portal-icon">⚙️</div>
          <div className="portal-label">Admin</div>
          <div className="portal-desc">
            Cadet roster by batch, Excel upload, privilege rates.
            {ready ? ` · ${cadets.length} cadets` : ''}
          </div>
          <div className="portal-cta">Open Admin →</div>
        </Link>

        {/* Internal: Reports */}
        <Link to="/reports" className="portal-card">
          <div className="portal-icon">🖨️</div>
          <div className="portal-label">Reports</div>
          <div className="portal-desc">Summaries and printable reports for HR.</div>
          <div className="portal-cta">Open Reports →</div>
        </Link>

        {/* External: live encode */}
        <a
          className="portal-card portal-card-external"
          href={FLEET_ENCODE}
          target="_blank"
          rel="noopener noreferrer"
        >
          <div className="portal-icon">🌐</div>
          <div className="portal-label">Fleet Encode (live)</div>
          <div className="portal-desc">
            Official operator Encode on fleethro — merit / availed / quotas.
          </div>
          <div className="portal-cta">Open live site ↗</div>
        </a>
      </div>

      <div className="portal-foot field-hint">
        Merit Store handles availment workflow. Lookup and live Encode open in a new tab on Fleet
        Merits — no combined app, just clear links.
      </div>
    </AppShell>
  )
}
