import * as ms from './msClient'
import {
  type PrivilegeType,
  type TransactionStatus,
  type ConfirmOutcome,
} from './rules'

// Merit Store data layer.
//
// Source of truth: Supabase (via authenticated server functions). The browser only
// keeps an in-memory copy for fast rendering. There is deliberately NO localStorage
// fallback: if the database can't be reached, writes fail loudly instead of
// silently piling up on one device.

export type { PrivilegeType, TransactionStatus, ConfirmOutcome }

export interface Privilege {
  id: string
  name: string
  /**
   * REGULAR: fixed merit cost of the privilege.
   * ACCOUNTABILITY: rate — merits charged per unit (ED hour or demerit).
   * Both are editable on the Admin page and shown on Encode.
   */
  cost: number
  type: PrivilegeType
  /** Disabled privileges are hidden on Encode; history keeps working. */
  active: boolean
  /** Accountability only: what the quantity is called (e.g. "ED Hours to Reduce"). */
  unitLabel: string
}

/** Batches match Fleet Merits live data (year cohorts). */
export const BATCHES = ['2024', '2025', '2026'] as const
export type BatchName = (typeof BATCHES)[number]

export interface Cadet {
  id: string
  name: string
  batch: BatchName | string
  /** Current available merits balance. Deducted automatically on confirmation. */
  availableMerits: number
}

export interface Transaction {
  id: string
  cadetId: string
  cadetName: string
  batch: string
  privilegeId: string
  privilegeName: string
  privilegeType: PrivilegeType
  meritCost: number
  availmentDate: string
  confirmationDate: string | null
  status: TransactionStatus
  meritsDeducted: number
  violation: boolean
  processedBy: string
  remarks: string
  createdAt: string
  /** For accountability privileges: the raw ED hours / demerits count. Total merits = quantity × rate. */
  quantity?: number
}

/** Default rate used when seeding accountability privileges (merits per unit). */
export const ACCOUNTABILITY_MERIT_RATIO = 2

/** Default starting merits for a new cadet. */
export const DEFAULT_AVAILABLE_MERITS = 100

export function accountabilityQuantityLabel(privilegeId: string): string {
  const p = _privileges.find((x) => x.id === privilegeId)
  if (p?.unitLabel) return p.unitLabel
  if (privilegeId === 'reduce-ed') return 'ED Hours to Reduce'
  if (privilegeId === 'offset-demerits') return 'Demerits to Offset'
  return 'Quantity'
}

export function noConfirmationRuleLabel(type: PrivilegeType): string {
  return type === 'REGULAR' ? 'Cancel — No Deduction' : 'Deduct + Violation'
}

const isBrowser = typeof window !== 'undefined'

// ── In-memory state + pub/sub ───────────────────────────────────────────────

let _privileges: Privilege[] = []
let _cadets: Cadet[] = []
let _transactions: Transaction[] = []
let _hydrated = false
let _backend = false // true while the last fetch from Supabase succeeded
let _lastError = ''
/** Bumped on every local change so a slow poll can't overwrite newer data. */
let _version = 0

type Listener = () => void
const listeners = new Set<Listener>()

function notify() {
  listeners.forEach((l) => l())
}

function mutated() {
  _version++
  notify()
}

export function subscribe(l: Listener) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function isSharedBackendActive(): boolean {
  return _backend
}

export function getStoreError(): string {
  return _lastError
}

export function isHydrated(): boolean {
  return _hydrated
}

// ── Loading + polling ───────────────────────────────────────────────────────

const POLL_MS = 15000
let _timer: number | null = null
let _hydrating: Promise<{ backend: boolean }> | null = null

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function sortTransactions(list: Transaction[]): Transaction[] {
  return [...list].sort(
    (a, b) =>
      (b.createdAt || '').localeCompare(a.createdAt || '') || b.id.localeCompare(a.id),
  )
}

