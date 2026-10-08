import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { AppShell } from '@/components/AppShell'
import { StatusBadge, ViolationBadge } from '@/components/Badges'
import { useToast } from '@/components/Toast'
import { useMeritStore } from '@/lib/useMeritStore'
import { useAuth } from '@/lib/auth'
import { downloadRecordsExcel } from '@/lib/excelExport'
import { formatDateShort } from '@/lib/format'
import { deleteTransaction, type TransactionStatus } from '@/lib/meritStore'

export const Route = createFileRoute('/records')({
  component: Records,
})

const STATUSES: TransactionStatus[] = ['Pending', 'Confirmed', 'Cancelled', 'Not Confirmed', 'Invalid']

function Records() {
  const { transactions, privileges, ready } = useMeritStore()
  const { isAdmin } = useAuth()
  const { show } = useToast()

  const [search, setSearch] = useState('')
  const [date, setDate] = useState('')
  const [privilegeId, setPrivilegeId] = useState('')
  const [batch, setBatch] = useState('')
  const [status, setStatus] = useState('')
  const [violation, setViolation] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const batches = useMemo(
    () => Array.from(new Set(transactions.map((t) => t.batch).filter(Boolean))).sort(),
    [transactions],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return transactions.filter((t) => {
      if (q && !`${t.cadetName} ${t.cadetId} ${t.id}`.toLowerCase().includes(q)) return false
      if (date && t.availmentDate !== date) return false
      if (privilegeId && t.privilegeId !== privilegeId) return false
      if (batch && t.batch !== batch) return false
      if (status && t.status !== status) return false
      if (violation && (violation === 'YES' ? !t.violation : t.violation)) return false
      return true
    })
  }, [transactions, search, date, privilegeId, batch, status, violation])

  function handleExport() {
    downloadRecordsExcel(filtered)
  }


  async function handleRemove(id: string, cadetName: string, meritsDeducted: number) {
    const password = window.prompt(
      `Remove ${id} (${cadetName})?\n\n` +
        (meritsDeducted > 0
          ? `${meritsDeducted} merits will be returned to the cadet and credited on Fleet Lookup.\n\n`
          : 'No merits were deducted on this record.\n\n') +
        'Enter the admin confirmation password to continue:',
    )
    if (password === null) return

    setBusyId(id)
    try {
      const result = await deleteTransaction(id, password)
      if (!result.ok) {
        show(result.error || 'Remove failed.', 'bad')
        return
      }
      const quotaNote = result.quotaError
        ? ` Fleet quota not updated: ${result.quotaError}`
        : ''
      if (result.restored > 0) {
        if (result.fleetSynced) {
          show(
            `${id} removed. ${result.restored} merits returned locally and on Fleet Lookup.${quotaNote}`,
            result.quotaError ? 'bad' : 'ok',
          )
        } else {
          show(
            `${id} removed and ${result.restored} merits returned locally, but Lookup credit failed: ${result.fleetError || 'unknown'}${quotaNote}`,
            'bad',
          )
        }
      } else {
        show(`${id} removed from records.`, 'ok')
      }
    } catch (e: any) {
      show(e?.message || 'Remove failed.', 'bad')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <AppShell title="Records" subtitle="Transaction history. Admins can remove a record (password required); removing returns deducted merits.">
      <div className="filters">
        <div className="field">
          <label>Search</label>
          <input
            type="search"
            placeholder="Cadet, ID, transaction…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Availment Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label>Privilege</label>
          <select value={privilegeId} onChange={(e) => setPrivilegeId(e.target.value)}>
            <option value="">All</option>
            {privileges.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Batch / Section</label>
          <select value={batch} onChange={(e) => setBatch(e.target.value)}>
            <option value="">All</option>
            {batches.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Violation</label>
          <select value={violation} onChange={(e) => setViolation(e.target.value)}>
            <option value="">All</option>
            <option value="YES">Yes</option>
            <option value="NO">No</option>
          </select>
        </div>
        <button className="sub-btn blue sm" onClick={handleExport} disabled={filtered.length === 0}>
          Export Excel
        </button>
      </div>

      <div className="table-wrap">
        <table className="ms-table">
          <thead>
            <tr>
              <th>Transaction ID</th>
              <th>Cadet</th>
              <th>Cadet ID</th>
              <th>Batch</th>
              <th>Privilege</th>
              <th>Qty (ED/Demerit)</th>
              <th>Merit Cost</th>
              <th>Availment Date</th>
              <th>Confirmation Date</th>
              <th>Status</th>
              <th>Deducted</th>
              <th>Violation</th>
              <th>Processed By</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => (
              <tr key={t.id}>
                <td className="mono">{t.id}</td>
                <td>{t.cadetName}</td>
                <td>{t.cadetId}</td>
                <td>{t.batch}</td>
                <td>{t.privilegeName}</td>
                <td className="mono">
                  {t.privilegeType === 'ACCOUNTABILITY' && t.quantity != null
                    ? t.quantity
                    : '—'}
                </td>
                <td>{t.meritCost}</td>
                <td>{formatDateShort(t.availmentDate)}</td>
                <td>{formatDateShort(t.confirmationDate)}</td>
                <td>
                  <StatusBadge status={t.status} />
                </td>
                <td>{t.meritsDeducted}</td>
                <td>
                  <ViolationBadge violation={t.violation} />
                </td>
                <td>{t.processedBy}</td>
                <td>
                  {isAdmin && (
                    <button
                      type="button"
                      className="sub-btn red sm"
                      disabled={busyId !== null}
                      onClick={() => handleRemove(t.id, t.cadetName, t.meritsDeducted)}
                    >
                      {busyId === t.id ? '…' : 'Remove'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {ready && filtered.length === 0 && (
          <div className="ms-empty">No transactions match these filters.</div>
        )}
      </div>
    </AppShell>
  )
}
