import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildQuota, todayIn } from '../src/server/quota.server.ts'

/** Minimal fake of the Supabase query builder: returns canned rows per table, ignores filters. */
function fakeSb(tables: Record<string, any[]>, errors: Record<string, string> = {}) {
  return {
    from(table: string) {
      const result = errors[table]
        ? { data: null, error: { message: errors[table] } }
        : { data: tables[table] ?? [], error: null }
      const b: any = new Proxy({}, {
        get(_t, prop) {
          if (prop === 'then') return (res: any) => res(result)
          return () => b
        },
      })
      return b
    },
  }
}

const privs = [
  { id: 'reduce-ed', quota_limit: 20, quota_period: 'month', entry_max: null },
  { id: 'offset-demerits', quota_limit: 30, quota_period: 'semester', entry_max: 15 },
]
const settings = [
  { key: 'semester_start', value: '2026-08-01' },
  { key: 'semester_end', value: '2026-12-15' },
]
const tx = (o: any) => ({
  id: 'MS-1', privilege_id: 'reduce-ed', cadet_id: 'C1', cadet_name: 'DE JESUS, RON EDISON T.',
  status: 'Confirmed', merits_deducted: 10, quantity: 5, confirmation_date: '2026-10-03', ...o,
})
const cadet = [{ id: 'C1', name: 'DE JESUS, RON EDISON T.' }]

test('returns ED (this month) and DR (this semester) usage', async () => {
  const sb = fakeSb({
    ms_cadets: cadet, ms_privileges: privs, ms_settings: settings,
    ms_transactions: [
      tx({ id: 'MS-1', quantity: 6 }),
      tx({ id: 'MS-2', quantity: 4, status: 'Not Confirmed' }),
      tx({ id: 'MS-3', quantity: 9, confirmation_date: '2026-09-20' }), // last month → not ED
      tx({ id: 'MS-4', privilege_id: 'offset-demerits', quantity: 12, confirmation_date: '2026-09-02' }),
    ],
  })
  const r = await buildQuota(sb, 'de jesus, ron edison t.', '2026-10-08')
  assert.equal(r.found, true)
  assert.equal(r.ed, 10)
  assert.equal(r.dr, 12 + 0) // ED rows belong to the other privilege
  assert.equal(r.edLimit, 20)
  assert.equal(r.drLimit, 30)
})

test('the same transaction found by id and by name is counted once', async () => {
  const same = tx({ id: 'MS-9', quantity: 7 })
  const sb = fakeSb({ ms_cadets: cadet, ms_privileges: privs, ms_settings: settings, ms_transactions: [same, same] })
  const r = await buildQuota(sb, 'x', '2026-10-08')
  assert.equal(r.ed, 7)
})

test('unknown or ambiguous cadet → found:false (no data leaked)', async () => {
  assert.deepEqual(await buildQuota(fakeSb({ ms_cadets: [] }), 'Nobody', '2026-10-08'), { found: false })
  const two = [{ id: 'A', name: 'Same' }, { id: 'B', name: 'Same' }]
  assert.deepEqual(await buildQuota(fakeSb({ ms_cadets: two }), 'Same', '2026-10-08'), { found: false })
})

test('DR is null (not 0) when semester dates are not set', async () => {
  const sb = fakeSb({ ms_cadets: cadet, ms_privileges: privs, ms_settings: [], ms_transactions: [] })
  const r = await buildQuota(sb, 'x', '2026-10-08')
  assert.equal(r.ed, 0)
  assert.equal(r.dr, null)
})

test('database errors are thrown, not hidden', async () => {
  await assert.rejects(buildQuota(fakeSb({ ms_cadets: cadet }, { ms_privileges: 'boom' }), 'x', '2026-10-08'), /boom/)
})

test('todayIn uses the requested timezone at the day boundary', () => {
  const t = new Date('2026-10-31T17:00:00Z') // 01:00 on Nov 1 in Manila
  assert.equal(todayIn('Asia/Manila', t), '2026-11-01')
  assert.equal(todayIn('UTC', t), '2026-10-31')
})
