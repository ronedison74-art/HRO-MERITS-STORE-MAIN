import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { AppShell } from '@/components/AppShell'
import { useMeritStore } from '@/lib/useMeritStore'
import { downloadCSV } from '@/lib/csv'
import { formatDateLong } from '@/lib/format'
import type { Transaction, TransactionStatus } from '@/lib/meritStore'

export const Route = createFileRoute('/reports')({
  component: Reports,
})

const STATUSES: TransactionStatus[] = ['Pending', 'Confirmed', 'Cancelled', 'Not Confirmed', 'Invalid']

function Reports() {
  const { transactions, privileges } = useMeritStore()

  const [date, setDate] = useState('')
  const [privilegeId, setPrivilegeId] = useState('')
  const [batch, setBatch] = useState('')
  const [status, setStatus] = useState('')
  const [generated, setGenerated] = useState<{ rows: Transaction[]; label: string; when: string } | null>(null)

  const batches = useMemo(
    () => Array.from(new Set(transactions.map((t) => t.batch).filter(Boolean))).sort(),
    [transactions],
  )

  function handleGenerate() {
    const rows = transactions.filter((t) => {
      if (date && t.availmentDate !== date) return false
      if (privilegeId && t.privilegeId !== privilegeId) return false
      if (batch && t.batch !== batch) return false
      if (status && t.status !== status) return false
      return true
    })
    const priv = privileges.find((p) => p.id === privilegeId)
    const label = priv ? `${priv.name.toUpperCase()} AVAILMENT LIST` : 'AVAILMENT LIST'
    setGenerated({ rows, label, when: date || new Date().toISOString().slice(0, 10) })
  }

  function handleExport() {
    if (!generated) return
    downloadCSV(
      `merit-store-report-${Date.now()}.csv`,
      ['No.', 'Cadet Name', 'Batch / Section', 'Status'],
      generated.rows.map((t, i) => [i + 1, t.cadetName.toUpperCase(), t.batch, t.status.toUpperCase()]),
    )
  }

  return (
    <AppShell title="Reports" subtitle="Generate availment lists for submission.">
      <div className="filters no-print">
        <div className="field">
          <label>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label>Privilege</label>
          <select value={privilegeId} onChange={(e) => setPrivilegeId(e.target.value)}>
            <option value="">All</option>
            {privileges.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Batch / Section</label>
          <select value={batch} onChange={(e) => setBatch(e.target.value)}>
            <option value="">All</option>
            {batches.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <button className="sub-btn blue sm" onClick={handleGenerate}>Generate List</button>
      </div>

      {generated && (
        <>
          <div className="sub-bar no-print" style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <button className="sub-btn ghost sm" onClick={() => window.print()}>Print List</button>
            <button className="sub-btn ghost sm" onClick={handleExport} disabled={generated.rows.length === 0}>
              Export CSV
            </button>
          </div>

          <div className="print-sheet">
            <div className="ps-brand">
              <img src="/fleet-logo.png" alt="Fleet Merits" />
              <div className="ps-brand-name">
                Fleet <span>Merits</span> · Merit Store
              </div>
            </div>
            <h2>{generated.label}</h2>
            <div className="ps-date">{formatDateLong(generated.when)}</div>
            {generated.rows.length === 0 ? (
              <div style={{ color: '#6b6b80', fontSize: 13, padding: '12px 0' }}>No matching availments.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>No.</th>
                    <th>Cadet Name</th>
                    <th>Batch</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {generated.rows.map((t, i) => (
                    <tr key={t.id}>
                      <td>{String(i + 1).padStart(2, '0')}</td>
                      <td>{t.cadetName.toUpperCase()}</td>
                      <td>{t.batch}</td>
                      <td>{t.status.toUpperCase()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </AppShell>
  )
}
