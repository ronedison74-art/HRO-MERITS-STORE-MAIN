import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { AppShell } from '@/components/AppShell'
import { useToast } from '@/components/Toast'
import { useMeritStore } from '@/lib/useMeritStore'
import { useAuth } from '@/lib/auth'
import { PrivilegeManager } from '@/components/PrivilegeManager'
import { listUsers, saveUser, type MsUser } from '@/lib/msClient'
import {
  addCadet,
  updateCadet,
  deleteCadet,
  syncCadetsFromFleet,
  importCadetsBulk,
  BATCHES,
  DEFAULT_AVAILABLE_MERITS,
  type Cadet,
  type CadetImportRow,
} from '@/lib/meritStore'

export const Route = createFileRoute('/admin')({
  component: Admin,
})

const PAGE_SIZE = 20

function Admin() {
  const { privileges, cadets, ready } = useMeritStore()
  const { show } = useToast()
  const { email: myEmail } = useAuth()

  // Users & roles
  const [users, setUsers] = useState<MsUser[] | null>(null)
  const [usersError, setUsersError] = useState('')
  const [newUserEmail, setNewUserEmail] = useState('')
  const [newUserRole, setNewUserRole] = useState<'admin' | 'encoder'>('encoder')
  const [userBusy, setUserBusy] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const [newName, setNewName] = useState('')
  const [newBatch, setNewBatch] = useState<string>(BATCHES[0])
  const [newMerits, setNewMerits] = useState(String(DEFAULT_AVAILABLE_MERITS))
  const [cadetSearch, setCadetSearch] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editBatch, setEditBatch] = useState('')
  const [editMerits, setEditMerits] = useState('')

  /** Which batch panel is expanded; only one at a time keeps scrolling short. */
  const [openBatch, setOpenBatch] = useState<string>(BATCHES[0])
  /** Page index per batch key */
  const [pageByBatch, setPageByBatch] = useState<Record<string, number>>({})

  const fileRef = useRef<HTMLInputElement>(null)
  const [importDefaultBatch, setImportDefaultBatch] = useState<string>(BATCHES[0])
  const [importing, setImporting] = useState(false)

  async function handleAddCadet(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) {
      show('Enter a cadet name.', 'bad')
      return
    }
    const merits = Number(newMerits)
    if (Number.isNaN(merits) || merits < 0) {
      show('Enter a valid available merits amount.', 'bad')
      return
    }
    try {
      const c = await addCadet(newName, newBatch, merits)
      show(`${c.name} added to ${c.batch} with ${c.availableMerits} merits.`, 'ok')
      setNewName('')
      setNewMerits(String(DEFAULT_AVAILABLE_MERITS))
      setOpenBatch(c.batch)
    } catch (e: any) {
      show(e?.message || 'Could not add the cadet.', 'bad')
    }
  }

  function startEdit(c: Cadet) {
    setEditId(c.id)
    setEditName(c.name)
    setEditBatch(c.batch)
    setEditMerits(String(c.availableMerits))
  }

  async function saveEdit() {
    if (!editId) return
    if (!editName.trim()) {
      show('Name cannot be empty.', 'bad')
      return
    }
    const merits = Number(editMerits)
    if (Number.isNaN(merits) || merits < 0) {
      show('Enter a valid available merits amount.', 'bad')
      return
    }
    try {
      await updateCadet(editId, {
        name: editName,
        batch: editBatch,
        availableMerits: merits,
      })
      show('Cadet updated.', 'ok')
      setEditId(null)
    } catch (e: any) {
      show(e?.message || 'Could not update the cadet.', 'bad')
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Remove ${name} from the roster?`)) return
    try {
      await deleteCadet(id)
      show(`${name} removed.`, 'ok')
      if (editId === id) setEditId(null)
    } catch (e: any) {
      show(e?.message || 'Could not remove the cadet.', 'bad')
    }
  }

  async function loadUsers() {
    try {
      setUsers(await listUsers())
      setUsersError('')
    } catch (e: any) {
      setUsersError(e?.message || 'Could not load users.')
    }
  }

  useEffect(() => {
    void loadUsers()
  }, [])

  async function handleSaveUser(email: string, role: 'admin' | 'encoder', active: boolean) {
    setUserBusy(true)
    try {
      await saveUser({ email, role, active })
      await loadUsers()
      show('User saved.', 'ok')
      return true
    } catch (e: any) {
      show(e?.message || 'Could not save the user.', 'bad')
      return false
    } finally {
      setUserBusy(false)
    }
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault()
    const email = newUserEmail.trim().toLowerCase()
    if (!email) return
    if (await handleSaveUser(email, newUserRole, true)) setNewUserEmail('')
  }

  const filtered = useMemo(() => {
    const q = cadetSearch.trim().toLowerCase()
    if (!q) return cadets
    return cadets.filter((c) => `${c.id} ${c.name} ${c.batch}`.toLowerCase().includes(q))
  }, [cadets, cadetSearch])

  const grouped = useMemo(() => {
    const map: Record<string, Cadet[]> = {}
    for (const b of BATCHES) map[b] = []
    for (const c of filtered) {
      const key = BATCHES.includes(c.batch as (typeof BATCHES)[number])
        ? c.batch
        : c.batch || 'Other'
      if (!map[key]) map[key] = []
      map[key].push(c)
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => a.name.localeCompare(b.name))
    }
    return map
  }, [filtered])

  const batchKeys = useMemo(() => {
    const extra = Object.keys(grouped).filter((k) => !(BATCHES as readonly string[]).includes(k))
    return [...BATCHES, ...extra.sort()]
  }, [grouped])

  function pageFor(batchKey: string) {
    return pageByBatch[batchKey] ?? 0
  }

  function setPage(batchKey: string, page: number) {
    setPageByBatch((prev) => ({ ...prev, [batchKey]: page }))
  }

  function parseWorkbook(file: ArrayBuffer): CadetImportRow[] {
    const wb = XLSX.read(file, { type: 'array' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
    const rows: CadetImportRow[] = []
    for (const raw of json) {
      const keys = Object.keys(raw)
      const lower: Record<string, unknown> = {}
      for (const k of keys) lower[k.trim().toLowerCase()] = raw[k]

      const name = String(
        lower['name'] ??
          lower['cadet'] ??
          lower['cadet name'] ??
          lower['full name'] ??
          lower['student'] ??
          '',
      ).trim()
      if (!name) continue

      const batchRaw = String(
        lower['batch'] ?? lower['year'] ?? lower['section'] ?? '',
      ).trim()
      const meritsRaw = lower['availablemerits'] ?? lower['available merits'] ?? lower['merits']
      let availableMerits: number | undefined
      if (meritsRaw !== undefined && meritsRaw !== '') {
        const n = Number(meritsRaw)
        if (!Number.isNaN(n)) availableMerits = n
      }

      rows.push({
        name,
        batch: batchRaw || importDefaultBatch,
        availableMerits,
      })
    }
    return rows
  }

  async function handleFile(file: File) {
    setImporting(true)
    try {
      const buf = await file.arrayBuffer()
      const rows = parseWorkbook(buf)
      if (rows.length === 0) {
        show('No cadet rows found. Use columns: Name, Batch (optional), Merits (optional).', 'bad')
        return
      }
      const { added, skipped } = await importCadetsBulk(rows, { skipDuplicates: true })
      show(
        `Import done: ${added} added, ${skipped} skipped (blank or duplicate).`,
        added > 0 ? 'ok' : 'bad',
      )
      if (rows[0]?.batch) setOpenBatch(rows[0].batch)
    } catch (e: any) {
      show(e?.message || 'Failed to read file.', 'bad')
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Name', 'Batch', 'Merits'],
      ['DELA CRUZ, JUAN', '2026', 100],
      ['SANTOS, MARIA', '2026', 100],
      ['REYES, PEDRO', '2025', 80],
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Cadets')
    XLSX.writeFile(wb, 'cadet-roster-template.xlsx')
  }

  return (
    <AppShell
      title="Admin"
      adminOnly
      subtitle="Cadet roster (organized by batch), privilege configuration, and user access."
    >
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-title" style={{ marginBottom: 4 }}>
          Cadet Roster
        </div>
        <div className="field-hint" style={{ marginBottom: 12 }}>
          Cadets are grouped by year (<strong>2024</strong> / <strong>2025</strong> /{' '}
          <strong>2026</strong>). Open one batch at a time; lists are paginated. Use Excel/CSV
          upload to add many names at once.
        </div>

        <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            className="sub-btn blue"
            disabled={syncing}
            onClick={async () => {
              setSyncing(true)
              try {
                const { count } = await syncCadetsFromFleet()
                show(`Synced ${count} cadets from Fleet Merits.`, 'ok')
              } catch (e: any) {
                show(e?.message || 'Sync failed.', 'bad')
              } finally {
                setSyncing(false)
              }
            }}
          >
            {syncing ? 'Syncing…' : '↻ Sync from Fleet Merits'}
          </button>
          <span className="field-hint">
            Loads live cadets + balances. Total local roster: {cadets.length}
          </span>
        </div>

        {/* Excel import */}
        <div
          className="card"
          style={{
            marginBottom: 20,
            background: 'var(--sur2)',
            padding: 14,
          }}
        >
          <div className="card-title" style={{ fontSize: 14, marginBottom: 8 }}>
            Upload Excel / CSV list
          </div>
          <div className="field-hint" style={{ marginBottom: 10 }}>
            Columns: <strong>Name</strong> (required), <strong>Batch</strong> (optional — uses
            default below), <strong>Merits</strong> (optional, default {DEFAULT_AVAILABLE_MERITS}).
            Supports <code>.xlsx</code>, <code>.xls</code>, <code>.csv</code>. Duplicates (same
            name) are skipped.
          </div>
          <div className="form-grid" style={{ alignItems: 'end', marginBottom: 10 }}>
            <div className="field">
              <label>Default batch if column empty</label>
              <select
                value={importDefaultBatch}
                onChange={(e) => setImportDefaultBatch(e.target.value)}
              >
                {BATCHES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="sub-btn ghost sm" onClick={downloadTemplate}>
                Download template
              </button>
              <button
                type="button"
                className="sub-btn blue sm"
                disabled={importing}
                onClick={() => fileRef.current?.click()}
              >
                {importing ? 'Importing…' : 'Upload file'}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void handleFile(f)
                }}
              />
            </div>
          </div>
        </div>

        {/* Single add */}
        <form onSubmit={handleAddCadet} style={{ marginBottom: 20 }}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="newCadetName">Name</label>
              <input
                id="newCadetName"
                type="text"
                placeholder="Juan Dela Cruz"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="newCadetBatch">Batch</label>
              <select
                id="newCadetBatch"
                value={newBatch}
                onChange={(e) => setNewBatch(e.target.value)}
              >
                {BATCHES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="newCadetMerits">Available Merits</label>
              <input
                id="newCadetMerits"
                type="number"
                min={0}
                value={newMerits}
                onChange={(e) => setNewMerits(e.target.value)}
              />
            </div>
          </div>
          <button type="submit" className="sub-btn blue" style={{ marginTop: 12 }}>
            + Add Cadet
          </button>
        </form>

        <div
          style={{
            display: 'flex',
            gap: 12,
            alignItems: 'end',
            marginBottom: 12,
            flexWrap: 'wrap',
          }}
        >
          <div className="field" style={{ flex: 1, minWidth: 200 }}>
            <label htmlFor="cadetListSearch">Search roster</label>
            <input
              id="cadetListSearch"
              type="search"
              placeholder="Name, ID, or batch…"
              value={cadetSearch}
              onChange={(e) => {
                setCadetSearch(e.target.value)
                setPageByBatch({})
              }}
            />
          </div>
          <div className="field-hint" style={{ paddingBottom: 8 }}>
            {filtered.length} of {cadets.length} shown
          </div>
        </div>

        {/* Batch tabs */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            marginBottom: 12,
          }}
        >
          {batchKeys.map((batchName) => {
            const count = (grouped[batchName] ?? []).length
            const active = openBatch === batchName
            return (
              <button
                key={batchName}
                type="button"
                className={`sub-btn sm ${active ? 'blue' : 'ghost'}`}
                onClick={() => setOpenBatch(batchName)}
              >
                {batchName} ({count})
              </button>
            )
          })}
        </div>

        {cadets.length === 0 && (
          <div className="ms-empty">
            No cadets yet. Upload an Excel list or Sync from Fleet Merits.
          </div>
        )}

        {cadets.length > 0 && filtered.length === 0 && (
          <div className="ms-empty">No cadets match “{cadetSearch}”.</div>
        )}

        {batchKeys.map((batchName) => {
          if (openBatch !== batchName) return null
          const list = grouped[batchName] ?? []
          const page = pageFor(batchName)
          const pageCount = Math.max(1, Math.ceil(list.length / PAGE_SIZE))
          const safePage = Math.min(page, pageCount - 1)
          const slice = list.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

          return (
            <div key={batchName}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  marginBottom: 8,
                }}
              >
                <div className="card-title" style={{ fontSize: 15 }}>
                  {batchName}
                </div>
                <div className="field-hint">
                  {list.length} cadet{list.length === 1 ? '' : 's'}
                  {list.length > PAGE_SIZE && (
                    <>
                      {' '}
                      · page {safePage + 1} / {pageCount}
                    </>
                  )}
                </div>
              </div>

              {list.length === 0 ? (
                <div className="ms-empty" style={{ padding: 12 }}>
                  No cadets in this batch{cadetSearch ? ' for this search' : ''}.
                </div>
              ) : (
                <>
                  <div className="table-wrap">
                    <table className="ms-table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Name</th>
                          <th>Available Merits</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {slice.map((c) => (
                          <tr key={c.id}>
                            <td className="mono">{c.id}</td>
                            <td>
                              {editId === c.id ? (
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                  <input
                                    type="text"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    style={{ minWidth: 120 }}
                                  />
                                  <select
                                    value={editBatch}
                                    onChange={(e) => setEditBatch(e.target.value)}
                                  >
                                    {BATCHES.map((b) => (
                                      <option key={b} value={b}>
                                        {b}
                                      </option>
                                    ))}
                                    {!(BATCHES as readonly string[]).includes(editBatch) &&
                                      editBatch && (
                                        <option value={editBatch}>{editBatch}</option>
                                      )}
                                  </select>
                                </div>
                              ) : (
                                c.name
                              )}
                            </td>
                            <td>
                              {editId === c.id ? (
                                <input
                                  type="number"
                                  min={0}
                                  value={editMerits}
                                  onChange={(e) => setEditMerits(e.target.value)}
                                  style={{ maxWidth: 100 }}
                                />
                              ) : (
                                <span className="mono">{c.availableMerits}</span>
                              )}
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              {editId === c.id ? (
                                <>
                                  <button
                                    type="button"
                                    className="sub-btn blue sm"
                                    onClick={saveEdit}
                                  >
                                    Save
                                  </button>{' '}
                                  <button
                                    type="button"
                                    className="sub-btn ghost sm"
                                    onClick={() => setEditId(null)}
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className="sub-btn ghost sm"
                                    onClick={() => startEdit(c)}
                                  >
                                    Edit
                                  </button>{' '}
                                  <button
                                    type="button"
                                    className="sub-btn red sm"
                                    onClick={() => handleDelete(c.id, c.name)}
                                  >
                                    Delete
                                  </button>
                                </>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {pageCount > 1 && (
                    <div
                      style={{
                        display: 'flex',
                        gap: 8,
                        justifyContent: 'center',
                        marginTop: 12,
                        flexWrap: 'wrap',
                      }}
                    >
                      <button
                        type="button"
                        className="sub-btn ghost sm"
                        disabled={safePage <= 0}
                        onClick={() => setPage(batchName, safePage - 1)}
                      >
                        ← Prev
                      </button>
                      <span className="field-hint" style={{ paddingTop: 6 }}>
                        {safePage + 1} / {pageCount}
                      </span>
                      <button
                        type="button"
                        className="sub-btn ghost sm"
                        disabled={safePage >= pageCount - 1}
                        onClick={() => setPage(batchName, safePage + 1)}
                      >
                        Next →
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>

      <PrivilegeManager privileges={privileges} ready={ready} />

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-title" style={{ marginBottom: 4 }}>
          Users &amp; Roles
        </div>
        <div className="field-hint" style={{ marginBottom: 12 }}>
          Only emails listed here can sign in (via a one-time email link).{' '}
          <strong>Admin</strong>: everything. <strong>Encoder</strong>: Encode, Confirm, Records and
          Reports — no Admin page and no removing records.
        </div>

        <form
          onSubmit={handleAddUser}
          className="form-grid"
          style={{ alignItems: 'end', marginBottom: 16 }}
        >
          <div className="field">
            <label htmlFor="newUserEmail">Email</label>
            <input
              id="newUserEmail"
              type="email"
              required
              value={newUserEmail}
              onChange={(e) => setNewUserEmail(e.target.value)}
              placeholder="name@example.com"
            />
          </div>
          <div className="field">
            <label htmlFor="newUserRole">Role</label>
            <select
              id="newUserRole"
              value={newUserRole}
              onChange={(e) => setNewUserRole(e.target.value as 'admin' | 'encoder')}
            >
              <option value="encoder">Encoder</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div>
            <button type="submit" className="sub-btn blue" disabled={userBusy || !newUserEmail.trim()}>
              Add / update user
            </button>
          </div>
        </form>

        {usersError && (
          <p role="alert" style={{ color: 'var(--red, #c0392b)' }}>
            {usersError}
          </p>
        )}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(users ?? []).map((u) => {
                const isMe = u.email === myEmail
                return (
                  <tr key={u.email}>
                    <td>
                      {u.email}
                      {isMe && <span className="field-hint"> (you)</span>}
                    </td>
                    <td>
                      <select
                        value={u.role}
                        disabled={userBusy || isMe}
                        onChange={(e) =>
                          void handleSaveUser(u.email, e.target.value as 'admin' | 'encoder', u.active)
                        }
                      >
                        <option value="encoder">Encoder</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td>{u.active ? 'Active' : 'Disabled'}</td>
                    <td>
                      <button
                        type="button"
                        className={`sub-btn sm ${u.active ? 'red' : 'blue'}`}
                        disabled={userBusy || isMe}
                        onClick={() => void handleSaveUser(u.email, u.role, !u.active)}
                      >
                        {u.active ? 'Disable' : 'Enable'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {users === null && !usersError && <div className="ms-empty">Loading users…</div>}
        </div>
      </div>
    </AppShell>
  )
}
