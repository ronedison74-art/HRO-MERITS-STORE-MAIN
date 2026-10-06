import { useEffect, useState } from 'react'
import {
  loadPrivileges,
  loadTransactions,
  loadCadets,
  subscribe,
  hydrateStore,
  isSharedBackendActive,
  isHydrated,
  getStoreError,
  type Privilege,
  type Transaction,
  type Cadet,
} from './meritStore'
import { useAuth } from './auth'

/**
 * Reads Merit Store data (Supabase, via authenticated server functions) and
 * re-renders whenever any write happens or a poll brings in changes.
 * `ready`   → first load from the database finished.
 * `backend` → the database is reachable right now.
 * `error`   → last load/refresh error (empty when fine).
 */
export function useMeritStore() {
  const { status } = useAuth()
  const [privileges, setPrivileges] = useState<Privilege[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [cadets, setCadets] = useState<Cadet[]>([])
  const [ready, setReady] = useState(false)
  const [backend, setBackend] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (status !== 'signedIn') return
    let cancelled = false

    const refresh = () => {
      if (cancelled) return
      setPrivileges(loadPrivileges())
      setTransactions(loadTransactions())
      setCadets(loadCadets())
      setBackend(isSharedBackendActive())
      setError(getStoreError())
      setReady(isHydrated())
    }

    refresh()
    const unsub = subscribe(refresh)
    void hydrateStore().then(refresh)

    return () => {
      cancelled = true
      unsub()
    }
  }, [status])

  return { privileges, transactions, cadets, ready, backend, error }
}