async function refreshFromBackend(): Promise<boolean> {
  const startedAt = _version
  try {
    const data = await ms.fetchAll()
    if (_version !== startedAt) {
      // A local write landed while we were fetching → this snapshot may be stale.
      _backend = true
      return false
    }
    _privileges = data.privileges
    _cadets = data.cadets
    _transactions = sortTransactions(data.transactions)
    _backend = true
    _lastError = ''
    _hydrated = true
    notify()
    return true
  } catch (e) {
    _backend = false
    _lastError = errMsg(e)
    notify()
    return false
  }
}

function startPolling() {
  if (!isBrowser || _timer !== null) return
  _timer = window.setInterval(() => {
    if (document.hidden) return
    void refreshFromBackend()
  }, POLL_MS)
  document.addEventListener('visibilitychange', onVisible)
}

function onVisible() {
  if (!document.hidden) void refreshFromBackend()
}

/** Load everything from Supabase (once) and keep it fresh. Safe to call repeatedly. */
export function hydrateStore(): Promise<{ backend: boolean }> {
  if (!isBrowser) return Promise.resolve({ backend: false })
  if (_hydrated && _timer !== null) return Promise.resolve({ backend: _backend })
  if (_hydrating) return _hydrating

  _hydrating = (async () => {
    const ok = await refreshFromBackend()
    if (!ok && !_hydrated) {
      // First load failed: leave _hydrated=false so the UI shows the error and retries.
      startPolling()
      return { backend: false }
    }
    _hydrated = true
    startPolling()
    notify()
    return { backend: _backend }
  })().finally(() => {
    _hydrating = null
  })
  return _hydrating
}

/** Called on sign-out: forget everything and stop polling. */
export function resetStore() {
  if (_timer !== null) {
    window.clearInterval(_timer)
    _timer = null
    document.removeEventListener('visibilitychange', onVisible)
  }
  _privileges = []
  _cadets = []
  _transactions = []
  _hydrated = false
  _backend = false
  _lastError = ''
  _version++
  notify()
}

// ── Sync loaders (read from memory) ─────────────────────────────────────────

export const loadPrivileges = (): Privilege[] => _privileges
export const loadCadets = (): Cadet[] => _cadets
export const loadTransactions = (): Transaction[] => _transactions

function upsertLocalCadet(c: Cadet) {
  const i = _cadets.findIndex((x) => x.id === c.id)
  _cadets =
    i >= 0 ? _cadets.map((x) => (x.id === c.id ? c : x)) : [c, ..._cadets]
}

function setLocalBalance(cadetId: string, balance: number | null) {
  if (!cadetId || balance == null) return
  _cadets = _cadets.map((c) =>
    c.id === cadetId ? { ...c, availableMerits: balance } : c,
  )
}

// ── Privileges (admin) ──────────────────────────────────────────────────────

export async function savePrivilege(input: {
  id?: string
  name: string
  cost: number
  type: PrivilegeType
  unitLabel?: string
  active?: boolean
}): Promise<Privilege> {
  const saved = await ms.savePrivilegeRemote(input)
  _privileges = input.id
    ? _privileges.map((p) => (p.id === saved.id ? saved : p))
    : [..._privileges, saved]
  _privileges = [..._privileges].sort((a, b) => a.name.localeCompare(b.name))
  mutated()
  return saved
}

export async function deletePrivilege(id: string): Promise<void> {
  await ms.deletePrivilegeRemote(id)
  _privileges = _privileges.filter((p) => p.id !== id)
  mutated()
}

// ── Cadets (admin) ──────────────────────────────────────────────────────────

export async function addCadet(
  name: string,
  batch: string,
  availableMerits: number = DEFAULT_AVAILABLE_MERITS,
): Promise<Cadet> {
  const cadet = await ms.addCadetRemote({
    name,
    batch: batch.trim() || BATCHES[0],
    availableMerits: Math.max(0, availableMerits),
  })
  upsertLocalCadet(cadet)
  mutated()
  return cadet
}

