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
