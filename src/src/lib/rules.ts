// Pure business rules (no I/O) so they can be unit-tested and shared by the
// server functions.

export type PrivilegeType = 'REGULAR' | 'ACCOUNTABILITY'

export type TransactionStatus =
  | 'Pending'
  | 'Confirmed'
  | 'Cancelled'
  | 'Not Confirmed'
  | 'Invalid'

export type ConfirmOutcome = 'granted' | 'not-granted' | 'invalid'

/**
 * Total merits for an availment.
 *  REGULAR        → the privilege's fixed cost
 *  ACCOUNTABILITY → quantity × rate
 * Returns null when the input is not valid.
 */
export function computeMeritCost(
  privilege: { type: PrivilegeType; cost: number },
  quantity?: number | null,
): number | null {
  if (privilege.type === 'REGULAR') return privilege.cost
  if (quantity == null || !Number.isFinite(quantity) || quantity <= 0) return null
  return round2(quantity * privilege.cost)
}

export interface ResolvePatch {
  status: TransactionStatus
  meritsDeducted: number
  violation: boolean
}

/**
 * Day-2 rules:
 *  granted      → Confirmed, deduct, no violation (both types)
 *  not-granted  → REGULAR: Cancelled, no deduction
 *                 ACCOUNTABILITY: Not Confirmed, deduct + violation
 *  invalid      → Invalid, no deduction, no violation
 */
