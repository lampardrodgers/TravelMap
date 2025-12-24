import type {
  CandidatesResponse,
  CompareResponse,
  LngLat,
  ResolvedPlace,
  RecompareResponse,
  RouteResponse,
} from '../domain/types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

async function parseJsonOrThrow(resp: Response) {
  const text = await resp.text()
  const json = text ? (JSON.parse(text) as unknown) : null
  if (!resp.ok) {
    let message = `${resp.status} ${resp.statusText}`
    if (isRecord(json) && typeof json.error === 'string') {
      message = json.error
    }
    throw new Error(message)
  }
  return json
}

export async function comparePlaces(payload: {
  city?: string
  cityLimit?: boolean
  hotels: string[]
  places: string[]
  reversePlaces?: boolean[]
  transitStrategy?: number
  maxTransitPlans?: number
  amapKey?: string
}): Promise<CompareResponse> {
  const resp = await fetch('/api/compare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return (await parseJsonOrThrow(resp)) as CompareResponse
}

export async function recompareResolved(payload: {
  city?: string
  hotels: ResolvedPlace[]
  places: ResolvedPlace[]
  reversePlaces?: boolean[]
  transitStrategy?: number
  maxTransitPlans?: number
  onlyPlaceIdx?: number | null
  onlyHotelIdx?: number | null
  amapKey?: string
}): Promise<RecompareResponse> {
  const resp = await fetch('/api/recompare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return (await parseJsonOrThrow(resp)) as RecompareResponse
}

export async function fetchCandidates(payload: {
  text: string
  city?: string
  cityLimit?: boolean
  limit?: number
  amapKey?: string
}): Promise<CandidatesResponse> {
  const resp = await fetch('/api/candidates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return (await parseJsonOrThrow(resp)) as CandidatesResponse
}

export async function fetchRoute(payload: {
  mode: 'driving' | 'transit' | 'walking' | 'cycling'
  origin: LngLat
  destination: LngLat
  city?: string
  cityd?: string
  strategy?: number
  planIndex?: number
  amapKey?: string
}): Promise<RouteResponse> {
  const resp = await fetch('/api/route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return (await parseJsonOrThrow(resp)) as RouteResponse
}
