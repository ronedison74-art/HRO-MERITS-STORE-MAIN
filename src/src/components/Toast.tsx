import { createContext, useCallback, useContext, useRef, useState } from 'react'

type ToastVariant = 'ok' | 'bad' | 'info'
interface ToastMsg {
  id: number
  text: string
  variant: ToastVariant
}

const ToastCtx = createContext<{ show: (text: string, variant?: ToastVariant) => void }>({
  show: () => {},
})

export function useToast() {
  return useContext(ToastCtx)
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastMsg | null>(null)
  const [visible, setVisible] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  const show = useCallback((text: string, variant: ToastVariant = 'ok') => {
    setToast({ id: Date.now(), text, variant })
    setVisible(true)
    if (timer.current) window.clearTimeout(timer.current)
    // Hide (fade out) but keep the text so it doesn't vanish mid-fade.
    timer.current = window.setTimeout(() => setVisible(false), 2600)
  }, [])

  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      <div
        className={`toast t-${toast?.variant ?? 'ok'} ${visible ? 'show' : ''}`}
        role="status"
        aria-live="polite"
      >
        {toast?.text}
      </div>
    </ToastCtx.Provider>
  )
}