export function resolveOutcome(
  privilegeType: PrivilegeType,
  meritCost: number,
  outcome: ConfirmOutcome,
): ResolvePatch {
  if (outcome === 'invalid') {
    return { status: 'Invalid', meritsDeducted: 0, violation: false }
  }
  if (outcome === 'granted') {
    return { status: 'Confirmed', meritsDeducted: meritCost, violation: false }
  }
  if (privilegeType === 'REGULAR') {
    return { status: 'Cancelled', meritsDeducted: 0, violation: false }
  }
  return { status: 'Not Confirmed', meritsDeducted: meritCost, violation: true }
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export interface BalanceWarning {
  balance: number
  /** Merits already promised by this cadet's other Pending entries. */
  pending: number
  needed: number
  /** balance − pending */
  available: number
}

/**
 * Warn (never block) when a cadet can't cover a new availment.
 * Pending entries aren't deducted yet, so they're counted against the balance.
 * Returns null when there is nothing to warn about.
 */
export function lowBalanceWarning(
  balance: number,
  pending: number,
  needed: number | null | undefined,
): BalanceWarning | null {
  if (needed == null || !Number.isFinite(needed) || needed <= 0) return null
  const available = round2(balance - pending)
  if (available >= needed) return null
  return { balance, pending, needed, available }
}

/* =========================================================
   Accountability quotas (ED hours, demerits, …) — warn only
   ========================================================= */

export type QuotaPeriod = 'month' | 'semester'

export interface QuotaRule {
  /** Max units (ED hours / demerits) per cadet per period. null = no limit. */
  quotaLimit: number | null
  quotaPeriod: QuotaPeriod | null
  /** Usual max units in ONE entry (soft: only warns). null = none. */
  entryMax: number | null
}

export interface QuotaTxn {
  privilegeId: string
  cadetId: string
  cadetName: string
  status: string
  meritsDeducted: number
  quantity?: number | null
  confirmationDate: string | null
}

export interface QuotaResult {
  periodLabel: string
  /** Units already deducted in this period (Confirmed + Not Confirmed). */
  used: number
  /** Units still Pending (not deducted yet) — shown for information only. */
  pending: number
  limit: number | null
  /** used + this entry (+ other rows of the same batch). */
  projected: number | null
  overBy: number | null
  entryMax: number | null
  entryOverBy: number | null
  /** Explains why the period quota couldn't be checked. */
  notice: string | null
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Calendar-month range containing `date` (YYYY-MM-DD), as YYYY-MM-DD strings. */
export function monthRange(date: string): { start: string; end: string } | null {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(date)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate()
  return { start: `${m[1]}-${m[2]}-01`, end: `${m[1]}-${m[2]}-${pad(last)}` }
}

const sameCadet = (t: QuotaTxn, cadetId: string, cadetName: string) =>
  (cadetId !== '' && t.cadetId === cadetId) ||
  (cadetName.trim() !== '' &&
    t.cadetName.trim().toLowerCase() === cadetName.trim().toLowerCase())

/**
 * Quota check for one new entry. Never blocks — callers only display the result.
 * An entry counts toward the quota once merits were deducted from the cadet
 * (Confirmed, or Not Confirmed on accountability), by its confirmation date.
 */
export function evaluateQuota(input: {
  rule: QuotaRule
  privilegeId: string
  cadetId: string
  cadetName: string
  /** Units in this entry, if valid. */
  quantity: number | null
  /** Units in OTHER rows of the same submit for the same cadet. */
  alsoInBatch?: number
  availmentDate: string
  semester: { start: string; end: string } | null
  transactions: QuotaTxn[]
}): QuotaResult | null {
  const { rule } = input
  const hasPeriodQuota = rule.quotaLimit != null && rule.quotaPeriod != null
  const hasEntryMax = rule.entryMax != null
  if (!hasPeriodQuota && !hasEntryMax) return null

  const qty =
    input.quantity != null && Number.isFinite(input.quantity) && input.quantity > 0
      ? input.quantity
      : null

  const result: QuotaResult = {
    periodLabel: '',
    used: 0,
    pending: 0,
    limit: null,
    projected: null,
    overBy: null,
    entryMax: rule.entryMax,
    entryOverBy: hasEntryMax && qty != null && qty > rule.entryMax! ? round2(qty - rule.entryMax!) : null,
    notice: null,
  }

  if (!hasPeriodQuota) return result

  result.limit = rule.quotaLimit
  let range: { start: string; end: string } | null = null

  if (rule.quotaPeriod === 'month') {
    result.periodLabel = 'this month'
    range = monthRange(input.availmentDate)
    if (!range) result.notice = 'Pick a valid availment date to check the monthly quota.'
  } else {
    result.periodLabel = 'this semester'
    if (!input.semester) {
      result.notice =
        "Semester dates aren't set, so the semester quota can't be checked. An admin can set them on the Admin page."
    } else if (
      input.availmentDate < input.semester.start ||
      input.availmentDate > input.semester.end
    ) {
      result.notice = `This date is outside the current semester (${input.semester.start} to ${input.semester.end}), so the semester quota can't be checked.`
    } else {
      range = input.semester
    }
  }

  const mine = input.transactions.filter(
    (t) =>
      t.privilegeId === input.privilegeId &&
      sameCadet(t, input.cadetId, input.cadetName),
  )

  result.pending = round2(
    mine.filter((t) => t.status === 'Pending').reduce((s, t) => s + (t.quantity ?? 0), 0),
  )

  if (!range) return result

  result.used = round2(
    mine
      .filter(
        (t) =>
          t.meritsDeducted > 0 &&
          t.confirmationDate != null &&
          t.confirmationDate >= range!.start &&
          t.confirmationDate <= range!.end,
      )
      .reduce((s, t) => s + (t.quantity ?? 0), 0),
  )

  if (qty != null) {
    result.projected = round2(result.used + qty + (input.alsoInBatch ?? 0))
    if (result.projected > rule.quotaLimit!) {
      result.overBy = round2(result.projected - rule.quotaLimit!)
    }
  }
  return result
}

/**
 * Units a cadet has already used in the CURRENT quota period (counted once merits
 * were deducted). Used to fill Fleet Merits' "Quota ED" / "Quota DR".
 * Returns null when it can't be worked out (no quota set on the privilege, or a
 * semester quota with no semester dates / today outside the semester).
 */
export function usedInPeriod(input: {
  rule: QuotaRule
  privilegeId: string
  cadetId: string
  cadetName: string
  onDate: string
  semester: { start: string; end: string } | null
  transactions: QuotaTxn[]
}): number | null {
  const { rule } = input
  if (rule.quotaLimit == null || rule.quotaPeriod == null) return null

  let range: { start: string; end: string } | null = null
  if (rule.quotaPeriod === 'month') {
    range = monthRange(input.onDate)
  } else if (
    input.semester &&
    input.onDate >= input.semester.start &&
    input.onDate <= input.semester.end
  ) {
    range = input.semester
  }
  if (!range) return null

  return round2(
    input.transactions
      .filter(
        (t) =>
          t.privilegeId === input.privilegeId &&
          sameCadet(t, input.cadetId, input.cadetName) &&
          t.meritsDeducted > 0 &&
          t.confirmationDate != null &&
          t.confirmationDate >= range!.start &&
          t.confirmationDate <= range!.end,
      )
      .reduce((s, t) => s + (t.quantity ?? 0), 0),
  )
}
