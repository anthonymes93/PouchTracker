import { useState } from 'react'
import { Cigarette, Flame, Plus } from 'lucide-react'
import { useNicotineEntries } from '../hooks/useNicotineEntries'
import { CigarLogPanel } from './CigarLogPanel'
export function QuickLog() {
  const { log, cooldown } = useNicotineEntries()
  return <div className="pouch-action"><button className="primary-button" disabled={cooldown} onClick={() => log('pouch')}><Plus size={20} /> Log Pouch</button></div>
}
export function OtherLogging() {
  const { log, cooldown } = useNicotineEntries()
  const [showPrices, setShowPrices] = useState(false)
  return <section className="other-logging" aria-labelledby="other-logging-title"><h2 id="other-logging-title">Other Logging</h2><div className="other-logging-buttons"><button className="secondary-button" disabled={cooldown} onClick={() => log('cigarette')}><Cigarette size={18} /> Log Cigarette</button><button className="secondary-button" disabled={cooldown} onClick={() => setShowPrices(true)}><Flame size={18} /> Log Cigar</button></div>
    {showPrices && <CigarLogPanel onClose={() => setShowPrices(false)} />}
  </section>
}
