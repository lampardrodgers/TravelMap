import type { ReactNode } from 'react'

export type ModeOption = {
  id: string
  label: string
  description?: string
}

export function ModeSwitcher({
  modes,
  activeId,
  onChange,
}: {
  modes: ModeOption[]
  activeId: string
  onChange: (id: string) => void
}) {
  return (
    <div className="tm-mode-switcher" role="tablist" aria-label="模式选择">
      {modes.map((mode) => {
        const isActive = mode.id === activeId
        return (
          <button
            key={mode.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`tm-mode-switcher__btn tm-btn tm-btn--small tm-btn--ghost ${isActive ? 'is-active' : ''}`}
            onClick={() => onChange(mode.id)}
            title={mode.description}
          >
            {mode.label}
          </button>
        )
      })}
    </div>
  )
}

export function ModeSwitcherSlot({ children }: { children?: ReactNode }) {
  return <div className="tm-head__modes">{children}</div>
}
