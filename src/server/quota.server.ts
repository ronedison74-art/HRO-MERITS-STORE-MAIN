// SERVER-ONLY. Computes one cadet's ED / DR usage for the Fleet Merits card.
// Kept free of framework code so it can be unit-tested.
import { usedInPeriod, type QuotaRule, type QuotaTxn } from '../lib/rules.ts'

export const QUOTA_PRIVILEGES = { ed: 'reduce-ed', dr: 'offset-demerits' } as const

export interface QuotaResponse {
  found: boolean
  /** Units used in the current period; null when it can't be worked out. */
  ed?: number | null
  dr?: number | null
  edLimit?: number | null
  drLimit?: number | null
  asOf?: string
}

const TXN_COLS =
  'id,privilege_id,cadet_id,cadet_name,status,merits_deducted,quantity,confirmation_date'

/** Today's date (YYYY-MM-DD) in the given timezone — month/semester edges depend on it. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export async function buildQuota(sb: any, rawName: string, today: string): Promise<QuotaResponse> {
  const name = rawName.trim()
  // Exact, case-insensitive name match (wildcards escaped so "_" and "%" are literal).
  const like = name.replace(/[\\%_]/g, '\\$&')

  const { data: cadets, error: cErr } = await sb
    .from('ms_cadets')
    .select('id,name')
    .ilike('name', like)
    .limit(2)
  if (cErr) throw new Error(cErr.message)
  if (!cadets || cadets.length !== 1) return { found: false }
  const cadet = cadets[0] as { id: string; name: string }

  const ids = [QUOTA_PRIVILEGES.ed, QUOTA_PRIVILEGES.dr]
  const [privRes, setRes, byId, byName] = await Promise.all([
    sb.from('ms_privileges').select('id,quota_limit,quota_period,entry_max').in('id', ids),
    sb.from('ms_settings').select('key,value'),
    sb.from('ms_transactions').select(TXN_COLS).in('privilege_id', ids).gt('merits_deducted', 0).eq('cadet_id', cadet.id),
    sb.from('ms_transactions').select(TXN_COLS).in('privilege_id', ids).gt('merits_deducted', 0).ilike('cadet_name', like),
  ])
  for (const r of [privRes, setRes, byId, byName]) if (r.error) throw new Error(r.error.message)

  const seen = new Set<string>()
  const transactions: QuotaTxn[] = []
  for (const t of [...(byId.data ?? []), ...(byName.data ?? [])]) {
    if (seen.has(String(t.id))) continue
    seen.add(String(t.id))
    transactions.push({
      privilegeId: String(t.privilege_id),
      cadetId: t.cadet_id == null ? '' : String(t.cadet_id),
      cadetName: String(t.cadet_name ?? ''),
      status: String(t.status),
      meritsDeducted: Number(t.merits_deducted) || 0,
      quantity: t.quantity == null ? null : Number(t.quantity),
      confirmationDate: t.confirmation_date ? String(t.confirmation_date).slice(0, 10) : null,
    })
  }

  const setting = (k: string) => (setRes.data ?? []).find((r: any) => r.key === k)?.value
  const semStart = setting('semester_start')
  const semEnd = setting('semester_end')
  const semester = semStart && semEnd ? { start: String(semStart), end: String(semEnd) } : null

  const ruleFor = (id: string): QuotaRule | null => {
    const r = (privRes.data ?? []).find((p: any) => p.id === id)
    if (!r) return null
    return {
      quotaLimit: r.quota_limit == null ? null : Number(r.quota_limit),
      quotaPeriod: r.quota_period === 'month' || r.quota_period === 'semester' ? r.quota_period : null,
      entryMax: r.entry_max == null ? null : Number(r.entry_max),
    }
  }

  const used = (id: string) => {
    const rule = ruleFor(id)
    if (!rule) return null
    return usedInPeriod({
      rule,
      privilegeId: id,
      cadetId: cadet.id,
      cadetName: cadet.name,
      onDate: today,
      semester,
      transactions,
    })
  }

  return {
    found: true,
    ed: used(QUOTA_PRIVILEGES.ed),
    dr: used(QUOTA_PRIVILEGES.dr),
    edLimit: ruleFor(QUOTA_PRIVILEGES.ed)?.quotaLimit ?? null,
    drLimit: ruleFor(QUOTA_PRIVILEGES.dr)?.quotaLimit ?? null,
    asOf: today,
  }
}
