import { createServerFn } from '@tanstack/react-start'
import { authMiddleware, adminMiddleware } from './authMiddleware'
import type { Cadet, Privilege, Transaction } from './meritStore'
import {
  computeMeritCost,
  resolveOutcome,
  type ConfirmOutcome,
  type PrivilegeType,
} from './rules'

/* =========================================================
   Helpers (server side only — only called inside handlers)
   ========================================================= */

type Row = Record<string, any>

async function db() {
  const { getServiceClient } = await import('../server/supabase.server')
  return getServiceClient()
}

function fail(message: string): never {
  throw new Error(message)
}

function text(v: unknown, label: string, max = 200, required = true): string {
  const s = typeof v === 'string' ? v.trim() : ''
  if (required && !s) fail(`${label} is required.`)
  if (s.length > max) fail(`${label} is too long (max ${max}).`)
  return s
}

function amount(v: unknown, label: string): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n) || n < 0) fail(`${label} must be a number ≥ 0.`)
  return n
}

function isoDate(v: unknown, label: string): string {
  const s = typeof v === 'string' ? v.trim() : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) fail(`${label} must be YYYY-MM-DD.`)
  return s
}

const privilegeFromRow = (r: Row): Privilege => ({
  id: String(r.id),
  name: String(r.name),
  cost: Number(r.cost) || 0,
  type: String(r.type) as PrivilegeType,
})

const cadetFromRow = (r: Row): Cadet => ({
  id: String(r.id),
  name: String(r.name),
  batch: r.batch == null ? '' : String(r.batch),
  availableMerits: Number(r.available_merits) || 0,
})

const txnFromRow = (r: Row): Transaction => ({
  id: String(r.id),
  cadetId: r.cadet_id == null ? '' : String(r.cadet_id),
  cadetName: String(r.cadet_name ?? ''),
  batch: r.batch == null ? '' : String(r.batch),
  privilegeId: r.privilege_id == null ? '' : String(r.privilege_id),
  privilegeName: r.privilege_name == null ? '' : String(r.privilege_name),
  privilegeType: String(r.privilege_type || 'REGULAR') as PrivilegeType,
  meritCost: Number(r.merit_cost) || 0,
  availmentDate: r.availment_date ? String(r.availment_date).slice(0, 10) : '',
  confirmationDate: r.confirmation_date
    ? String(r.confirmation_date).slice(0, 10)
    : null,
  status: String(r.status) as Transaction['status'],
  meritsDeducted: Number(r.merits_deducted) || 0,
  violation: Boolean(r.violation),
  processedBy: r.processed_by == null ? '' : String(r.processed_by),
  remarks: r.remarks == null ? '' : String(r.remarks),
  createdAt: r.created_at ? String(r.created_at) : new Date().toISOString(),
  quantity: r.quantity == null ? undefined : Number(r.quantity),
})

/** Supabase returns at most 1000 rows per request — page through everything. */
async function fetchAllRows(
  build: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: any }>,
  cap = 50000,
): Promise<Row[]> {
  const PAGE = 1000
  const out: Row[] = []
  for (let from = 0; from < cap; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) fail(error.message)
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

async function adjustMerits(
  sb: Awaited<ReturnType<typeof db>>,
  cadetId: string,
  delta: number,
): Promise<number | null> {
  const { data, error } = await sb.rpc('ms_adjust_merits', {
    p_cadet_id: cadetId,
    p_delta: delta,
  })
  if (error) fail(`Could not update the cadet balance: ${error.message}`)
  return data == null ? null : Number(data)
}

/** Cadet id for a transaction: the stored link, else an exact (case-insensitive) name match. */
async function resolveCadetId(
  sb: Awaited<ReturnType<typeof db>>,
  cadetId: string | null,
  cadetName: string,
): Promise<string> {
  if (cadetId) {
    const { data } = await sb.from('ms_cadets').select('id').eq('id', cadetId).maybeSingle()
    if (data) return String(data.id)
  }
  if (!cadetName) return ''
  const { data } = await sb
    .from('ms_cadets')
    .select('id')
    .ilike('name', cadetName.replace(/[\\%_]/g, '\\$&'))
    .limit(2)
  return data && data.length === 1 ? String(data[0].id) : ''
}

/* =========================================================
   LOGIN / SESSION
   ========================================================= */

/** Before a magic link is sent: only allow-listed emails get one. */
export const prepareLoginServer = createServerFn({ method: 'POST' })
  .inputValidator((d: { email: string }) => d)
  .handler(async ({ data }) => {
    const email = text(data.email, 'Email', 254).toLowerCase()
    const sb = await db()

    const { data: row, error } = await sb
      .from('ms_users')
      .select('active')
      .eq('email', email)
      .maybeSingle()
    if (error) fail(error.message)
    if (!row || !row.active) return { ok: false }

    // Make sure a Supabase Auth account exists so the magic link can be sent.
    const { error: createErr } = await sb.auth.admin.createUser({
      email,
      email_confirm: true,
    })
    if (
      createErr &&
      !/already|exists|registered/i.test(`${createErr.code ?? ''} ${createErr.message}`)
    ) {
      fail(createErr.message)
    }
    return { ok: true }
  })

export const getMeServer = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => ({
    email: context.user.email,
    role: context.user.role,
  }))