export async function updateCadet(
  id: string,
  patch: Partial<Pick<Cadet, 'name' | 'batch' | 'availableMerits'>>,
): Promise<Cadet | null> {
  const current = _cadets.find((c) => c.id === id)
  if (!current) return null
  const saved = await ms.updateCadetRemote({
    id,
    name: patch.name !== undefined ? patch.name : current.name,
    batch: patch.batch !== undefined ? patch.batch : current.batch,
    availableMerits:
      patch.availableMerits !== undefined
        ? Math.max(0, patch.availableMerits)
        : current.availableMerits,
  })
  upsertLocalCadet(saved)
  mutated()
  return saved
}

export async function deleteCadet(id: string): Promise<Cadet[]> {
  await ms.deleteCadetRemote(id)
  _cadets = _cadets.filter((c) => c.id !== id)
  mutated()
  return _cadets
}

export type CadetImportRow = {
  name: string
  batch: string
  availableMerits?: number
}

/** Bulk-add cadets from Excel/CSV rows. Skips blank names and (optionally) duplicate names. */
export async function importCadetsBulk(
  rows: CadetImportRow[],
  options?: { skipDuplicates?: boolean },
): Promise<{ added: number; skipped: number }> {
  const res = await ms.importCadetsRemote({
    rows,
    skipDuplicates: options?.skipDuplicates !== false,
    defaultMerits: DEFAULT_AVAILABLE_MERITS,
    defaultBatch: BATCHES[0],
  })
  _cadets = [...res.cadets, ..._cadets]
  mutated()
  return { added: res.added, skipped: res.skipped }
}

/** Pull cadets + live balances from Fleet Merits (browser → Fleet Supabase), then save to our roster. */
export async function syncCadetsFromFleet(): Promise<{ count: number }> {
  const { fetchFleetCadets, fetchFleetBalances } = await import('./fleetClient')

  const [rows, balances] = await Promise.all([fetchFleetCadets(), fetchFleetBalances()])

  const mapped = rows.map((r) => ({
    id: String(r.id),
    name: r.name,
    batch: r.batch != null ? String(r.batch) : BATCHES[0],
    availableMerits: balances.get(r.name) ?? 0,
  }))

  const res = await ms.syncCadetsRemote(mapped)
  _cadets = res.cadets
  mutated()
  return { count: res.count }
}

/**
 * After a confirmation that deducts, also push an "availed" row to Fleet Merits
 * so the live ledger stays in sync (same shape as Encode → Availed on fleethro).
 */
export async function pushDeductionToFleet(input: {
  cadetName: string
  points: number
  reason: string
  operator: string
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const { pushFleetAvailed } = await import('./fleetClient')
    const res = await pushFleetAvailed(input)
    return res.ok ? { ok: true } : { ok: false, error: res.error }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) }
  }
}

export function searchCadets(query: string, limit = 20): Cadet[] {
  const q = query.trim().toLowerCase()
  const all = loadCadets()
  if (!q) return all.slice(0, limit)
  return all
    .filter((c) => `${c.id} ${c.name} ${c.batch}`.toLowerCase().includes(q))
    .slice(0, limit)
}

export function cadetsByBatch(): Record<string, Cadet[]> {
  const groups: Record<string, Cadet[]> = {}
  for (const b of BATCHES) groups[b] = []
  for (const c of loadCadets()) {
    const key = BATCHES.includes(c.batch as BatchName) ? c.batch : c.batch || 'Other'
    if (!groups[key]) groups[key] = []
    groups[key].push(c)
  }
  return groups
}

// ── Transactions ────────────────────────────────────────────────────────────

export type AvailmentInput = {
  cadetName: string
  cadetId?: string
  batch?: string
  privilegeId: string
  /** ED hours / demerits (accountability privileges only). */
  quantity?: number
  remarks: string
}

/**
 * Day 1: record availments as Pending. The server computes the merit cost from
 * the Admin-set privilege cost — it cannot be overridden from the browser.
 */
