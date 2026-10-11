import { useEffect, useMemo, useRef, useState } from 'react'
import type { Cadet } from '@/lib/meritStore'

/**
 * Searchable cadet dropdown. Filters by name, id, or batch as the user types.
 * Selecting a cadet fills id/name/batch. Shows available merits.
 */
export function CadetPicker({
  cadets,
  value,
  onChange,
  placeholder = 'Search cadet name, ID, or batch…',
  id,
}: {
  cadets: Cadet[]
  value: { cadetId: string; cadetName: string; batch: string }
  onChange: (next: { cadetId: string; cadetName: string; batch: string }) => void
  placeholder?: string
  id?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value.cadetName)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setQuery(value.cadetName)
  }, [value.cadetName, value.cadetId])

  const selected = useMemo(
    () => (value.cadetId ? cadets.find((c) => c.id === value.cadetId) : undefined),
    [cadets, value.cadetId],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return cadets.slice(0, 30)
    return cadets
      .filter((c) => `${c.id} ${c.name} ${c.batch}`.toLowerCase().includes(q))
      .slice(0, 30)
  }, [cadets, query])

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  function selectCadet(c: Cadet) {
    onChange({ cadetId: c.id, cadetName: c.name, batch: c.batch })
    setQuery(c.name)
    setOpen(false)
  }

  function onInputChange(text: string) {
    setQuery(text)
    setOpen(true)
    onChange({ cadetId: '', cadetName: text, batch: '' })
  }

  return (
    <div className="cadet-picker" ref={wrapRef} style={{ position: 'relative' }}>
      <input
        id={id}
        type="text"
        autoComplete="off"
        placeholder={placeholder}
        value={query}
        onChange={(e) => onInputChange(e.target.value)}
        onFocus={() => setOpen(true)}
      />
      {value.cadetId && (
        <div className="field-hint" style={{ marginTop: 4 }}>
          {value.cadetId}
          {value.batch ? ` · ${value.batch}` : ''}
          {selected != null ? ` · ${selected.availableMerits} merits available` : ''}
        </div>
      )}
      {open && (
        <div
          className="cadet-picker-menu"
          style={{
            position: 'absolute',
            zIndex: 40,
            left: 0,
            right: 0,
            top: '100%',
            marginTop: 4,
            maxHeight: 260,
            overflowY: 'auto',
            background: 'var(--bg2, #0f172a)',
            border: '1px solid var(--bd, #334155)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,.35)',
          }}
        >
          {cadets.length === 0 && (
            <div className="field-hint" style={{ padding: 12 }}>
              No cadets in roster. Add them under Admin → Cadet Roster.
            </div>
          )}
          {cadets.length > 0 && filtered.length === 0 && (
            <div className="field-hint" style={{ padding: 12 }}>
              No match — you can still type a free-text name.
            </div>
          )}
          {filtered.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => selectCadet(c)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '10px 12px',
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid var(--bd, #1e293b)',
                color: 'var(--tx, #e2e8f0)',
                cursor: 'pointer',
                fontSize: 14,
              }}
              onMouseDown={(e) => e.preventDefault()}
            >
              <div style={{ fontWeight: 600 }}>{c.name}</div>
              <div className="field-hint" style={{ marginTop: 2 }}>
                {c.id} · {c.batch || '—'} · {c.availableMerits} merits
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
