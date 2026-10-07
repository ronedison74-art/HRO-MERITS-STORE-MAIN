import { useState } from 'react'
import { useToast } from '@/components/Toast'
import {
  savePrivilege,
  deletePrivilege,
  noConfirmationRuleLabel,
  type Privilege,
  type PrivilegeType,
} from '@/lib/meritStore'

interface Draft {
  name: string
  cost: string
  type: PrivilegeType
  unitLabel: string
  quotaLimit: string
  quotaPeriod: 'month' | 'semester'
  entryMax: string
}

const EMPTY: Draft = {
  name: '',
  cost: '',
  type: 'REGULAR',
  unitLabel: '',
  quotaLimit: '',
  quotaPeriod: 'month',
  entryMax: '',
}

function toDraft(p: Privilege): Draft {
  return {
    name: p.name,
    cost: String(p.cost),
    type: p.type,
    unitLabel: p.unitLabel,
    quotaLimit: p.quotaLimit == null ? '' : String(p.quotaLimit),
    quotaPeriod: p.quotaPeriod ?? 'month',
    entryMax: p.entryMax == null ? '' : String(p.entryMax),
  }
}

function quotaFields(d: Draft) {
  if (d.type !== 'ACCOUNTABILITY') {
    return { quotaLimit: null, quotaPeriod: null, entryMax: null }
  }
  const limit = d.quotaLimit.trim() === '' ? null : Number(d.quotaLimit)
  const max = d.entryMax.trim() === '' ? null : Number(d.entryMax)
  return {
    quotaLimit: limit,
    quotaPeriod: limit == null ? null : d.quotaPeriod,
    entryMax: max,
  }
}

function quotaSummary(p: Privilege): string {
  const parts: string[] = []
  if (p.quotaLimit != null && p.quotaPeriod) {
    parts.push(`${p.quotaLimit} per ${p.quotaPeriod === 'month' ? 'month' : 'semester'}`)
  }
  if (p.entryMax != null) parts.push(`${p.entryMax} per entry`)
  return parts.length ? parts.join(' · ') : '—'
}

