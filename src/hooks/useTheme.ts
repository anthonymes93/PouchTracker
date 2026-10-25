import { useContext } from 'react'
import { PreferencesContext } from '../contexts/PreferencesContext'
export function useTheme() {
  const value = useContext(PreferencesContext)
  if (!value) throw new Error('useTheme requires PreferencesProvider')
  return value
}
