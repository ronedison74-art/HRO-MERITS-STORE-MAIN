import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { AppShell } from '@/components/AppShell'
import { CadetPicker } from '@/components/CadetPicker'
import { LowBalanceNote } from '@/components/LowBalanceNote'
import { lowBalanceWarning } from '@/lib/rules'
import { useToast } from '@/components/Toast'
import { useMeritStore } from '@/lib/useMeritStore'
import {
  createAvailments,
  accountabilityQuantityLabel,
  type Transaction,
} from '@/lib/meritStore'
import { todayISO, formatDateShort } from '@/lib/format'

export const Route = createFileRoute('/encode')({
  component: Encode,
})

type Mode = 'single' | 'bulk'

interface BulkRow {
  key: string
  cadetId: string
  cadetName: string
  batch: string
  quantity: string
  remarks: string
}

let rowSeq = 0
function makeRow(): BulkRow {
  rowSeq += 1
  return {
    key: `row-${rowSeq}`,
    cadetId: '',
    cadetName: '',
    batch: '',
    quantity: '',
    remarks: '',
  }
}

function Encode() {
  const { privileges: allPrivileges, cadets, transactions, ready } = useMeritStore()
  const privileges = useMemo(() => allPrivileges.filter((p) => p.active), [allPrivileges])
  const { show } = useToast()

  const [mode, setMode] = useState<Mode>('single')

  // Single-entry cadet selection
  const [cadetId, setCadetId] = useState('')
  const [cadetName, setCadetName] = useState('')
  const [batch, setBatch] = useState('')

  const [privilegeId, setPrivilegeId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [availmentDate, setAvailmentDate] = useState(todayISO())
  const [remarks, setRemarks] = useState('')
  const [processedBy, setProcessedBy] = useState('')
  const [log, setLog] = useState<Transaction[]>([])
  const [submitting, setSubmitting] = useState(false)

  const [rows, setRows] = useState<BulkRow[]>(() => [makeRow(), makeRow()])

  const selectedPrivilege = useMemo(
    () => privileges.find((p) => p.id === privilegeId) ?? null,
    [privileges, privilegeId],
  )
  const isAccountability = selectedPrivilege?.type === 'ACCOUNTABILITY'
  /** REGULAR = fixed cost; ACCOUNTABILITY = rate (merits per unit). Locked to the Admin-set value. */
  const meritCost = selectedPrivilege?.cost ?? 0

  // Merits already promised by each cadet's Pending entries (not deducted until confirmed).
  const pendingByCadet = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of transactions) {
      if (t.status === 'Pending' && t.cadetId) {
        m.set(t.cadetId, (m.get(t.cadetId) ?? 0) + t.meritCost)
      }
    }
    return m
  }, [transactions])

  /** Low-balance warning for a roster cadet; null when fine or unknown (typed-in names have no balance). */
  function warningFor(id: string, needed: number | null) {
    if (!id) return null
    const cadet = cadets.find((c) => c.id === id)
    if (!cadet) return null
    return lowBalanceWarning(cadet.availableMerits, pendingByCadet.get(id) ?? 0, needed)
  }

  const computedTotal =
    isAccountability && quantity && !Number.isNaN(Number(quantity))
      ? Number(quantity) * meritCost
      : null

  function handlePrivilegeChange(id: string) {
    setPrivilegeId(id)
    setQuantity('')
  }

  function switchMode(next: Mode) {
    setMode(next)
  }

  function resetSingleForm() {
    setCadetId('')
    setCadetName('')
    setBatch('')
    setRemarks('')
    setQuantity('')
  }

  async function handleSubmitSingle(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    if (!selectedPrivilege) {
      show('Select a privilege first.', 'bad')
      return
    }
    if (!cadetName.trim()) {
      show('Enter or select a cadet.', 'bad')
      return
    }
    let qty: number | undefined
    if (isAccountability) {
      qty = Number(quantity)
      if (!quantity || Number.isNaN(qty) || qty <= 0) {
        show(`Enter a valid ${accountabilityQuantityLabel(selectedPrivilege.id)}.`, 'bad')
        return
      }
    }
    setSubmitting(true)
    try {
      const [txn] = await createAvailments(
        [
          {
            cadetName,
            cadetId,
            batch,
            privilegeId: selectedPrivilege.id,
            quantity: qty,
            remarks,
          },
        ],
        { availmentDate, processedBy },
      )
      setLog((prev) => [txn, ...prev])
      show(`${txn.id} encoded as Pending.`, 'ok')
      resetSingleForm()
    } catch (err: any) {
      show(err?.message || 'Could not save. Nothing was recorded — please try again.', 'bad')
    } finally {
      setSubmitting(false)
    }
  }

  function updateRow(key: string, patch: Partial<BulkRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }
  function addRow() {
    setRows((prev) => [...prev, makeRow()])
  }
  function removeRow(key: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev))
  }

  async function handleSubmitBulk(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    if (!selectedPrivilege) {
      show('Select a privilege first.', 'bad')
      return
    }
    const validRows = rows.filter((r) => r.cadetName.trim())
    if (validRows.length === 0) {
      show('Enter at least one cadet.', 'bad')
      return
    }
    if (isAccountability) {
      const bad = validRows.find(
        (r) => !r.quantity || Number.isNaN(Number(r.quantity)) || Number(r.quantity) <= 0,
      )
      if (bad) {
        show(
          `Enter a valid ${accountabilityQuantityLabel(selectedPrivilege.id)} for every row.`,
          'bad',
        )
        return
      }
    }
    setSubmitting(true)
    try {
      // One request, one database insert: either every row is saved or none is.
      const created = await createAvailments(
        validRows.map((row) => ({
          cadetName: row.cadetName,
          cadetId: row.cadetId,
          batch: row.batch,
          privilegeId: selectedPrivilege.id,
          quantity: isAccountability ? Number(row.quantity) : undefined,
          remarks: row.remarks.trim() || remarks,
        })),
        { availmentDate, processedBy },
      )
      setLog((prev) => [...created, ...prev])
      show(
        `${created.length} transaction${created.length === 1 ? '' : 's'} encoded as Pending.`,
        'ok',
      )
      setRows([makeRow(), makeRow()])
    } catch (err: any) {
      show(
        err?.message || 'Could not save. Nothing was recorded — please try again.',
        'bad',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const validRowCount = rows.filter((r) => r.cadetName.trim()).length

  return (
    <AppShell
      title="Encode"
      subtitle="Day 1 — record a privilege availment. No merits are deducted yet."
    >
      <div className="card">
        <div className="ms-mode-toggle" role="tablist" aria-label="Encoding mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'single'}
            className={`sub-btn sm ${mode === 'single' ? 'blue' : 'ghost'}`}
            onClick={() => switchMode('single')}
          >
            Single Entry
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'bulk'}
            className={`sub-btn sm ${mode === 'bulk' ? 'blue' : 'ghost'}`}
            onClick={() => switchMode('bulk')}
          >
            Bulk Entry
          </button>
        </div>

        {mode === 'single' ? (
          <form onSubmit={handleSubmitSingle}>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="cadetPicker">Cadet</label>
                <CadetPicker
                  id="cadetPicker"
                  cadets={cadets}
                  value={{ cadetId, cadetName, batch }}
                  onChange={(next) => {
                    setCadetId(next.cadetId)
                    setCadetName(next.cadetName)
                    setBatch(next.batch)
                  }}
                />
                {(() => {
                  const needed = !selectedPrivilege
                    ? null
                    : isAccountability
                      ? computedTotal
                      : meritCost
                  const w = warningFor(cadetId, needed)
                  return w ? <LowBalanceNote warning={w} /> : null
                })()}
              </div>
              <div className="field">
                <label htmlFor="privilege">Privilege</label>
                <select
                  id="privilege"
                  value={privilegeId}
                  onChange={(e) => handlePrivilegeChange(e.target.value)}
                  disabled={!ready}
                >
                  <option value="">Select privilege…</option>
                  {privileges.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.type === 'REGULAR' ? 'Regular' : 'Accountability'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="meritCost">
                  {isAccountability ? 'Rate (merits per unit)' : 'Merit Cost'}
                </label>
                <input
                  id="meritCost"
                  type="number"
                  min={0}
                  step={1}
                  value={meritCost}
                  readOnly
                  disabled={!selectedPrivilege}
                />
                <span className="field-hint">
                  {isAccountability
                    ? 'Set by Admin (locked).'
                    : 'Set by Admin (locked).'}
                </span>
              </div>

              {isAccountability && selectedPrivilege && (
                <div className="field">
                  <label htmlFor="quantity">
                    {accountabilityQuantityLabel(selectedPrivilege.id)}
                  </label>
                  <input
                    id="quantity"
                    type="number"
                    min={0}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                  <span className="field-hint">
                    {computedTotal !== null
                      ? `Total = ${quantity} × ${meritCost} = ${computedTotal} merits`
                      : `Total = quantity × rate`}
                  </span>
                </div>
              )}

              <div className="field">
                <label htmlFor="availmentDate">Availment Date</label>
                <input
                  id="availmentDate"
                  type="date"
                  value={availmentDate}
                  onChange={(e) => setAvailmentDate(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="processedBy">Processed By</label>
                <input
                  id="processedBy"
                  type="text"
                  placeholder="Encoder name (optional)"
                  value={processedBy}
                  onChange={(e) => setProcessedBy(e.target.value)}
                />
              </div>
              <div className="field span-2">
                <label htmlFor="remarks">Remarks</label>
                <textarea
                  id="remarks"
                  placeholder="Optional notes…"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                />
              </div>
            </div>

            <button
              type="submit"
              className="sub-btn blue"
              style={{ marginTop: 12 }}
              disabled={submitting || !ready}
            >
              Encode Availment
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmitBulk}>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="bulkPrivilege">Privilege</label>
                <select
                  id="bulkPrivilege"
                  value={privilegeId}
                  onChange={(e) => handlePrivilegeChange(e.target.value)}
                  disabled={!ready}
                >
                  <option value="">Select privilege…</option>
                  {privileges.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.type === 'REGULAR' ? 'Regular' : 'Accountability'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="bulkMeritCost">
                  {isAccountability
                    ? 'Rate (merits per unit — applies to every row)'
                    : 'Merit Cost (applies to every row)'}
                </label>
                <input
                  id="bulkMeritCost"
                  type="number"
                  min={0}
                  step={1}
                  value={meritCost}
                  readOnly
                  disabled={!selectedPrivilege}
                />
                <span className="field-hint">
                  {isAccountability
                    ? 'Set by Admin (locked) — total per row = quantity × rate'
                    : 'Set by Admin (locked).'}
                </span>
              </div>

              <div className="field">
                <label htmlFor="bulkDate">Availment Date</label>
                <input
                  id="bulkDate"
                  type="date"
                  value={availmentDate}
                  onChange={(e) => setAvailmentDate(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="bulkProcessedBy">Processed By</label>
                <input
                  id="bulkProcessedBy"
                  type="text"
                  placeholder="Encoder name (optional)"
                  value={processedBy}
                  onChange={(e) => setProcessedBy(e.target.value)}
                />
              </div>
              <div className="field span-2">
                <label htmlFor="bulkRemarks">Default Remarks</label>
                <textarea
                  id="bulkRemarks"
                  placeholder="Optional — used for any row left blank…"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                />
              </div>
            </div>

            <div className="table-wrap" style={{ marginTop: 16 }}>
              <table className="ms-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: 220 }}>Cadet</th>
                    {isAccountability && (
                      <th>
                        {selectedPrivilege
                          ? accountabilityQuantityLabel(selectedPrivilege.id)
                          : 'Quantity'}
                      </th>
                    )}
                    {isAccountability && <th>Est. Merits</th>}
                    <th>Remarks</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const qty = Number(row.quantity)
                    const est =
                      isAccountability && row.quantity && !Number.isNaN(qty)
                        ? qty * meritCost
                        : null
                    return (
                      <tr key={row.key}>
                        <td>
                          <CadetPicker
                            cadets={cadets}
                            value={{
                              cadetId: row.cadetId,
                              cadetName: row.cadetName,
                              batch: row.batch,
                            }}
                            onChange={(next) => updateRow(row.key, next)}
                            placeholder="Search cadet…"
                          />
                          {(() => {
                            const needed = !selectedPrivilege
                              ? null
                              : isAccountability
                                ? est
                                : meritCost
                            const w = warningFor(row.cadetId, needed)
                            return w ? <LowBalanceNote warning={w} /> : null
                          })()}
                        </td>
                        {isAccountability && (
                          <td>
                            <input
                              type="number"
                              min={0}
                              placeholder="0"
                              value={row.quantity}
                              onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                            />
                          </td>
                        )}
                        {isAccountability && (
                          <td className="mono">{est !== null ? est : '—'}</td>
                        )}
                        <td>
                          <input
                            type="text"
                            placeholder="Optional"
                            value={row.remarks}
                            onChange={(e) => updateRow(row.key, { remarks: e.target.value })}
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="sub-btn ghost sm"
                            onClick={() => removeRow(row.key)}
                            disabled={rows.length === 1}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
              <button type="button" className="sub-btn ghost sm" onClick={addRow}>
                + Add Row
              </button>
              <button type="submit" className="sub-btn blue" disabled={submitting || !ready}>
                Encode {validRowCount > 0 ? validRowCount : ''} Availment
                {validRowCount === 1 ? '' : 's'}
              </button>
            </div>
          </form>
        )}
      </div>

      {log.length > 0 && (
        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>
            Just Encoded
          </div>
          <div className="table-wrap">
            <table className="ms-table">
              <thead>
                <tr>
                  <th>Transaction ID</th>
                  <th>Cadet</th>
                  <th>Batch</th>
                  <th>Privilege</th>
                  <th>Merit Cost</th>
                  <th>Availment Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {log.map((t) => (
                  <tr key={t.id}>
                    <td className="mono">{t.id}</td>
                    <td>
                      {t.cadetName}
                      {t.cadetId ? (
                        <div className="field-hint">{t.cadetId}</div>
                      ) : null}
                    </td>
                    <td>{t.batch || '—'}</td>
                    <td>{t.privilegeName}</td>
                    <td className="mono">{t.meritCost}</td>
                    <td>{formatDateShort(t.availmentDate)}</td>
                    <td>
                      <span className="badge b-pending">Pending</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AppShell>
  )
}
