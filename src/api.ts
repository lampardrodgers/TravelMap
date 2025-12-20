export type LngLat = { lng: number; lat: number }

export type ResolvedPlace = {
  input: string
  name: string
  address: string | null
  location: LngLat
  citycode: string | null
  adcode: string | null
  source: 'coord' | 'poi' | 'geocode'
}

export type DrivingSummary = {
  distanceMeters: number
  durationSeconds: number
  taxiCostYuan: number | null
  tollsYuan: number | null
  tollDistanceMeters: number | null
}

export type TransitPlanSummary = {
  durationSeconds: number
  costYuan: number | null
  walkingDistanceMeters: number | null
  summary: string
  hasTaxi: boolean
  legs?: Array<{ kind: 'walking' | 'taxi' | 'bus' | 'subway' | 'railway'; label: string; distanceMeters?: number }>
}

export type TransitSummary = {
  plans: TransitPlanSummary[]
}

export type Comparison = {
  hotelIdx: number
  placeIdx: number
  driving: DrivingSummary | null
  transit: TransitSummary | null
  errors: { driving?: string; transit?: string } | null
}

export type CompareResponse = {
  hotels: ResolvedPlace[]
  places: ResolvedPlace[]
  reversePlaces?: boolean[]
  comparisons: Comparison[]
}

export type RecompareResponse = {
  reversePlaces: boolean[]
  comparisons: Comparison[]
}

export type CandidatesResponse = {
  candidates: ResolvedPlace[]
}

export type RoutePolyline = {
  kind: 'driving' | 'walking' | 'bus' | 'subway' | 'railway' | 'taxi'
  path: Array<[number, number]>
  label?: string
}

export type RouteResponse = {
  mode: 'driving' | 'transit'
  polylines: RoutePolyline[]
  segments?: Array<{
    kind: RoutePolyline['kind']
    label: string
    path: Array<[number, number]>
    from?: { name: string | null; location: LngLat | null }
    to?: { name: string | null; location: LngLat | null }
  }>
  taxiCostYuan?: number | null
  planIndex?: number
}

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
  mode: 'driving' | 'transit'
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
