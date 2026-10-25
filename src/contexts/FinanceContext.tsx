import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { EMPTY_FINANCE, listenFinance } from '../services/finance'
import type { FinanceData } from '../services/finance'
import { dataErrorMessage } from '../utils/dataErrors'
import { useLocation } from 'react-router'
interface State extends FinanceData { uid: string; error: string | null; retry: () => void }
const FinanceContext = createContext<State | undefined>(undefined)
export function FinanceProvider({ uid, children }: { uid: string; children: ReactNode }) {
  const skipEntries = useLocation().pathname === '/calendar'
  const [data, setData] = useState(EMPTY_FINANCE)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    setData(EMPTY_FINANCE); setError(null)
    return listenFinance(uid, value => setData(value), err => { setError(dataErrorMessage(err)); setData(value => ({ ...value, loading: false })) }, skipEntries)
  }, [uid, attempt, skipEntries])
  return <FinanceContext.Provider value={{ ...data, uid, error, retry: () => setAttempt(value => value + 1) }}>{children}</FinanceContext.Provider>
}
export function useFinance() {
  const value = useContext(FinanceContext)
  if (!value) throw new Error('useFinance requires FinanceProvider')
  return value
}
