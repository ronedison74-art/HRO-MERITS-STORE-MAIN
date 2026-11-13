import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useMeritStore } from '@/lib/useMeritStore'
import { resolveConfirmation, type Transaction } from '@/lib/meritStore'
import { AppShell } from '@/components/AppShell'
import { TypeBadge } from '@/components/Badges'
import { useToast } from '@/components/Toast'
import { formatDateShort, todayISO } from '@/lib/format'

export const Route = createFileRoute('/confirm')({
  component: Confirm,
})

type GroupMode = 'batch' | 'privilege' | 'date' | 'none'

function Confirm() {
  const { transactions, cadets, privileges, ready } = useMeritStore()
  const { show } = useToast()
  const [query, setQuery] = useState('')
  const [batch, setBatch] = useState('')
  const [privilegeId, setPrivilegeId] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [date, setDate] = useState('')
  const [groupBy, setGroupBy] = useState<GroupMode>('batch')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  // Ids waiting for an "Invalid" reason (null = dialog closed).
  const [invalidIds, setInvalidIds] = useState<string[] | null>(null)
  const [invalidReason, setInvalidReason] = useState('')

  const pending = useMemo(
    () => transactions.filter((t) => t.status === 'Pending'),
    [transactions],
  )

  const batches = useMemo(
    () => Array.from(new Set(pending.map((t) => t.batch || 'No batch'))).sort(),
    [pending],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return pending.filter((t) => {
      if (q) {
        const hay = [
          t.id,
          t.cadetName,
          t.cadetId,
          t.batch,
          t.privilegeName,
          t.privilegeType,
          t.remarks,
          t.processedBy,
        ]
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (batch && (t.batch || 'No batch') !== batch) return false
      if (privilegeId && t.privilegeId !== privilegeId) return false
      if (typeFilter && t.privilegeType !== typeFilter) return false
      if (date && t.availmentDate !== date) return false
      return true
    })
  }, [pending, query, batch, privilegeId, typeFilter, date])

  const groups = useMemo(() => {
    if (groupBy === 'none') {
      return [{ key: 'All pending', items: filtered }]
    }
    const map = new Map<string, Transaction[]>()
    for (const t of filtered) {
      let key = '—'
      if (groupBy === 'batch') key = t.batch || 'No batch'
      else if (groupBy === 'privilege') key = t.privilegeName
      else if (groupBy === 'date') key = t.availmentDate || 'No date'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(t)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, items]) => ({ key, items }))
  }, [filtered, groupBy])

  const totals = useMemo(() => {
    const merits = filtered.reduce((s, t) => s + t.meritCost, 0)
    return { count: filtered.length, merits }
  }, [filtered])

  function cadetBalance(cadetId: string): number | null {
    if (!cadetId) return null
    const c = cadets.find((x) => x.id === cadetId)
    return c ? c.availableMerits : null
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectGroup(items: Transaction[]) {
    setSelected((prev) => {
      const next = new Set(prev)
      const allOn = items.every((t) => next.has(t.id))
      for (const t of items) {
        if (allOn) next.delete(t.id)
        else next.add(t.id)
      }
      return next
    })
  }

  function selectAllFiltered() {
    setSelected(new Set(filtered.map((t) => t.id)))
  }

  function clearSelection() {
    setSelected(new Set())
  }

  async function handleOne(
    id: string,
    outcome: 'granted' | 'not-granted' | 'invalid',
    reason?: string,
  ) {
    const txn = pending.find((t) => t.id === id)
    setBusyId(id)
    try {
      const result = await resolveConfirmation(id, outcome, todayISO(), reason)
      const quotaNote = result.quotaError
        ? ` Fleet quota not updated: ${result.quotaError}`
        : ''
      const unlinkedNote = result.unlinked
        ? ' No roster cadet matched this name, so no balance was deducted.'
        : ''

      if (outcome === 'granted') {
        show(
          result.fleetSynced
            ? `${id} Logged — ${txn?.meritCost ?? 0} merits deducted.${unlinkedNote}${quotaNote}`
            : `${id} Logged and saved, but the Fleet Lookup sync failed: ${result.fleetError || 'error'}${unlinkedNote}${quotaNote}`,
          result.fleetSynced && !result.unlinked && !result.quotaError ? 'ok' : 'bad',
        )
      } else if (outcome === 'invalid') {
        show(`${id} Invalid — no deduction, no availment. Reason: ${reason}`, 'bad')
      } else {
        // not-granted
        const willDeduct = txn?.privilegeType === 'ACCOUNTABILITY'
        if (willDeduct && txn) {
          show(
            result.fleetSynced
              ? `${id} Not Logged — ${txn.meritCost} deducted, cadet to be sanctioned.${unlinkedNote}${quotaNote}`
              : `${id} resolved and saved, but the Fleet Lookup sync failed: ${result.fleetError || 'error'}${quotaNote}`,
            'bad',
          )
        } else {
          show(`${id} Not Logged — cancelled, no deduction.`, 'bad')
        }
      }

      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    } catch (e: any) {
      show(e?.message || 'Confirmation failed.', 'bad')
    } finally {
      setBusyId(null)
    }
  }

  /** Open the reason dialog; nothing is saved until a reason is submitted. */
  function askInvalid(ids: string[]) {
    if (ids.length === 0) {
      show('Select at least one row.', 'bad')
      return
    }
    setInvalidReason('')
    setInvalidIds(ids)
  }

  async function submitInvalid() {
    const reason = invalidReason.trim()
    if (!invalidIds) return
    if (!reason) {
      show('Please type a reason for marking this Invalid.', 'bad')
      return
    }
    const ids = invalidIds
    setInvalidIds(null)
    if (ids.length === 1) {
      await handleOne(ids[0], 'invalid', reason)
    } else {
      await handleBulk('invalid', ids, reason)
    }
  }

  async function handleBulk(
    outcome: 'granted' | 'not-granted' | 'invalid',
    idsOverride?: string[],
    reason?: string,
  ) {
    const ids = idsOverride ?? Array.from(selected)
    if (ids.length === 0) {
      show('Select at least one row.', 'bad')
      return
    }
    const label =
      outcome === 'granted' ? 'Logged' : outcome === 'invalid' ? 'Invalid' : 'Not Logged'
    // Invalid already asked for confirmation (and a reason) in the dialog.
    if (
      outcome !== 'invalid' &&
      !window.confirm(
        `Mark ${ids.length} selected pending availment(s) as ${label}?`,
      )
    ) {
      return
    }

    setBusyId('__bulk__')
    let ok = 0
    let fail = 0
    try {
      for (const id of ids) {
        try {
          const result = await resolveConfirmation(id, outcome, todayISO(), reason)
          if (outcome === 'granted' && (!result.fleetSynced || result.quotaError)) fail++
          else ok++
        } catch {
          fail++
        }
      }
      show(
        `Bulk ${label}: ${ok} done${fail ? `, ${fail} with issues` : ''}.`,
        fail ? 'bad' : 'ok',
      )
      clearSelection()
    } finally {
      setBusyId(null)
    }
  }

  const busy = busyId !== null

  return (
    <AppShell
      title="Confirm"
      subtitle="Day 2 operations — filter, group, and resolve pending availments in bulk."
    >
      {/* Summary + filters */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            alignItems: 'center',
            marginBottom: 14,
          }}
        >
          <div className="field-hint">
            <strong style={{ color: 'var(--tx)', fontSize: 15 }}>
              {ready ? totals.count : '…'}
            </strong>{' '}
            pending
            {totals.count > 0 && (
              <>
                {' '}
                · <span className="mono">{totals.merits}</span> merits at stake
              </>
            )}
            {selected.size > 0 && (
              <>
                {' '}
                · <strong style={{ color: 'var(--acc)' }}>{selected.size} selected</strong>
              </>
            )}
          </div>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="sub-btn ghost sm"
            disabled={filtered.length === 0}
            onClick={selectAllFiltered}
          >
            Select all filtered
          </button>
          <button
            type="button"
            className="sub-btn ghost sm"
            disabled={selected.size === 0}
            onClick={clearSelection}
          >
            Clear selection
          </button>
          <button
            type="button"
            className="sub-btn ok sm"
            disabled={busy || selected.size === 0}
            onClick={() => handleBulk('granted')}
          >
            Mark selected Logged
          </button>
          <button
            type="button"
            className="sub-btn warn sm"
            disabled={busy || selected.size === 0}
            onClick={() => handleBulk('not-granted')}
          >
            Mark selected Not Logged
          </button>
          <button
            type="button"
            className="sub-btn red sm"
            disabled={busy || selected.size === 0}
            onClick={() => askInvalid(Array.from(selected))}
          >
            Invalid selected
          </button>
        </div>

        <div className="filters" style={{ marginBottom: 0 }}>
          <div className="field">
            <label htmlFor="confirmSearch">Search</label>
            <input
              id="confirmSearch"
              type="search"
              placeholder="Name, ID, privilege…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Batch</label>
            <select value={batch} onChange={(e) => setBatch(e.target.value)}>
              <option value="">All batches</option>
              {batches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
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
            <label>Type</label>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">All</option>
              <option value="REGULAR">Regular</option>
              <option value="ACCOUNTABILITY">Accountability</option>
            </select>
          </div>
          <div className="field">
            <label>Availment date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label>Group by</label>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as GroupMode)}
            >
              <option value="batch">Batch</option>
              <option value="privilege">Privilege</option>
              <option value="date">Date</option>
              <option value="none">None (flat list)</option>
            </select>
          </div>
        </div>
      </div>

      {ready && pending.length === 0 && (
        <div className="card">
          <div className="ms-empty">No pending transactions. Everything is resolved.</div>
        </div>
      )}

      {ready && pending.length > 0 && filtered.length === 0 && (
        <div className="card">
          <div className="ms-empty">No pending match these filters.</div>
        </div>
      )}

      {groups.map(({ key, items }) => {
        if (items.length === 0) return null
        const isCollapsed = collapsed[key] === true
        const groupSelected = items.every((t) => selected.has(t.id))
        return (
          <div className="card" key={key} style={{ marginBottom: 14, padding: 0 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 16px',
                borderBottom: isCollapsed ? 'none' : '1px solid var(--bor)',
                cursor: 'pointer',
              }}
              onClick={() =>
                setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }))
              }
            >
              <input
                type="checkbox"
                checked={groupSelected}
                onClick={(e) => e.stopPropagation()}
                onChange={() => toggleSelectGroup(items)}
                title="Select group"
              />
              <div className="card-title" style={{ fontSize: 14, margin: 0, flex: 1 }}>
                {groupBy === 'none' ? 'Pending queue' : key}
              </div>
              <div className="field-hint">
                {items.length} · {items.reduce((s, t) => s + t.meritCost, 0)} merits
              </div>
              <span className="field-hint" style={{ minWidth: 18 }}>
                {isCollapsed ? '▸' : '▾'}
              </span>
            </div>

            {!isCollapsed && (
              <div className="table-wrap" style={{ margin: 0, border: 'none', borderRadius: 0 }}>
                <table className="ms-table">
                  <thead>
                    <tr>
                      <th style={{ width: 36 }}></th>
                      <th>Cadet</th>
                      <th>Batch</th>
                      <th>Privilege</th>
                      <th>Type</th>
                      <th>Cost</th>
                      <th>Balance</th>
                      <th>Date</th>
                      <th>ID</th>
                      <th style={{ minWidth: 200 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((t) => {
                      const balance = cadetBalance(t.cadetId)
                      const deductOnNo = t.privilegeType === 'ACCOUNTABILITY'
                      const rowBusy = busyId === t.id
                      const lowBal =
                        balance != null && balance < t.meritCost
                      return (
                        <tr key={t.id}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selected.has(t.id)}
                              onChange={() => toggleSelect(t.id)}
                              disabled={busy}
                            />
                          </td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{t.cadetName}</div>
                            {t.cadetId && (
                              <div className="field-hint mono">{t.cadetId}</div>
                            )}
                          </td>
                          <td>{t.batch || '—'}</td>
                          <td>
                            {t.privilegeName}
                            {t.quantity != null && (
                              <div className="field-hint">×{t.quantity}</div>
                            )}
                          </td>
                          <td>
                            <TypeBadge type={t.privilegeType} />
                          </td>
                          <td className="mono">{t.meritCost}</td>
                          <td className="mono">
                            {balance != null ? (
                              <span style={lowBal ? { color: 'var(--warn)' } : undefined}>
                                {balance}
                                {lowBal ? ' !' : ''}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td>{formatDateShort(t.availmentDate)}</td>
                          <td className="mono field-hint">{t.id}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                className="sub-btn ok sm"
                                disabled={busy}
                                onClick={() => handleOne(t.id, 'granted')}
                                title="Logged — deduct merits"
                              >
                                {rowBusy ? '…' : 'Logged'}
                              </button>
                              <button
                                type="button"
                                className="sub-btn warn sm"
                                disabled={busy}
                                onClick={() => handleOne(t.id, 'not-granted')}
                                title={
                                  deductOnNo
                                    ? `Not Logged still deducts ${t.meritCost}, and the cadet is sanctioned`
                                    : 'Not Logged — no deduction'
                                }
                              >
                                {rowBusy ? '…' : 'Not Logged'}
                              </button>
                              <button
                                type="button"
                                className="sub-btn red sm"
                                disabled={busy}
                                onClick={() => askInvalid([t.id])}
                                title="Invalid — no deduction, no availment (a reason is required)"
                              >
                                {rowBusy ? '…' : 'Invalid'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}

      {invalidIds && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="invalidTitle"
          onClick={() => setInvalidIds(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            background: 'rgba(0,0,0,0.6)',
          }}
        >
          <div
            className="card"
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 460 }}
          >
            <h3 id="invalidTitle" style={{ marginTop: 0 }}>
              Mark {invalidIds.length > 1 ? `${invalidIds.length} availments` : invalidIds[0]} as Invalid
            </h3>
            <p className="field-hint" style={{ marginTop: 0 }}>
              No merits are deducted and nothing is availed. The reason you type will appear in
              Records and Reports.
            </p>
            <div className="field">
              <label htmlFor="invalidReason">Reason (required)</label>
              <textarea
                id="invalidReason"
                autoFocus
                rows={3}
                maxLength={500}
                value={invalidReason}
                onChange={(e) => setInvalidReason(e.target.value)}
                placeholder="e.g. Cadet was not eligible / wrong privilege encoded"
              />
              <span className="field-hint">{invalidReason.length}/500</span>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
              <button type="button" className="sub-btn ghost sm" onClick={() => setInvalidIds(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="sub-btn red sm"
                disabled={!invalidReason.trim()}
                onClick={submitInvalid}
              >
                Mark Invalid
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}