/* =========================================================
   READ EVERYTHING (one round trip)
   ========================================================= */

export const fetchAllServer = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async () => {
    const sb = await db()

    const [privRes, cadetRows, txnRows] = await Promise.all([
      sb.from('ms_privileges').select('id,name,cost,type').order('name'),
      fetchAllRows((from, to) =>
        sb
          .from('ms_cadets')
          .select('id,name,batch,available_merits')
          .order('name')
          .order('id')
          .range(from, to),
      ),
      fetchAllRows((from, to) =>
        sb
          .from('ms_transactions')
          .select('*')
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to),
      ),
    ])
    if (privRes.error) fail(privRes.error.message)

    return {
      privileges: (privRes.data ?? []).map(privilegeFromRow),
      cadets: cadetRows.map(cadetFromRow),
      transactions: txnRows.map(txnFromRow),
    }
  })

/* =========================================================
   ENCODE (admin + encoder)
   ========================================================= */

export interface NewAvailment {
  cadetName: string
  cadetId?: string
  batch?: string
  privilegeId: string
  /** ED hours / demerits — required for ACCOUNTABILITY privileges. */
  quantity?: number
  remarks?: string
}

export const createAvailmentsServer = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(
    (d: { items: NewAvailment[]; availmentDate: string; processedBy?: string }) => d,
  )
  .handler(async ({ data, context }) => {
    if (!Array.isArray(data.items) || data.items.length === 0) fail('Nothing to encode.')
    if (data.items.length > 500) fail('Too many rows at once (max 500).')

    const availmentDate = isoDate(data.availmentDate, 'Availment date')
    const processedBy =
      text(data.processedBy, 'Processed by', 100, false) || context.user.email

    const sb = await db()

    // Costs always come from the Admin-set privilege — the browser can't override them.
    const { data: privRows, error: privErr } = await sb
      .from('ms_privileges')
      .select('id,name,cost,type')
    if (privErr) fail(privErr.message)
    const privs = new Map((privRows ?? []).map((p) => [String(p.id), privilegeFromRow(p)]))

    const { data: cadetRows, error: cadetErr } = await sb
      .from('ms_cadets')
      .select('id,name,batch')
    if (cadetErr) fail(cadetErr.message)
    const cadets = new Map((cadetRows ?? []).map((c) => [String(c.id), c]))

    const rows = data.items.map((item, i) => {
      const n = i + 1
      const priv = privs.get(String(item.privilegeId))
      if (!priv) fail(`Row ${n}: unknown privilege.`)

      const qty =
        priv.type === 'ACCOUNTABILITY' ? Number(item.quantity) : undefined
      const cost = computeMeritCost(priv, qty)
      if (cost == null) fail(`Row ${n}: enter a valid quantity.`)

      let cadetName = text(item.cadetName, `Row ${n}: cadet`, 200)
      let batch = text(item.batch, 'Batch', 50, false)
      let cadetId: string | null = null

      const wanted = text(item.cadetId, 'Cadet', 50, false)
      if (wanted) {
        const c = cadets.get(wanted)
        if (!c) fail(`Row ${n}: that cadet no longer exists — re-select them.`)
        cadetId = String(c.id)
        cadetName = String(c.name)
        batch = c.batch == null ? '' : String(c.batch)
      }

      return {
        cadet_id: cadetId,
        cadet_name: cadetName,
        batch: batch || null,
        privilege_id: priv.id,
        privilege_name: priv.name,
        privilege_type: priv.type,
        merit_cost: cost,
        availment_date: availmentDate,
        status: 'Pending',
        merits_deducted: 0,
        violation: false,
        processed_by: processedBy,
        remarks: text(item.remarks, 'Remarks', 1000, false) || null,
        quantity: qty ?? null,
      }
    })

    const { data: inserted, error } = await sb
      .from('ms_transactions')
      .insert(rows)
      .select('*')
    if (error) fail(`Could not save: ${error.message}`)

    return (inserted ?? [])
      .map(txnFromRow)
      .sort((a, b) => b.id.localeCompare(a.id))
  })

