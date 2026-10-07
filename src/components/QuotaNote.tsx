import type { QuotaResult } from '@/lib/rules'

const warn = {
  marginTop: 6,
  padding: '6px 10px',
  borderRadius: 6,
  fontSize: 13,
  lineHeight: 1.4,
  background: 'rgba(245, 158, 11, 0.12)',
  border: '1px solid rgba(245, 158, 11, 0.5)',
  color: '#b45309',
} as const

/** Quota info + warnings on Encode. Never blocks submitting. */
export function QuotaNote({ result }: { result: QuotaResult }) {
  const { limit, used, pending, projected, overBy, periodLabel, notice, entryMax, entryOverBy } =
    result

  return (
    <div role="status">
      {notice && <div style={warn}>⚠️ {notice}</div>}

      {!notice && limit != null && (
        <div className="field-hint" style={{ marginTop: 6 }}>
          Quota {periodLabel}: <strong>{used}</strong> of <strong>{limit}</strong> used
          {pending > 0 ? ` (+${pending} pending, not counted yet)` : ''}
        </div>
      )}

      {overBy != null && projected != null && limit != null && (
        <div style={warn}>
          ⚠️ This entry would bring {periodLabel}&apos;s total to <strong>{projected}</strong>, over
          the quota of {limit} by <strong>{overBy}</strong>. You can still encode it.
        </div>
      )}

      {entryOverBy != null && entryMax != null && (
        <div style={warn}>
          ⚠️ This entry is <strong>{entryMax + entryOverBy}</strong>; the usual maximum per entry is{' '}
          {entryMax}. You can still encode it (e.g. special cases).
        </div>
      )}
    </div>
  )
}
