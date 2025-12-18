import type { ReactNode } from 'react'

function IconBase({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      {children}
    </svg>
  )
}

export function CarIcon() {
  return (
    <IconBase>
      <path
        d="M5 16l1.2-6.2A3 3 0 0 1 9.1 7h5.8a3 3 0 0 1 2.9 2.8L19 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M6 16h12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="7.5" cy="16.8" r="1.6" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="16.5" cy="16.8" r="1.6" fill="none" stroke="currentColor" strokeWidth="2" />
    </IconBase>
  )
}

export function SubwayIcon() {
  return (
    <IconBase>
      <path
        d="M8 18h8M9 21l1-3m5 3l-1-3M7 10a5 5 0 0 1 10 0v6a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-6Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="14" r="1" fill="currentColor" />
      <circle cx="14" cy="14" r="1" fill="currentColor" />
    </IconBase>
  )
}

export function BusIcon() {
  return (
    <IconBase>
      <path
        d="M7 17h10a2 2 0 0 0 2-2V8a3 3 0 0 0-3-3H8a3 3 0 0 0-3 3v7a2 2 0 0 0 2 2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M7 11h12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="9" cy="17.5" r="1.2" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="15" cy="17.5" r="1.2" fill="none" stroke="currentColor" strokeWidth="2" />
    </IconBase>
  )
}

export function WalkIcon() {
  return (
    <IconBase>
      <path
        d="M12 5a1.5 1.5 0 1 0 0.001 3.001A1.5 1.5 0 0 0 12 5Z"
        fill="currentColor"
      />
      <path
        d="M11 9l2 2 2 1m-2-2l-1 4 2 2 1 4M10 13l-2 2-2 1"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </IconBase>
  )
}

export function PinIcon() {
  return (
    <IconBase>
      <path
        d="M12 21s7-5.1 7-11a7 7 0 1 0-14 0c0 5.9 7 11 7 11Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10" r="2" fill="none" stroke="currentColor" strokeWidth="2" />
    </IconBase>
  )
}

export function ClockIcon() {
  return (
    <IconBase>
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 8v5l3 2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </IconBase>
  )
}

export function CoinIcon() {
  return (
    <IconBase>
      <ellipse cx="12" cy="7.5" rx="6.5" ry="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M5.5 7.5v9c0 1.7 2.9 3 6.5 3s6.5-1.3 6.5-3v-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.5 12c0 1.7 2.9 3 6.5 3s6.5-1.3 6.5-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </IconBase>
  )
}