/* =========================================================
   CONFIRM (admin + encoder)
   ========================================================= */

export const resolveConfirmationServer = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(
    (d: { id: string; outcome: ConfirmOutcome; confirmationDate: string }) => d,
  )
  .handler(async ({ data }) => {
    const id = text(data.id, 'Transaction id', 50)
    const confirmationDate = isoDate(data.confirmationDate, 'Confirmation date')
    if (!['granted', 'not-granted', 'invalid'].includes(data.outcome)) {
      fail('Unknown outcome.')
    }

    const sb = await db()

    const { data: txn, error } = await sb
      .from('ms_transactions')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (error) fail(error.message)
    if (!txn) fail(`${id} was not found (it may have been removed).`)
    if (txn.status !== 'Pending') {
      fail(`${id} was already resolved by someone else (${txn.status}).`)
    }

    const patch = resolveOutcome(
      txn.privilege_type as PrivilegeType,
      Number(txn.merit_cost) || 0,
      data.outcome,
    )

    const cadetId =
      patch.meritsDeducted > 0
        ? await resolveCadetId(sb, txn.cadet_id, String(txn.cadet_name ?? ''))
        : ''

    // Only one operator can win: the update matches only while still Pending.
    const { data: updated, error: updErr } = await sb
      .from('ms_transactions')
      .update({
        status: patch.status,
        merits_deducted: patch.meritsDeducted,
        violation: patch.violation,
        confirmation_date: confirmationDate,
        cadet_id: cadetId || txn.cadet_id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', 'Pending')
      .select('*')
    if (updErr) fail(updErr.message)
    if (!updated || updated.length === 0) {
      fail(`${id} was already resolved by someone else.`)
    }

    let balance: number | null = null
    if (patch.meritsDeducted > 0 && cadetId) {
      try {
        balance = await adjustMerits(sb, cadetId, -patch.meritsDeducted)
      } catch (e) {
        // Undo, so the record and the balance never disagree.
        await sb
          .from('ms_transactions')
          .update({
            status: 'Pending',
            merits_deducted: 0,
            violation: false,
            confirmation_date: null,
            cadet_id: txn.cadet_id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
        throw e
      }
    }

    return {
      transaction: txnFromRow(updated[0]),
      cadetId,
      cadetBalance: balance,
      /** true when merits had to be deducted but no matching roster cadet was found */
      unlinked: patch.meritsDeducted > 0 && !cadetId,
    }
  })

/* =========================================================
   RECORDS — remove (admin + re-entered password)
   ========================================================= */

export const deleteTransactionServer = createServerFn({ method: 'POST' })
  .middleware([adminMiddleware])
  .inputValidator((d: { id: string; password: string }) => d)
  .handler(async ({ data }) => {
    const { safeEqual } = await import('../server/auth.server')

    const expected = process.env.ADMIN_ACTION_PASSWORD
    if (!expected) {
      fail('ADMIN_ACTION_PASSWORD is not set on the server, so removing records is disabled.')
    }
    if (!safeEqual(String(data.password ?? ''), expected)) {
      return { ok: false as const, error: 'Incorrect password.' }
    }

    const id = text(data.id, 'Transaction id', 50)
    const sb = await db()

    // Delete first and use the returned row: if two admins click at once, only one gets it.
    const { data: deleted, error } = await sb
      .from('ms_transactions')
      .delete()
      .eq('id', id)
      .select('*')
    if (error) fail(error.message)
    if (!deleted || deleted.length === 0) {
      return { ok: false as const, error: 'Transaction not found (already removed?).' }
    }
    const row = deleted[0]

    const restored = Number(row.merits_deducted) > 0 ? Number(row.merits_deducted) : 0
    let cadetId = ''
    let balance: number | null = null

    if (restored > 0) {
      cadetId = await resolveCadetId(sb, row.cadet_id, String(row.cadet_name ?? ''))
      if (cadetId) {
        try {
          balance = await adjustMerits(sb, cadetId, restored)
        } catch (e) {
          await sb.from('ms_transactions').insert(row) // put the record back
          throw e
        }
      }
    }

    return {
      ok: true as const,
      restored,
      cadetId,
      cadetBalance: balance,
      transaction: txnFromRow(row),
    }
  })

/* =========================================================
   ADMIN: privileges
   ========================================================= */

export const updatePrivilegeServer = createServerFn({ method: 'POST' })
  .middleware([adminMiddleware])
  .inputValidator((d: { id: string; cost: number }) => d)
  .handler(async ({ data }) => {
    const id = text(data.id, 'Privilege id', 50)
    const cost = amount(data.cost, 'Cost')
    const sb = await db()
    const { data: rows, error } = await sb
      .from('ms_privileges')
      .update({ cost, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id,name,cost,type')
    if (error) fail(error.message)
    if (!rows?.length) fail('Privilege not found.')
    return privilegeFromRow(rows[0])
  })

/* =========================================================
   ADMIN: cadets
   ========================================================= */

export const addCadetServer = createServerFn({ method: 'POST' })
  .middleware([adminMiddleware])
  .inputValidator((d: { name: string; batch: string; availableMerits: number }) => d)
  .handler(async ({ data }) => {
    const sb = await db()
    const { data: rows, error } = await sb
      .from('ms_cadets')
      .insert({
        name: text(data.name, 'Name', 200),
        batch: text(data.batch, 'Batch', 50, false) || null,
        available_merits: amount(data.availableMerits, 'Available merits'),
      })
      .select('id,name,batch,available_merits')
    if (error) fail(error.message)
    return cadetFromRow(rows![0])
  })

export const updateCadetServer = createServerFn({ method: 'POST' })
  .middleware([adminMiddleware])
  .inputValidator(
    (d: { id: string; name: string; batch: string; availableMerits: number }) => d,
  )
  .handler(async ({ data }) => {
    const sb = await db()
    const { data: rows, error } = await sb
      .from('ms_cadets')
      .update({
        name: text(data.name, 'Name', 200),
        batch: text(data.batch, 'Batch', 50, false) || null,
        available_merits: amount(data.availableMerits, 'Available merits'),
        updated_at: new Date().toISOString(),
      })
      .eq('id', text(data.id, 'Cadet id', 50))
      .select('id,name,batch,available_merits')
    if (error) fail(error.message)
    if (!rows?.length) fail('Cadet not found.')
    return cadetFromRow(rows[0])
  })

export const deleteCadetServer = createServerFn({ method: 'POST' })
  .middleware([adminMiddleware])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const sb = await db()
    const { error } = await sb
      .from('ms_cadets')
      .delete()
      .eq('id', text(data.id, 'Cadet id', 50))
    if (error) fail(error.message)
    return { ok: true }
  })

export const importCadetsServer = createServerFn({ method: 'POST' })
  .middleware([adminMiddleware])
  .inputValidator(
    (d: {
      rows: { name: string; batch: string; availableMerits?: number }[]
      skipDuplicates?: boolean
      defaultMerits: number
      defaultBatch: string
    }) => d,
  )
  .handler(async ({ data }) => {
    if (!Array.isArray(data.rows)) fail('No rows.')
    if (data.rows.length > 5000) fail('Too many rows (max 5000 per upload).')
    const skipDuplicates = data.skipDuplicates !== false
    const sb = await db()

    const existing = await fetchAllRows((from, to) =>
      sb.from('ms_cadets').select('name').order('id').range(from, to),
    )
    const names = new Set(existing.map((c) => String(c.name).trim().toLowerCase()))

    let skipped = 0
    const toInsert: Row[] = []
    for (const r of data.rows) {
      const name = typeof r.name === 'string' ? r.name.trim() : ''
      if (!name || name.length > 200) {
        skipped++
        continue
      }
      const key = name.toLowerCase()
      if (skipDuplicates && names.has(key)) {
        skipped++
        continue
      }
      names.add(key)
      const merits =
        r.availableMerits !== undefined && Number.isFinite(Number(r.availableMerits))
          ? Math.max(0, Number(r.availableMerits))
          : amount(data.defaultMerits, 'Default merits')
      toInsert.push({
        name,
        batch: (typeof r.batch === 'string' ? r.batch.trim() : '') || data.defaultBatch || null,
        available_merits: merits,
      })
    }

    const added: Cadet[] = []
    for (let i = 0; i < toInsert.length; i += 500) {
      const { data: rows, error } = await sb
        .from('ms_cadets')
        .insert(toInsert.slice(i, i + 500))
        .select('id,name,batch,available_merits')
      if (error) fail(`Import stopped after ${added.length} rows: ${error.message}`)
      added.push(...(rows ?? []).map(cadetFromRow))
    }
    return { added: added.length, skipped, cadets: added }
  })

/**
 * Fleet Merits → roster. Matches existing cadets by name (so their id, and every
 * transaction linked to it, is preserved), updates batch + balance, adds new
 * cadets, and never deletes anybody.
 */
export const syncCadetsServer = createServerFn({ method: 'POST' })
  .middleware([adminMiddleware])
  .inputValidator(
    (d: { rows: { id: string; name: string; batch: string; availableMerits: number }[] }) => d,
  )
  .handler(async ({ data }) => {
    if (!Array.isArray(data.rows)) fail('No rows.')
    const sb = await db()

    const existing = await fetchAllRows((from, to) =>
      sb.from('ms_cadets').select('id,name').order('id').range(from, to),
    )
    const byName = new Map(existing.map((c) => [String(c.name).trim().toLowerCase(), String(c.id)]))

    const seen = new Set<string>()
    const usedIds = new Set<string>()
    const upserts: Row[] = []
    for (const r of data.rows) {
      const name = typeof r.name === 'string' ? r.name.trim() : ''
      if (!name) continue
      const key = name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)

      const fleetId = String(r.id ?? '').trim()
      // Existing cadet (matched by name) keeps its id; a new cadet gets the Fleet id.
      const id = byName.get(key) ?? fleetId
      if (!id || usedIds.has(id)) continue // no id, or two rows resolving to one id, would break the upsert
      usedIds.add(id)
      upserts.push({
        id,
        name,
        batch: String(r.batch ?? '').trim() || null,
        available_merits: Math.max(0, Number(r.availableMerits) || 0),
        updated_at: new Date().toISOString(),
      })
    }

    for (let i = 0; i < upserts.length; i += 500) {
      const { error } = await sb
        .from('ms_cadets')
        .upsert(upserts.slice(i, i + 500), { onConflict: 'id' })
      if (error) fail(`Sync stopped: ${error.message}`)
    }

    const all = await fetchAllRows((from, to) =>
      sb.from('ms_cadets').select('id,name,batch,available_merits').order('name').order('id').range(from, to),
    )
    return { count: upserts.length, cadets: all.map(cadetFromRow) }
  })

/* =========================================================
   ADMIN: users & roles
   ========================================================= */

export interface MsUser {
  email: string
  role: 'admin' | 'encoder'
  active: boolean
}

export const listUsersServer = createServerFn({ method: 'GET' })
  .middleware([adminMiddleware])
  .handler(async () => {
    const sb = await db()
    const { data, error } = await sb
      .from('ms_users')
      .select('email,role,active')
      .order('email')
    if (error) fail(error.message)
    return (data ?? []) as MsUser[]
  })

export const saveUserServer = createServerFn({ method: 'POST' })
  .middleware([adminMiddleware])
  .inputValidator((d: { email: string; role: 'admin' | 'encoder'; active: boolean }) => d)
  .handler(async ({ data, context }) => {
    const email = text(data.email, 'Email', 254).toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Enter a valid email address.')
    if (data.role !== 'admin' && data.role !== 'encoder') fail('Role must be admin or encoder.')
    const active = Boolean(data.active)

    if (email === context.user.email && (data.role !== 'admin' || !active)) {
      fail("You can't remove your own admin access.")
    }

    const sb = await db()

    // Never leave the system without an active admin.
    if (data.role !== 'admin' || !active) {
      const { data: admins, error: aErr } = await sb
        .from('ms_users')
        .select('email')
        .eq('role', 'admin')
        .eq('active', true)
      if (aErr) fail(aErr.message)
      const others = (admins ?? []).filter((a) => a.email !== email)
      if (others.length === 0) fail('There must be at least one active admin.')
    }

    const { error } = await sb
      .from('ms_users')
      .upsert({ email, role: data.role, active }, { onConflict: 'email' })
    if (error) fail(error.message)
    return { ok: true }
  })

