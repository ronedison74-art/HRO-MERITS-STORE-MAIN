import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeMeritCost, resolveOutcome } from '../src/lib/rules.ts'

test('regular privilege costs its fixed price, quantity ignored', () => {
  assert.equal(computeMeritCost({ type: 'REGULAR', cost: 10 }), 10)
  assert.equal(computeMeritCost({ type: 'REGULAR', cost: 10 }, 99), 10)
})

test('accountability cost = quantity x rate', () => {
  assert.equal(computeMeritCost({ type: 'ACCOUNTABILITY', cost: 2 }, 5), 10)
  assert.equal(computeMeritCost({ type: 'ACCOUNTABILITY', cost: 2.5 }, 3), 7.5)
})

test('accountability needs a valid positive quantity', () => {
  for (const q of [undefined, null, 0, -1, NaN, Infinity]) {
    assert.equal(computeMeritCost({ type: 'ACCOUNTABILITY', cost: 2 }, q as any), null)
  }
})

test('granted: confirmed + deduct, no violation (both types)', () => {
  for (const t of ['REGULAR', 'ACCOUNTABILITY'] as const) {
    assert.deepEqual(resolveOutcome(t, 10, 'granted'), {
      status: 'Confirmed', meritsDeducted: 10, violation: false,
    })
  }
})

test('not-granted: regular cancels with no deduction', () => {
  assert.deepEqual(resolveOutcome('REGULAR', 10, 'not-granted'), {
    status: 'Cancelled', meritsDeducted: 0, violation: false,
  })
})

test('not-granted: accountability still deducts and records a violation', () => {
  assert.deepEqual(resolveOutcome('ACCOUNTABILITY', 10, 'not-granted'), {
    status: 'Not Confirmed', meritsDeducted: 10, violation: true,
  })
})

test('invalid: never deducts, never a violation', () => {
  for (const t of ['REGULAR', 'ACCOUNTABILITY'] as const) {
    assert.deepEqual(resolveOutcome(t, 10, 'invalid'), {
      status: 'Invalid', meritsDeducted: 0, violation: false,
    })
  }
})

import { lowBalanceWarning } from '../src/lib/rules.ts'

test('low balance: no warning when the balance covers it', () => {
  assert.equal(lowBalanceWarning(100, 0, 10), null)
  assert.equal(lowBalanceWarning(10, 0, 10), null) // exactly enough
})

test('low balance: warns when balance is short', () => {
  const w = lowBalanceWarning(5, 0, 10)
  assert.deepEqual(w, { balance: 5, pending: 0, needed: 10, available: 5 })
})

test('low balance: pending entries count against the balance', () => {
  assert.equal(lowBalanceWarning(30, 25, 10)?.available, 5)
  assert.equal(lowBalanceWarning(30, 15, 10), null)
})

test('low balance: nothing to warn about without a valid amount', () => {
  for (const n of [null, undefined, 0, -3, NaN]) {
    assert.equal(lowBalanceWarning(0, 0, n as any), null)
  }
})

import { evaluateQuota, monthRange, type QuotaTxn } from '../src/lib/rules.ts'

const T = (o: Partial<QuotaTxn>): QuotaTxn => ({
  privilegeId: 'reduce-ed', cadetId: 'C1', cadetName: 'Cruz', status: 'Confirmed',
  meritsDeducted: 10, quantity: 5, confirmationDate: '2026-10-03', ...o,
})
const ED = { quotaLimit: 20, quotaPeriod: 'month' as const, entryMax: null }
const DR = { quotaLimit: 30, quotaPeriod: 'semester' as const, entryMax: 15 }
const SEM = { start: '2026-08-01', end: '2026-12-15' }
const base = {
  privilegeId: 'reduce-ed', cadetId: 'C1', cadetName: 'Cruz',
  availmentDate: '2026-10-08', semester: SEM,
}

test('monthRange handles month ends and leap years', () => {
  assert.deepEqual(monthRange('2026-10-08'), { start: '2026-10-01', end: '2026-10-31' })
  assert.deepEqual(monthRange('2028-02-10'), { start: '2028-02-01', end: '2028-02-29' })
  assert.equal(monthRange('nope'), null)
})

test('quota: nothing to check when the privilege has no rule', () => {
  assert.equal(
    evaluateQuota({ ...base, rule: { quotaLimit: null, quotaPeriod: null, entryMax: null }, quantity: 5, transactions: [] }),
    null,
  )
})

