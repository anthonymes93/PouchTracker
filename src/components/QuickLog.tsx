import { useState } from 'react'
import { Cigarette, Flame, Plus } from 'lucide-react'
import { useNicotineEntries } from '../hooks/useNicotineEntries'
import { CigarLogPanel } from './CigarLogPanel'
export function QuickLog() {
  const { log, cooldown } = useNicotineEntries()
  const [showPrices, setShowPrices] = useState(false)
  return <section className="quick-section" aria-labelledby="quick-title"><div className="section-label"><h2 id="quick-title">Quick log</h2><span className="small-muted">One tap. A little more awareness.</span></div><div className="quick-buttons"><button className="primary-button" disabled={cooldown} onClick={() => log('pouch')}><Plus size={20} /> Log Pouch</button><button className="secondary-button" disabled={cooldown} onClick={() => log('cigarette')}><Cigarette size={19} /> Log Cigarette</button><button className="secondary-button" disabled={cooldown} onClick={() => setShowPrices(true)}><Flame size={19} /> Log Cigar</button></div>
    {showPrices && <CigarLogPanel onClose={() => setShowPrices(false)} />}
  </section>
}