export async function createAvailments(
  inputs: AvailmentInput[],
  common: { availmentDate: string; processedBy?: string },
): Promise<Transaction[]> {
  const created = await ms.createAvailments({
    items: inputs.map((i) => ({
      cadetName: i.cadetName,
      cadetId: i.cadetId,
      batch: i.batch,
      privilegeId: i.privilegeId,
      quantity: i.quantity,
      remarks: i.remarks,
    })),
    availmentDate: common.availmentDate,
    processedBy: common.processedBy,
  })
  _transactions = sortTransactions([...created, ..._transactions])
  mutated()
  return created
}

export async function createAvailment(
  input: AvailmentInput & { availmentDate: string; processedBy?: string },
): Promise<Transaction> {
  const [txn] = await createAvailments([input], {
    availmentDate: input.availmentDate,
    processedBy: input.processedBy,
  })
  return txn
}

/**
 * Day 2. Rules (enforced on the server):
 * - granted      → Confirmed + deduct (both types)
 * - not-granted  → Regular: Cancelled (no deduct)
 *                  Accountability: Not Confirmed + deduct + violation
 * - invalid      → Invalid — no deduction, no availment
 * Then the deduction is mirrored to Fleet Merits from the browser.
 */
export async function resolveConfirmation(
  id: string,
  outcome: ConfirmOutcome,
  confirmationDate: string,
): Promise<{
  transactions: Transaction[]
  fleetSynced: boolean
  fleetError?: string
  unlinked: boolean
}> {
  const res = await ms.resolveConfirmationRemote({ id, outcome, confirmationDate })
  const txn = res.transaction

  _transactions = _transactions.map((t) => (t.id === id ? txn : t))
  setLocalBalance(res.cadetId, res.cadetBalance)
  mutated()

  let fleetSynced = true
  let fleetError: string | undefined

  if (txn.meritsDeducted > 0) {
    if (txn.cadetName) {
      const reason =
        (txn.privilegeName + (txn.remarks ? ` — ${txn.remarks}` : '')).trim() ||
        'Merit Store availment'
      const push = await pushDeductionToFleet({
        cadetName: txn.cadetName,
        points: txn.meritsDeducted,
        reason,
        operator: txn.processedBy || 'merit-store',
      })
      fleetSynced = push.ok
      if (!push.ok) {
        fleetError = push.error
        console.warn('[Fleet Merits] failed to push availed entry:', push.error)
      }
    } else {
      fleetSynced = false
      fleetError =
        'No cadet linked to Fleet Merits (pick a synced cadet on Encode so the name matches exactly).'
    }
  }

  return { transactions: _transactions, fleetSynced, fleetError, unlinked: res.unlinked }
}

/**
 * Remove a transaction (admin only; the password is re-checked on the server).
 * If merits were deducted, restores them on the cadet and posts a credit to Fleet Merits.
 */
export async function deleteTransaction(
  id: string,
  password: string,
): Promise<{
  ok: boolean
  error?: string
  restored: number
  fleetSynced: boolean
  fleetError?: string
}> {
  const res = await ms.deleteTransactionRemote(id, password)
  if (!res.ok) {
    return { ok: false, error: res.error, restored: 0, fleetSynced: false }
  }

  const txn = res.transaction
  _transactions = _transactions.filter((t) => t.id !== id)
  setLocalBalance(res.cadetId, res.cadetBalance)
  mutated()

  let fleetSynced = true
  let fleetError: string | undefined

  if (res.restored > 0 && txn.cadetName) {
    try {
      const { pushFleetMeritCredit } = await import('./fleetClient')
      const push = await pushFleetMeritCredit({
        cadetName: txn.cadetName,
        points: res.restored,
        reason: `Merit Store record removed — restore ${res.restored} merits (${txn.privilegeName})`,
        operator: txn.processedBy || 'merit-store',
      })
      fleetSynced = push.ok
      if (!push.ok) fleetError = push.error
    } catch (e: any) {
      fleetSynced = false
      fleetError = e?.message ?? String(e)
    }
  }

  return { ok: true, restored: res.restored, fleetSynced, fleetError }
}
