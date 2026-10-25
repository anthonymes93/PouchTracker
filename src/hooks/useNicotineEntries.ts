import { useContext } from 'react'
import { EntriesContext } from '../contexts/EntriesContext'
export function useNicotineEntries() {
  const value = useContext(EntriesContext)
  if (!value) throw new Error('useNicotineEntries requires EntriesProvider')
  return value
}
