import type { Transaction } from '@/lib/meritStore'
import { buildRecordsSheets, columnWidth, type SheetModel } from './recordsSheets.ts'

const BLACK = '000000'
const FONT = { name: 'Calibri', sz: 16 }
const THIN = { style: 'thin', color: { rgb: BLACK } }
const BORDER = { top: THIN, bottom: THIN, left: THIN, right: THIN }

/** Turn the sheet model into a styled worksheet (Calibri 16, thin borders, centered). */
export function modelToWorksheet(XLSX: any, sheet: SheetModel) {
  const ws: Record<string, any> = {}

  const put = (r: number, c: number, value: string | number, style: any) => {
    const ref = XLSX.utils.encode_cell({ r, c })
    ws[ref] = {
      v: value,
      t: typeof value === 'number' ? 'n' : 's',
      s: style,
    }
  }

  sheet.columns.forEach((title, c) =>
    put(0, c, title, {
      font: { ...FONT, color: { rgb: BLACK } },
      border: BORDER,
      alignment: { horizontal: 'center' },
    }),
  )

  sheet.rows.forEach((row, i) =>
    row.forEach((cell, c) =>
      put(i + 1, c, cell.value, {
        font: { ...FONT, color: { rgb: cell.color ?? BLACK } },
        border: BORDER,
        alignment: { horizontal: cell.align },
      }),
    ),
  )

  ws['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: sheet.rows.length, c: sheet.columns.length - 1 },
  })
  ws['!cols'] = sheet.columns.map((_, c) => ({ wch: columnWidth(sheet, c) }))
  ws['!rows'] = Array.from({ length: sheet.rows.length + 1 }, () => ({ hpt: 24 }))
  return ws
}

export function buildRecordsWorkbook(XLSX: any, transactions: Transaction[]) {
  const wb = XLSX.utils.book_new()
  for (const sheet of buildRecordsSheets(transactions)) {
    XLSX.utils.book_append_sheet(wb, modelToWorksheet(XLSX, sheet), sheet.name)
  }
  return wb
}

/**
 * Records → Excel. One sheet per privilege: ED and DR first (officer layout),
 * then Phone, Liberty, … Exports exactly the rows currently shown on Records.
 */
export async function downloadRecordsExcel(transactions: Transaction[], filename?: string) {
  // Loaded on demand: xlsx-js-style is SheetJS plus cell styling.
  const XLSX = await import('xlsx-js-style')
  const wb = buildRecordsWorkbook(XLSX, transactions)
  const name =
    filename || `merit-store-records-${new Date().toISOString().slice(0, 10)}.xlsx`
  XLSX.writeFile(wb, name)
}