test('quota: under the limit, no warning', () => {
  const r = evaluateQuota({ ...base, rule: ED, quantity: 5, transactions: [T({ quantity: 10 })] })!
  assert.equal(r.used, 10)
  assert.equal(r.projected, 15)
  assert.equal(r.overBy, null)
})

test('quota: over the limit reports by how much', () => {
  const r = evaluateQuota({ ...base, rule: ED, quantity: 15, transactions: [T({ quantity: 10 })] })!
  assert.equal(r.projected, 25)
  assert.equal(r.overBy, 5)
})

test('quota: exactly at the limit is fine', () => {
  const r = evaluateQuota({ ...base, rule: ED, quantity: 10, transactions: [T({ quantity: 10 })] })!
  assert.equal(r.overBy, null)
})

test('quota: Not Confirmed (merits deducted) counts; Pending and Cancelled do not', () => {
  const r = evaluateQuota({
    ...base, rule: ED, quantity: 1,
    transactions: [
      T({ status: 'Not Confirmed', quantity: 4 }),
      T({ status: 'Pending', meritsDeducted: 0, quantity: 7, confirmationDate: null }),
      T({ status: 'Cancelled', meritsDeducted: 0, quantity: 9 }),
    ],
  })!
  assert.equal(r.used, 4)
  assert.equal(r.pending, 7)
})

test('quota: only this month, this privilege, this cadet', () => {
  const r = evaluateQuota({
    ...base, rule: ED, quantity: 1,
    transactions: [
      T({ quantity: 3 }),
      T({ quantity: 50, confirmationDate: '2026-09-30' }),
      T({ quantity: 50, privilegeId: 'offset-demerits' }),
      T({ quantity: 50, cadetId: 'C2', cadetName: 'Reyes' }),
    ],
  })!
  assert.equal(r.used, 3)
})

test('quota: same batch rows for the same cadet add up', () => {
  const r = evaluateQuota({ ...base, rule: ED, quantity: 8, alsoInBatch: 8, transactions: [T({ quantity: 6 })] })!
  assert.equal(r.projected, 22)
  assert.equal(r.overBy, 2)
})

test('semester quota: uses the admin-set dates', () => {
  const r = evaluateQuota({
    ...base, privilegeId: 'offset-demerits', rule: DR, quantity: 10,
    transactions: [T({ privilegeId: 'offset-demerits', quantity: 25, confirmationDate: '2026-08-20' })],
  })!
  assert.equal(r.used, 25)
  assert.equal(r.overBy, 5)
})

test('semester quota: notice (no crash) when dates are missing or the date is outside', () => {
  const a = evaluateQuota({ ...base, rule: DR, quantity: 5, semester: null, transactions: [] })!
  assert.ok(a.notice && a.overBy === null)
  const b = evaluateQuota({ ...base, rule: DR, quantity: 5, availmentDate: '2027-02-01', transactions: [] })!
  assert.ok(b.notice)
})

test('entry max: warns when one entry is bigger, otherwise not', () => {
  assert.equal(evaluateQuota({ ...base, rule: DR, quantity: 18, transactions: [] })!.entryOverBy, 3)
  assert.equal(evaluateQuota({ ...base, rule: DR, quantity: 15, transactions: [] })!.entryOverBy, null)
})

import { usedInPeriod } from '../src/lib/rules.ts'

test('usedInPeriod: monthly ED usage for the current month only', () => {
  const used = usedInPeriod({
    rule: ED, privilegeId: 'reduce-ed', cadetId: 'C1', cadetName: 'Cruz',
    onDate: '2026-10-08', semester: SEM,
    transactions: [T({ quantity: 6 }), T({ quantity: 4, status: 'Not Confirmed' }), T({ quantity: 9, confirmationDate: '2026-09-28' })],
  })
  assert.equal(used, 10)
})

test('usedInPeriod: semester usage, and null when it cannot be worked out', () => {
  const tx = [T({ privilegeId: 'offset-demerits', quantity: 12, confirmationDate: '2026-09-01' })]
  const common = { rule: DR, privilegeId: 'offset-demerits', cadetId: 'C1', cadetName: 'Cruz', transactions: tx }
  assert.equal(usedInPeriod({ ...common, onDate: '2026-10-08', semester: SEM }), 12)
  assert.equal(usedInPeriod({ ...common, onDate: '2026-10-08', semester: null }), null)
  assert.equal(usedInPeriod({ ...common, onDate: '2027-03-01', semester: SEM }), null)
  assert.equal(
    usedInPeriod({ ...common, rule: { quotaLimit: null, quotaPeriod: null, entryMax: null }, onDate: '2026-10-08', semester: SEM }),
    null,
  )
})
