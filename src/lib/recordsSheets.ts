import type { Transaction } from '@/lib/meritStore'

// Pure model of the Records → Excel workbook (one sheet per privilege), so the
// layout can be unit-tested without a spreadsheet library.

export type Align = 'left' | 'center'

export interface SheetCell {
  value: string | number
  align: Align
  /** Text colour as RRGGBB (batch years are colour-coded). */
  color?: string
}

export interface SheetModel {
  name: string
  columns: string[]
  rows: SheetCell[][]
}

const ED_ID = 'reduce-ed'
const DR_ID = 'offset-demerits'

/** Batch year colours used in the officer sheets. */
const BATCH_COLORS: Record<string, string> = {
  '2024': 'FF0000', // red
  '2025': '00B050', // green
  '2026': '0070C0', // blue
}

export function batchColor(batch: string): string | undefined {
  return BATCH_COLORS[batch.trim()]
}

/** What the officer must do, in words. */
export function officerInstruction(t: Transaction): string {
  if (t.privilegeType !== 'ACCOUNTABILITY' || t.quantity == null) return ''
  // Not Logged: merits were deducted, nothing is reduced, and the cadet is sanctioned.
  if (t.status === 'Not Confirmed') {
    if (t.privilegeId === ED_ID) return 'Not logged: sanction this cadet (no ED reduction)'
    if (t.privilegeId === DR_ID) return 'Not logged: sanction this cadet (no demerit offset)'
    return `Not logged: sanction this cadet (${t.privilegeName})`
  }
  if (t.privilegeId === ED_ID) return `Reduce ${t.quantity} ED hour(s) for this cadet`
  if (t.privilegeId === DR_ID) return `Offset ${t.quantity} demerit(s) for this cadet`
  return `Process quantity ${t.quantity} (${t.privilegeName})`
}

/** Oldest batch first; unknown batches last. Keeps the incoming order inside a batch. */
function sortByBatch(list: Transaction[]): Transaction[] {
  const key = (t: Transaction) => {
    const n = Number(t.batch)
    return Number.isFinite(n) && t.batch.trim() !== '' ? n : Number.POSITIVE_INFINITY
  }
  return list
    .map((t, i) => ({ t, i }))
    .sort((a, b) => key(a.t) - key(b.t) || a.i - b.i)
    .map((x) => x.t)
}

function safeSheetName(raw: string, used: Set<string>): string {
  const base = raw.replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Sheet'
  let name = base
  for (let i = 2; used.has(name.toLowerCase()); i++) {
    const suffix = ` ${i}`
    name = base.slice(0, 31 - suffix.length) + suffix
  }
  used.add(name.toLowerCase())
  return name
}

const nameCell = (t: Transaction): SheetCell => ({ value: t.cadetName, align: 'left' })
const batchCell = (t: Transaction): SheetCell => ({
  value: t.batch || '',
  align: 'center',
  color: batchColor(t.batch || ''),
})
const centered = (value: string | number): SheetCell => ({ value, align: 'center' })

function accountabilitySheet(
  name: string,
  qtyHeader: string,
  list: Transaction[],
): SheetModel {
  return {
    name,
    columns: ['Cadet Name', 'Batch', 'Privilege', qtyHeader, 'Officer Action'],
    rows: sortByBatch(list).map((t) => [
      nameCell(t),
      batchCell(t),
      centered(t.privilegeName),
      centered(t.quantity ?? ''),
      centered(officerInstruction(t)),
    ]),
  }
}

function regularSheet(name: string, list: Transaction[]): SheetModel {
  return {
    name,
    columns: ['Cadet Name', 'Batch', 'Privilege', 'Availment Date', 'Status'],
    rows: sortByBatch(list).map((t) => [
      nameCell(t),
      batchCell(t),
      centered(t.privilegeName),
      centered(t.availmentDate),
      centered(t.status),
    ]),
  }
}

/**
 * ED and DR sheets always come first (header only when empty), like the officer's
 * sample; every other privilege that has rows gets its own sheet after them.
 */
export function buildRecordsSheets(transactions: Transaction[]): SheetModel[] {
  const used = new Set<string>()
  const byPrivilege = new Map<string, Transaction[]>()
  for (const t of transactions) {
    const list = byPrivilege.get(t.privilegeId) ?? []
    list.push(t)
    byPrivilege.set(t.privilegeId, list)
  }

  const sheets: SheetModel[] = [
    accountabilitySheet(safeSheetName('ED', used), 'Qty to Process', byPrivilege.get(ED_ID) ?? []),
    accountabilitySheet(
      safeSheetName('DR', used),
      'Quantity (ED hrs / Demerits)',
      byPrivilege.get(DR_ID) ?? [],
    ),
  ]

  const others = [...byPrivilege.entries()]
    .filter(([id]) => id !== ED_ID && id !== DR_ID)
    .map(([, list]) => list)
    .sort((a, b) => a[0].privilegeName.localeCompare(b[0].privilegeName))

  for (const list of others) {
    const name = safeSheetName(list[0].privilegeName || 'Privilege', used)
    sheets.push(
      list[0].privilegeType === 'ACCOUNTABILITY'
        ? accountabilitySheet(name, 'Qty to Process', list)
        : regularSheet(name, list),
    )
  }
  return sheets
}

/** Column width (Excel units) that fits 16pt text without cutting it off. */
export function columnWidth(sheet: SheetModel, col: number): number {
  let longest = sheet.columns[col].length
  for (const row of sheet.rows) longest = Math.max(longest, String(row[col].value).length)
  return Math.min(Math.max(Math.ceil(longest * 1.45) + 2, 8), 90)
}
