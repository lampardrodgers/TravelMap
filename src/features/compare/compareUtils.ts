import type { Comparison, ResolvedPlace, TransitPlanSummary } from '../../domain/types'
import type { Settings, SettingsDraft, TransitLeg, TravelMode } from './types'

export function toErrorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err)
}

export const SETTINGS_STORAGE_KEY = 'travelmap-settings-v1'
export const DEFAULT_SETTINGS: Settings = { amapKey: '', candidateLimit: 8 }

export const clampCandidateLimit = (value: number) => {
  if (!Number.isFinite(value)) return DEFAULT_SETTINGS.candidateLimit
  return Math.max(1, Math.min(20, Math.round(value)))
}

export const loadSettings = (): Settings => {
  if (typeof window === 'undefined') return { ...DEFAULT_SETTINGS }
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<Settings>
    return {
      amapKey: typeof parsed.amapKey === 'string' ? parsed.amapKey : DEFAULT_SETTINGS.amapKey,
      candidateLimit: clampCandidateLimit(Number(parsed.candidateLimit ?? DEFAULT_SETTINGS.candidateLimit)),
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export const saveSettings = (next: Settings) => {
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
}

export const normalizeSettings = (draft: SettingsDraft, fallback: Settings): Settings => {
  const nextLimit = Number.parseInt(draft.candidateLimit, 10)
  return {
    amapKey: draft.amapKey.trim(),
    candidateLimit: Number.isFinite(nextLimit) ? clampCandidateLimit(nextLimit) : fallback.candidateLimit,
  }
}

export const parseLines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

export const normalizeReversePlaces = (len: number, raw?: boolean[]) => Array.from({ length: len }, (_, i) => raw?.[i] === true)

export const normalizeTravelModes = (len: number, raw?: TravelMode[]) =>
  Array.from({ length: len }, (_, i) => {
    const mode = raw?.[i]
    return mode === 'walking' || mode === 'cycling' ? mode : 'driving'
  })

export const formatDistance = (meters: number) => {
  if (!Number.isFinite(meters)) return '-'
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1)} km`
}

export const formatDistanceCompact = (meters: number) => {
  if (!Number.isFinite(meters)) return '-'
  if (meters < 1000) return `${Math.round(meters)}m`
  return `${(meters / 1000).toFixed(1)}km`
}

export const formatDuration = (seconds: number) => {
  if (!Number.isFinite(seconds)) return '-'
  const mins = Math.round(seconds / 60)
  if (mins < 60) return `${mins} 分`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h} 小时 ${m} 分`
}

export const formatDurationCompact = (seconds: number) => {
  if (!Number.isFinite(seconds)) return '-'
  const mins = Math.round(seconds / 60)
  if (mins < 60) return `${mins}分`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h}小时${m}分`
}

export const formatYuan = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-'
  return `¥${value.toFixed(1).replace(/\.0$/, '')}`
}

export const legsFromSummary = (summary: string): TransitLeg[] => {
  const rawParts = summary
    .split('|')
    .flatMap((s) => s.split('→'))
    .map((s) => s.trim())
    .filter(Boolean)

  const legs: TransitLeg[] = []
  for (const part of rawParts) {
    const p = part.replace(/\u00a0/g, ' ')
    if (p.startsWith('步行')) {
      const m = p.match(/步行\s*([\d.]+)\s*(km|m|公里|米)?/i)
      const num = m ? Number(m[1]) : NaN
      const unit = (m?.[2] || 'm').toLowerCase()
      const distanceMeters =
        Number.isFinite(num) ? Math.round(unit === 'km' || unit === '公里' ? num * 1000 : num) : undefined
      legs.push({ kind: 'walking', label: '步行', distanceMeters })
      continue
    }
    if (p.includes('打车')) {
      const m = p.match(/打车\s*([\d.]+)\s*(km|m|公里|米)?/i)
      const num = m ? Number(m[1]) : NaN
      const unit = (m?.[2] || 'm').toLowerCase()
      const distanceMeters =
        Number.isFinite(num) ? Math.round(unit === 'km' || unit === '公里' ? num * 1000 : num) : undefined
      legs.push({ kind: 'taxi', label: '打车', distanceMeters })
      continue
    }
    const short = p.split('(')[0]?.trim() || p
    if (short.includes('地铁')) {
      legs.push({ kind: 'subway', label: short })
      continue
    }
    if (short.endsWith('路') || short.includes('公交')) {
      legs.push({ kind: 'bus', label: short.replace(/^公交/, '') })
      continue
    }
    legs.push({ kind: 'railway', label: short })
  }

  return legs
}

export const getPlanLegs = (plan: TransitPlanSummary): TransitLeg[] => {
  const rawLegs = plan.legs?.length ? (plan.legs as TransitLeg[]) : plan.summary ? legsFromSummary(plan.summary) : []
  if (!plan.summary) return rawLegs
  const parsed = legsFromSummary(plan.summary)
  if (!parsed.length) return rawLegs
  return rawLegs.map((l, idx) => {
    if (l.kind === 'walking' && typeof l.distanceMeters !== 'number') {
      const p = parsed[idx]
      if (p?.kind === 'walking' && typeof p.distanceMeters === 'number') {
        return { ...l, distanceMeters: p.distanceMeters }
      }
    }
    return l
  })
}

export const isSameLocation = (a: { lng: number; lat: number }, b: { lng: number; lat: number }) =>
  Math.abs(a.lng - b.lng) < 1e-6 && Math.abs(a.lat - b.lat) < 1e-6

export const mergeComparisons = (base: Comparison[], updates: Comparison[]) => {
  const idxMap = new Map<string, number>()
  base.forEach((c, i) => idxMap.set(`${c.hotelIdx}-${c.placeIdx}`, i))
  const merged = base.slice()
  for (const c of updates) {
    const key = `${c.hotelIdx}-${c.placeIdx}`
    const i = idxMap.get(key)
    if (i === undefined) merged.push(c)
    else merged[i] = c
  }
  return merged
}

export const candidateKey = (kind: 'hotel' | 'place', idx: number) => `${kind}-${idx}`

export const selectPlaceFromList = (list: ResolvedPlace[], idx: number) => list[idx]
