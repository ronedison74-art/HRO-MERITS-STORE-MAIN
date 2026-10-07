import { useEffect, useState } from 'react'
import { useToast } from '@/components/Toast'
import { saveSemester } from '@/lib/meritStore'

/** Admin: current semester start/end. Used by "per semester" quotas. */
export function SemesterSettings({
  semester,
}: {
  semester: { start: string; end: string } | null
}) {
  const { show } = useToast()
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setStart(semester?.start ?? '')
    setEnd(semester?.end ?? '')
  }, [semester?.start, semester?.end])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!start || !end) {
      show('Pick both a start and an end date.', 'bad')
      return
    }
    if (end < start) {
      show('The end date must be on or after the start date.', 'bad')
      return
    }
    setBusy(true)
    try {
      await saveSemester(start, end)
      show('Semester dates saved.', 'ok')
    } catch (err: any) {
      show(err?.message || 'Could not save the semester dates.', 'bad')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card" style={{ marginTop: 24 }}>
      <div className="card-title" style={{ marginBottom: 4 }}>
        Current Semester
      </div>
      <div className="field-hint" style={{ marginBottom: 12 }}>
        Used by quotas set to &quot;per semester&quot; (e.g. Offset Demerits). Update these when a new
        semester starts, since usage is counted inside these dates.
        {!semester && (
          <strong> Not set yet — semester quotas can't be checked until you save dates.</strong>
        )}
      </div>
      <form onSubmit={handleSave} className="form-grid" style={{ alignItems: 'end' }}>
        <div className="field">
          <label htmlFor="sem-start">Start date</label>
          <input id="sem-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="sem-end">End date</label>
          <input id="sem-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <div>
          <button type="submit" className="sub-btn blue" disabled={busy}>
            Save semester
          </button>
        </div>
      </form>
    </div>
  )
}
