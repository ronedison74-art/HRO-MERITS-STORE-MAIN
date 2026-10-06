import * as XLSX from 'xlsx'
import type { Transaction } from '@/lib/meritStore'
import { accountabilityQuantityLabel } from '@/lib/meritStore'

/** Human label for how many units the officer must process. */
export function quantityForOfficer(t: Transaction): string {
  if (t.privilegeType !== 'ACCOUNTABILITY') return ''
  if (t.quantity == null || t.quantity === 0) return ''
  if (t.privilegeId === 'reduce-ed') return String(t.quantity)
  if (t.privilegeId === 'offset-demerits') return String(t.quantity)
  return String(t.quantity)
}

export function quantityUnitLabel(t: Transaction): string {
  if (t.privilegeType !== 'ACCOUNTABILITY') return ''
  return accountabilityQuantityLabel(t.privilegeId)
}

/** Instruction line for the duty officer (ED / demerit desk). */
export function officerInstruction(t: Transaction): string {
  if (t.privilegeType !== 'ACCOUNTABILITY' || t.quantity == null) return ''
  if (t.privilegeId === 'reduce-ed') {
    return `Reduce ${t.quantity} ED hour(s) for this cadet`
  }
  if (t.privilegeId === 'offset-demerits') {
    return `Offset ${t.quantity} demerit(s) for this cadet`
  }
  return `Process quantity ${t.quantity} (${t.privilegeName})`
}

function rateFor(t: Transaction): string | number {
  if (t.privilegeType !== 'ACCOUNTABILITY') return ''
  if (t.quantity && t.quantity > 0) return t.meritCost / t.quantity
  return ''
}

/**
 * Officer-ready workbook:
 * Sheet 1 — All filtered records
 * Sheet 2 — Accountability only (Reduce ED / Offset Demerits) for the processing officer
 */
export function downloadRecordsExcel(transactions: Transaction[], filename?: string) {
  const allRows = transactions.map((t) => ({
    'Transaction ID': t.id,
    'Cadet Name': t.cadetName,
    'Cadet ID': t.cadetId || '',
    Batch: t.batch || '',
    Privilege: t.privilegeName,
    Type: t.privilegeType === 'ACCOUNTABILITY' ? 'Accountability' : 'Regular',
    'Quantity (ED hrs / Demerits)': quantityForOfficer(t),
    'Quantity Unit': quantityUnitLabel(t),
    'Rate (merits per unit)': rateFor(t),
    'Total Merit Cost': t.meritCost,
    'Availment Date': t.availmentDate,
    'Confirmation Date': t.confirmationDate || '',
    Status: t.status,
    'Merits Deducted': t.meritsDeducted,
    Violation: t.violation ? 'YES' : 'NO',
    'Processed By': t.processedBy || '',
    Remarks: t.remarks || '',
    'Officer Action': officerInstruction(t),
  }))

  const accountability = transactions.filter((t) => t.privilegeType === 'ACCOUNTABILITY')
  const officerRows = accountability.map((t) => ({
    'Cadet Name': t.cadetName,
    'Cadet ID': t.cadetId || '',
    Batch: t.batch || '',
    Privilege: t.privilegeName,
    'Qty to Process': quantityForOfficer(t),
    Unit: quantityUnitLabel(t),
    'Officer Action': officerInstruction(t),
    'Availment Date': t.availmentDate,
    Status: t.status,
    'Transaction ID': t.id,
    Remarks: t.remarks || '',
  }))

  const wb = XLSX.utils.book_new()

  const wsAll = XLSX.utils.json_to_sheet(allRows)
  wsAll['!cols'] = colWidths(allRows)
  XLSX.utils.book_append_sheet(wb, wsAll, 'All Records')

  const wsOff =
    officerRows.length > 0
      ? XLSX.utils.json_to_sheet(officerRows)
      : XLSX.utils.aoa_to_sheet([
          [
            'Cadet Name',
            'Cadet ID',
            'Batch',
            'Privilege',
            'Qty to Process',
            'Unit',
            'Officer Action',
            'Availment Date',
            'Status',
            'Transaction ID',
            'Remarks',
          ],
          ['(No Reduce ED / Offset Demerits rows in this export)'],
        ])
  wsOff['!cols'] = [
    { wch: 28 },
    { wch: 12 },
    { wch: 10 },
    { wch: 18 },
    { wch: 14 },
    { wch: 22 },
    { wch: 40 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 24 },
  ]
  XLSX.utils.book_append_sheet(wb, wsOff, 'For Officer (ED-Demerit)')

  const name =
    filename ||
    `merit-store-records-${new Date().toISOString().slice(0, 10)}.xlsx`
  XLSX.writeFile(wb, name)
}

function colWidths(rows: Record<string, unknown>[]): { wch: number }[] {
  if (rows.length === 0) return []
  const keys = Object.keys(rows[0])
  return keys.map((k) => {
    let max = k.length
    for (const r of rows) {
      const len = String(r[k] ?? '').length
      if (len > max) max = len
    }
    return { wch: Math.min(Math.max(max + 2, 10), 40) }
  })
}
