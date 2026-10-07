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
