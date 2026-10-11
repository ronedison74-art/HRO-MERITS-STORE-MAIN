import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Cinematic effects for the homepage. Everything here switches itself off for
// people who prefer reduced motion, and the mouse effects only run on devices
// with a real mouse (not touch screens).

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
const hasMouse = () =>
  typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches

/* ------------------------------------------------------------------ */
/* Backdrop: drifting gold clouds + a light that follows the mouse     */
/* ------------------------------------------------------------------ */

export function LuxBackdrop() {
  const [host, setHost] = useState<HTMLElement | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => setHost(document.body), [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reduce = reducedMotion()
    const mouse = hasMouse()

    let tx = window.innerWidth * 0.5
    let ty = window.innerHeight * 0.32
    let x = tx
    let y = ty
    let raf = 0
    const layers = Array.from(document.querySelectorAll<HTMLElement>('[data-parallax]'))

    const apply = () => {
      el.style.setProperty('--mx', `${x.toFixed(1)}px`)
      el.style.setProperty('--my', `${y.toFixed(1)}px`)
      const sy = window.scrollY
      for (const n of layers) {
        const speed = Number(n.dataset.parallax) || 0
        n.style.transform = `translate3d(0, ${(sy * speed).toFixed(1)}px, 0)`
        const fade = Number(n.dataset.fade)
        if (fade) n.style.opacity = String(Math.max(0, 1 - sy / fade))
      }
    }
    const frame = () => {
      raf = 0
      x += (tx - x) * 0.14
      y += (ty - y) * 0.14
      apply()
      if (Math.abs(tx - x) > 0.4 || Math.abs(ty - y) > 0.4) raf = requestAnimationFrame(frame)
    }
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(frame)
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      tx = e.clientX
      ty = e.clientY
      kick()
    }

    apply()
    if (!reduce) {
      window.addEventListener('scroll', kick, { passive: true })
      if (mouse) window.addEventListener('pointermove', onMove, { passive: true })
    }
    return () => {
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('scroll', kick)
      window.removeEventListener('pointermove', onMove)
      for (const n of layers) {
        n.style.transform = ''
        n.style.opacity = ''
      }
    }
  }, [host])

  if (!host) return null
  return createPortal(
    <div className="lux-backdrop" ref={ref} aria-hidden="true">
      <div className="lux-aurora-wrap" data-parallax="0.08">
        <div className="lux-aurora a1" />
      </div>
      <div className="lux-aurora-wrap" data-parallax="0.16">
        <div className="lux-aurora a2" />
      </div>
      <div className="lux-aurora-wrap" data-parallax="0.28">
        <div className="lux-aurora a3" />
      </div>
      <div className="lux-dots" />
      <div className="lux-spot" />
      <div className="lux-vignette" />
    </div>,
    host,
  )
}

/* ------------------------------------------------------------------ */
/* Title: letters rise in one by one, then a gold shimmer sweeps       */
/* ------------------------------------------------------------------ */

export function LuxTitle({ text }: { text: string }) {
  const ref = useRef<HTMLHeadingElement>(null)

  // Give every letter the same continuous gradient: tell it where it sits in the word.
  useEffect(() => {
    const h = ref.current
    if (!h) return
    const measure = () => {
      const total = h.offsetWidth
      h.querySelectorAll<HTMLElement>('[data-l]').forEach((l) => {
        l.style.setProperty('--ox', `${l.offsetLeft}px`)
        l.style.setProperty('--tw', `${total}px`)
      })
    }
    measure()
    let cancelled = false
    document.fonts?.ready.then(() => {
      if (!cancelled) measure()
    })
    window.addEventListener('resize', measure)
    return () => {
      cancelled = true
      window.removeEventListener('resize', measure)
    }
  }, [text])

  return (
    <h1 className="lux-title" ref={ref} aria-label={text}>
      {Array.from(text).map((ch, i) =>
        ch === ' ' ? (
          <span key={i} className="lux-space" aria-hidden="true">
            &nbsp;
          </span>
        ) : (
          <span key={i} className="lux-mask" aria-hidden="true">
            <span
              data-l
              className="lux-letter"
              style={{ ['--n' as string]: i } as React.CSSProperties}
            >
              {ch}
            </span>
          </span>
        ),
      )}
    </h1>
  )
}

/* ------------------------------------------------------------------ */
/* Scroll reveal                                                       */
/* ------------------------------------------------------------------ */

export function Reveal({
  className = '',
  style,
  children,
}: {
  className?: string
  style?: React.CSSProperties
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      el.classList.add('in')
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('in')
            io.unobserve(e.target)
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div ref={ref} className={`lux-rv ${className}`} style={style}>
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Journey: a gold line that fills as you scroll and lights each step  */
/* ------------------------------------------------------------------ */

export function JourneyTrack({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const lightAll = () => {
      el.style.setProperty('--p', '1')
      el.querySelectorAll('.jr-step').forEach((n) => n.classList.add('lit'))
    }
    if (reducedMotion()) {
      lightAll()
      return
    }

    let raf = 0
    const update = () => {
      raf = 0
      const r = el.getBoundingClientRect()
      const focus = window.innerHeight * 0.58 // the line reaches this height on screen
      const p = Math.min(1, Math.max(0, (focus - r.top) / Math.max(r.height, 1)))
      el.style.setProperty('--p', p.toFixed(4))
      const y = p * r.height
      el.querySelectorAll<HTMLElement>('.jr-step').forEach((step) => {
        step.classList.toggle('lit', step.offsetTop + 54 <= y)
      })
    }
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', kick, { passive: true })
    window.addEventListener('resize', kick)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('scroll', kick)
      window.removeEventListener('resize', kick)
    }
  }, [])

  return (
    <div className="jr-track" ref={ref}>
      <div className="jr-line" aria-hidden="true">
        <div className="jr-fill" />
      </div>
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Number that counts up                                               */
/* ------------------------------------------------------------------ */

export function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(reducedMotion() ? value : 0)
  useEffect(() => {
    if (reducedMotion()) {
      setShown(value)
      return
    }
    const start = performance.now()
    const from = 0
    const dur = 900
    let raf = 0
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / dur)
      const eased = 1 - Math.pow(1 - t, 3)
      setShown(Math.round(from + (value - from) * eased))
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return <>{shown}</>
}

/* ------------------------------------------------------------------ */
/* Edge glow that follows the mouse over a card                        */
/* ------------------------------------------------------------------ */

export const glowHandlers = {
  onPointerMove(e: React.PointerEvent<HTMLElement>) {
    if (e.pointerType !== 'mouse') return
    const el = e.currentTarget
    const r = el.getBoundingClientRect()
    el.style.setProperty('--gx', `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`)
    el.style.setProperty('--gy', `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`)
  },
}
