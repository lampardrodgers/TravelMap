import './App.css'
import { useMemo, useState } from 'react'
import { ModeSwitcher } from './components/ModeSwitcher'
import { modes, type ModeId } from './features/modes'

function App() {
  const [activeModeId, setActiveModeId] = useState<ModeId>('compare')
  const activeMode = useMemo(() => modes.find((mode) => mode.id === activeModeId) ?? modes[0], [activeModeId])

  const switcher = (
    <ModeSwitcher
      modes={modes.map((mode) => ({ id: mode.id, label: mode.label, description: mode.description }))}
      activeId={activeMode.id}
      onChange={(id) => setActiveModeId(id as ModeId)}
    />
  )

  const ActiveComponent = activeMode.Component
  return <ActiveComponent modeSwitcher={switcher} />
}

export default App