function DraftFields({
  draft,
  onChange,
  idPrefix,
}: {
  draft: Draft
  onChange: (d: Draft) => void
  idPrefix: string
}) {
  return (
    <>
      <div className="field">
        <label htmlFor={`${idPrefix}-name`}>Name</label>
        <input
          id={`${idPrefix}-name`}
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          placeholder="e.g. Weekend Pass"
        />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-type`}>Type</label>
        <select
          id={`${idPrefix}-type`}
          value={draft.type}
          onChange={(e) => onChange({ ...draft, type: e.target.value as PrivilegeType })}
        >
          <option value="REGULAR">Regular (fixed cost)</option>
          <option value="ACCOUNTABILITY">Accountability (rate per unit)</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-cost`}>
          {draft.type === 'ACCOUNTABILITY' ? 'Rate (merits per unit)' : 'Merit cost'}
        </label>
        <input
          id={`${idPrefix}-cost`}
          type="number"
          min={0}
          step="any"
          value={draft.cost}
          onChange={(e) => onChange({ ...draft, cost: e.target.value })}
        />
      </div>
      {draft.type === 'ACCOUNTABILITY' && (
        <>
          <div className="field">
            <label htmlFor={`${idPrefix}-unit`}>Quantity label</label>
            <input
              id={`${idPrefix}-unit`}
              value={draft.unitLabel}
              onChange={(e) => onChange({ ...draft, unitLabel: e.target.value })}
              placeholder="e.g. ED Hours to Reduce"
            />
          </div>
          <div className="field">
            <label htmlFor={`${idPrefix}-quota`}>Quota per cadet (units)</label>
            <input
              id={`${idPrefix}-quota`}
              type="number"
              min={0}
              step="any"
              value={draft.quotaLimit}
              onChange={(e) => onChange({ ...draft, quotaLimit: e.target.value })}
              placeholder="Blank = no quota"
            />
          </div>
          <div className="field">
            <label htmlFor={`${idPrefix}-period`}>Quota period</label>
            <select
              id={`${idPrefix}-period`}
              value={draft.quotaPeriod}
              disabled={draft.quotaLimit.trim() === ''}
              onChange={(e) =>
                onChange({ ...draft, quotaPeriod: e.target.value as 'month' | 'semester' })
              }
            >
              <option value="month">Per calendar month</option>
              <option value="semester">Per semester</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${idPrefix}-entrymax`}>Usual max per entry</label>
            <input
              id={`${idPrefix}-entrymax`}
              type="number"
              min={0}
              step="any"
              value={draft.entryMax}
              onChange={(e) => onChange({ ...draft, entryMax: e.target.value })}
              placeholder="Blank = none"
            />
          </div>
        </>
      )}
    </>
  )
}

/** Admin: add, edit, disable/enable and delete privileges. */
export function PrivilegeManager({ privileges, ready }: { privileges: Privilege[]; ready: boolean }) {
  const { show } = useToast()
  const [adding, setAdding] = useState<Draft>(EMPTY)
  const [editId, setEditId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY)
  const [busy, setBusy] = useState(false)

  function validate(d: Draft): number | null {
    if (!d.name.trim()) {
      show('Enter a privilege name.', 'bad')
      return null
    }
    const cost = Number(d.cost)
    if (d.cost.trim() === '' || !Number.isFinite(cost) || cost < 0) {
      show('Enter a valid merit cost / rate (0 or more).', 'bad')
      return null
    }
    if (d.type === 'ACCOUNTABILITY') {
      const q = d.quotaLimit.trim() === '' ? 0 : Number(d.quotaLimit)
      const m = d.entryMax.trim() === '' ? 1 : Number(d.entryMax)
      if (!Number.isFinite(q) || q < 0) {
        show('The quota must be 0 or more (or leave it blank for no quota).', 'bad')
        return null
      }
      if (!Number.isFinite(m) || m <= 0) {
        show('"Usual max per entry" must be more than 0 (or leave it blank).', 'bad')
        return null
      }
    }
    return cost
  }

  async function run(fn: () => Promise<void>, failMsg: string) {
    setBusy(true)
    try {
      await fn()
    } catch (e: any) {
      show(e?.message || failMsg, 'bad')
    } finally {
      setBusy(false)
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const cost = validate(adding)
    if (cost === null) return
    await run(async () => {
      const p = await savePrivilege({
        name: adding.name,
        cost,
        type: adding.type,
        unitLabel: adding.unitLabel,
        ...quotaFields(adding),
      })
      show(`"${p.name}" added.`, 'ok')
      setAdding(EMPTY)
    }, 'Could not add the privilege.')
  }

  async function handleSaveEdit(p: Privilege) {
    const cost = validate(editDraft)
    if (cost === null) return
    await run(async () => {
      await savePrivilege({
        id: p.id,
        name: editDraft.name,
        cost,
        type: editDraft.type,
        unitLabel: editDraft.unitLabel,
        ...quotaFields(editDraft),
      })
      show(`"${editDraft.name.trim()}" updated.`, 'ok')
      setEditId(null)
    }, 'Could not save the privilege.')
  }

  async function handleToggle(p: Privilege) {
    await run(async () => {
      await savePrivilege({
        id: p.id,
        name: p.name,
        cost: p.cost,
        type: p.type,
        unitLabel: p.unitLabel,
        quotaLimit: p.quotaLimit,
        quotaPeriod: p.quotaPeriod,
        entryMax: p.entryMax,
        active: !p.active,
      })
      show(p.active ? `"${p.name}" disabled.` : `"${p.name}" enabled.`, 'ok')
    }, 'Could not change the privilege.')
  }

  async function handleDelete(p: Privilege) {
    if (!window.confirm(`Delete "${p.name}"? This can't be undone.`)) return
    await run(async () => {
      await deletePrivilege(p.id)
      show(`"${p.name}" deleted.`, 'ok')
      if (editId === p.id) setEditId(null)
    }, 'Could not delete the privilege.')
  }

  return (
    <div className="card">
      <div className="card-title" style={{ marginBottom: 4 }}>
        Privileges
      </div>
      <div className="field-hint" style={{ marginBottom: 16 }}>
        <strong>Regular</strong> = fixed merit cost. <strong>Accountability</strong> = rate (merits per
        unit). Changing a name, cost or type only affects <em>new</em> entries — existing records,
        including ones still Pending, keep what they were encoded with. A privilege that was ever used
        can't be deleted; disable it instead (it disappears from Encode but history stays).
      </div>

      <form onSubmit={handleAdd} className="form-grid" style={{ alignItems: 'end', marginBottom: 20 }}>
        <DraftFields draft={adding} onChange={setAdding} idPrefix="newpriv" />
        <div>
          <button type="submit" className="sub-btn blue" disabled={busy || !ready}>
            Add privilege
          </button>
        </div>
      </form>

      <div className="table-wrap">
        <table className="ms-table">
          <thead>
            <tr>
              <th>Privilege</th>
              <th>Cost / Rate</th>
              <th>Type</th>
              <th>Quota (warns only)</th>
              <th>No Confirmation Rule</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {privileges.map((p) => {
              if (editId === p.id) {
                return (
                  <tr key={p.id}>
                    <td colSpan={7}>
                      <div className="form-grid" style={{ alignItems: 'end' }}>
                        <DraftFields draft={editDraft} onChange={setEditDraft} idPrefix={`edit-${p.id}`} />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            type="button"
                            className="sub-btn blue sm"
                            disabled={busy}
                            onClick={() => void handleSaveEdit(p)}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="sub-btn ghost sm"
                            disabled={busy}
                            onClick={() => setEditId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )
              }
              return (
                <tr key={p.id} style={p.active ? undefined : { opacity: 0.55 }}>
                  <td>{p.name}</td>
                  <td>
                    {p.cost}
                    <div className="field-hint">
                      {p.type === 'ACCOUNTABILITY'
                        ? `per ${p.unitLabel || 'unit'}`
                        : 'fixed cost'}
                    </div>
                  </td>
                  <td>{p.type === 'REGULAR' ? 'Regular' : 'Accountability'}</td>
                  <td>{p.type === 'ACCOUNTABILITY' ? quotaSummary(p) : '—'}</td>
                  <td>{noConfirmationRuleLabel(p.type)}</td>
                  <td>{p.active ? 'Active' : 'Disabled'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="sub-btn blue sm"
                        disabled={busy}
                        onClick={() => {
                          setEditId(p.id)
                          setEditDraft(toDraft(p))
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="sub-btn ghost sm"
                        disabled={busy}
                        onClick={() => void handleToggle(p)}
                      >
                        {p.active ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        type="button"
                        className="sub-btn red sm"
                        disabled={busy}
                        onClick={() => void handleDelete(p)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!ready && <div className="ms-empty">Loading configuration…</div>}
      </div>
    </div>
  )
}
