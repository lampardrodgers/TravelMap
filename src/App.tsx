import './App.css'
import { useMemo, useState } from 'react'
import { ModeSwitcher } from './components/ModeSwitcher'
import { modes, type ModeId } from './features/modes'

const LOCK_STORAGE_KEY = 'tm-functionlock-cache'
const HOUR_MS = 60 * 60 * 1000

const parseLockHours = (value: string | undefined) => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const hours = Number.parseFloat(trimmed)
  if (!Number.isFinite(hours) || hours <= 0) return null
  return hours
}

const readUnlockCache = () => {
  const raw = localStorage.getItem(LOCK_STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { ts?: number; lock?: string }
    if (!parsed || typeof parsed.ts !== 'number' || typeof parsed.lock !== 'string') return null
    return { ts: parsed.ts, lock: parsed.lock }
  } catch {
    return null
  }
}

function App() {
  const functionLock = typeof import.meta.env.functionlock === 'string' ? import.meta.env.functionlock.trim() : ''
  const lockEnabled = functionLock.length > 0
  const lockHours = lockEnabled ? parseLockHours(import.meta.env.functionlock_hours) : null
  const cacheEnabled = lockEnabled && lockHours !== null
  const [unlockInput, setUnlockInput] = useState('')
  const [unlockError, setUnlockError] = useState('')
  const [unlocked, setUnlocked] = useState(() => {
    if (!lockEnabled) return true
    if (!cacheEnabled || lockHours === null) return false
    const cache = readUnlockCache()
    if (!cache || cache.lock !== functionLock) return false
    return Date.now() - cache.ts <= lockHours * HOUR_MS
  })
  const [activeModeId, setActiveModeId] = useState<ModeId>('compare')
  const activeMode = useMemo(() => modes.find((mode) => mode.id === activeModeId) ?? modes[0], [activeModeId])

  const switcher = (
    <ModeSwitcher
      modes={modes.map((mode) => ({ id: mode.id, label: mode.label, description: mode.description }))}
      activeId={activeMode.id}
      onChange={(id) => setActiveModeId(id as ModeId)}
    />
  )

  if (lockEnabled && !unlocked) {
    return (
      <div className="tm-lock">
        <div className="tm-lock__panel">
          <div className="tm-lock__title">请输入密码</div>
          <form
            className="tm-lock__form"
            onSubmit={(event) => {
              event.preventDefault()
              if (unlockInput === functionLock) {
                setUnlocked(true)
                setUnlockInput('')
                setUnlockError('')
                if (cacheEnabled) {
                  localStorage.setItem(LOCK_STORAGE_KEY, JSON.stringify({ ts: Date.now(), lock: functionLock }))
                }
                return
              }
              setUnlockError('密码不正确，请重试。')
              setUnlockInput('')
            }}
          >
            <div className="tm-field__row">
              <input
                className="tm-input"
                type="password"
                autoFocus
                value={unlockInput}
                onChange={(event) => {
                  setUnlockInput(event.target.value)
                  if (unlockError) setUnlockError('')
                }}
                placeholder="输入密码"
              />
              <button className="tm-btn tm-btn--primary" type="submit">
                解锁
              </button>
            </div>
          </form>
          {unlockError ? <div className="tm-error">{unlockError}</div> : null}
        </div>
      </div>
    )
  }

  const ActiveComponent = activeMode.Component
  return <ActiveComponent modeSwitcher={switcher} />
}

export default App
