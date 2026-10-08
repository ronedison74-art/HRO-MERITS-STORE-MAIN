/**
 * Fleet Merits LIVE Supabase client (fleethro.netlify.app).
 * Cadets, balances, and push deductions → original Fleet project.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { fetchAllPages } from './paginate'

const FLEET_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_FLEET_SUPABASE_URL) ||
  'https://bgxgdgoegnjxuzatiqed.supabase.co'

const FLEET_ANON_KEY =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_FLEET_SUPABASE_ANON_KEY) ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJneGdkZ29lZ25qeHV6YXRpcWVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MzQyODYsImV4cCI6MjA5MTAxMDI4Nn0.Vx-g40-0g4BRtX6n6zTQ6F9eHVzQoWcKDJGa3GjhWCY'

export type FleetCadetRow = {
  id: number
  name: string
  batch: number | string | null
  team: number | null
  quota_dr: number | null
  quota_ed: number | null
}

export type FleetMeritEntry = {
  id?: number
  cadet_name: string
  merit: number
  details: string | null
  availed: number
  details_availed: string | null
  operator: string
  entry_date: string
}

export type CadetLookupResult = {
  cadet: FleetCadetRow
  totalEarned: number
  totalAvailed: number
  netMerits: number
  activity: FleetMeritEntry[]
}

let _client: SupabaseClient | null = null

export function getFleetClient(): SupabaseClient {
  if (!_client) {
    _client = createClient(FLEET_URL, FLEET_ANON_KEY)
  }
  return _client
}

export function isFleetConfigured(): boolean {
  return Boolean(FLEET_URL && FLEET_ANON_KEY)
}

export async function fetchFleetCadets(): Promise<FleetCadetRow[]> {
  const db = getFleetClient()
  return fetchAllPages<FleetCadetRow>((from, to) =>
    db
      .from('cadets')
      .select('id,name,batch,team,quota_dr,quota_ed')
      .not('batch', 'is', null)
      .not('name', 'ilike', '[DELETED%')
      .order('name', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to) as any,
  )
}

export async function searchFleetCadetNames(query: string, limit = 15): Promise<string[]> {
  const q = query.trim()
  if (!q) return []
  const db = getFleetClient()
  const { data, error } = await db
    .from('cadets')
    .select('name')
    .not('batch', 'is', null)
    .not('name', 'ilike', '[DELETED%')
    .ilike('name', `%${q}%`)
    .order('name', { ascending: true })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []).map((r: any) => String(r.name))
}

/** Net merits per cadet. Keys are lowercase + trimmed names (Fleet matches names ignoring case). */
export async function fetchFleetBalances(): Promise<Map<string, number>> {
  const db = getFleetClient()
  const rows = await fetchAllPages<any>((from, to) =>
    db
      .from('merit_entries')
      .select('cadet_name,merit,availed')
      .order('id', { ascending: true })
      .range(from, to) as any,
  )
  const map = new Map<string, number>()
  for (const row of rows) {
    const key = String(row.cadet_name || '').trim().toLowerCase()
    if (!key) continue
    const merit = Number(row.merit) || 0
    const availed = Number(row.availed) || 0
    map.set(key, (map.get(key) || 0) + merit - availed)
  }
  return map
}

export async function lookupCadet(name: string): Promise<CadetLookupResult | null> {
  const db = getFleetClient()
  const { data: cadets, error: cErr } = await db
    .from('cadets')
    .select('id,name,batch,team,quota_dr,quota_ed')
    .ilike('name', name.trim())
    .limit(1)
  if (cErr) throw new Error(cErr.message)
  const cadet = (cadets ?? [])[0] as FleetCadetRow | undefined
  if (!cadet) return null

  const { data: entries, error: eErr } = await db
    .from('merit_entries')
    .select('id,cadet_name,merit,details,availed,details_availed,operator,entry_date')
    .eq('cadet_name', cadet.name)
    .order('entry_date', { ascending: false })
    .limit(50)
  if (eErr) throw new Error(eErr.message)

  const activity = (entries ?? []) as FleetMeritEntry[]
  let totalEarned = 0
  let totalAvailed = 0
  for (const e of activity) {
    totalEarned += Number(e.merit) || 0
    totalAvailed += Number(e.availed) || 0
  }
  return {
    cadet,
    totalEarned,
    totalAvailed,
    netMerits: totalEarned - totalAvailed,
    activity,
  }
}

export async function fetchFleetStats(): Promise<{
  cadets: number
  entries: number
  operators: number
}> {
  const db = getFleetClient()
  const [cRes, eRes, oRes] = await Promise.all([
    db.from('cadets').select('*', { count: 'exact', head: true }),
    db.from('merit_entries').select('*', { count: 'exact', head: true }),
    db.from('merit_entries').select('operator'),
  ])
  const ops = new Set(
    (oRes.data ?? []).map((r: any) => String(r.operator || '').toLowerCase()).filter(Boolean),
  )
  return {
    cadets: cRes.count ?? 0,
    entries: eRes.count ?? 0,
    operators: ops.size,
  }
}

export async function pushFleetAvailed(input: {
  cadetName: string
  points: number
  reason: string
  operator: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = getFleetClient()
  const row: FleetMeritEntry = {
    cadet_name: input.cadetName.trim(),
    merit: 0,
    details: null,
    availed: input.points,
    details_availed: input.reason,
    operator: input.operator || 'merit-store',
    entry_date: new Date().toISOString(),
  }
  const { error } = await db.from('merit_entries').insert(row)
  if (error) {
    let msg = error.message
    if (error.code === '23503' || /foreign key|not present in table/i.test(msg)) {
      msg =
        `Cadet name "${input.cadetName}" is not in Fleet Merits cadets table. ` +
        'Admin → Sync from Fleet Merits, then Encode using the dropdown (exact name).'
    }
    return { ok: false, error: msg }
  }
  return { ok: true }
}

export async function pushFleetMeritCredit(input: {
  cadetName: string
  points: number
  reason: string
  operator: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = getFleetClient()
  const row: FleetMeritEntry = {
    cadet_name: input.cadetName.trim(),
    merit: input.points,
    details: input.reason,
    availed: 0,
    details_availed: null,
    operator: input.operator || 'merit-store',
    entry_date: new Date().toISOString(),
  }
  const { error } = await db.from('merit_entries').insert(row)
  if (error) {
    let msg = error.message
    if (error.code === '23503' || /foreign key|not present in table/i.test(msg)) {
      msg = `Cadet name "${input.cadetName}" is not in Fleet Merits cadets table.`
    }
    return { ok: false, error: msg }
  }
  return { ok: true }
}

export async function fetchCadetActivity(cadetName: string, limit = 30): Promise<FleetMeritEntry[]> {
  const db = getFleetClient()
  const { data, error } = await db
    .from('merit_entries')
    .select('id,cadet_name,merit,details,availed,details_availed,operator,entry_date')
    .eq('cadet_name', cadetName)
    .order('entry_date', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []) as FleetMeritEntry[]
}

const QUOTA_BLOCKED =
  "Fleet Merits didn't allow Merit Store to update its quota numbers. The owner of the Fleet database needs to allow it (see README → Fleet quotas)."

export type FleetQuotaPatch = { quota_ed?: number; quota_dr?: number }

/** Set Quota ED / Quota DR on one Fleet cadet (matched by exact name). */
export async function updateFleetQuotasByName(
  name: string,
  patch: FleetQuotaPatch,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = getFleetClient()
  const { data: found, error: fErr } = await db
    .from('cadets')
    .select('id')
    .eq('name', name.trim())
    .limit(1)
  if (fErr) return { ok: false, error: fErr.message }
  if (!found?.length) {
    return {
      ok: false,
      error: `"${name}" is not in Fleet Merits cadets. Admin → Sync from Fleet Merits first.`,
    }
  }
  const { data, error } = await db
    .from('cadets')
    .update(patch)
    .eq('id', (found[0] as any).id)
    .select('id')
  if (error) return { ok: false, error: error.message }
  // With row-level security, a blocked update succeeds but changes 0 rows.
  if (!data?.length) return { ok: false, error: QUOTA_BLOCKED }
  return { ok: true }
}

/** Bulk version (by Fleet cadet id). Throws on the first failure. */
export async function updateFleetQuotasById(
  updates: { id: number; patch: FleetQuotaPatch }[],
): Promise<{ updated: number }> {
  const db = getFleetClient()
  let updated = 0
  for (let i = 0; i < updates.length; i += 10) {
    const chunk = updates.slice(i, i + 10)
    const results = await Promise.all(
      chunk.map((u) => db.from('cadets').update(u.patch).eq('id', u.id).select('id')),
    )
    for (const r of results) {
      if (r.error) throw new Error(r.error.message)
      if (!r.data?.length) throw new Error(QUOTA_BLOCKED)
      updated++
    }
  }
  return { updated }
}
