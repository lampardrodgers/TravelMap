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

export type LightSummary = {
  distanceMeters: number
  durationSeconds: number
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
  walking?: LightSummary | null
  cycling?: LightSummary | null
  transit: TransitSummary | null
  errors: { driving?: string; walking?: string; cycling?: string; transit?: string } | null
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
  kind: 'driving' | 'walking' | 'cycling' | 'bus' | 'subway' | 'railway' | 'taxi'
  path: Array<[number, number]>
  label?: string
}

export type RouteResponse = {
  mode: 'driving' | 'transit' | 'walking' | 'cycling'
  polylines: RoutePolyline[]
  segments?: Array<{
    kind: RoutePolyline['kind']
    label: string
    path: Array<[number, number]>
    durationSeconds?: number
    from?: { name: string | null; location: LngLat | null }
    to?: { name: string | null; location: LngLat | null }
  }>
  taxiCostYuan?: number | null
  planIndex?: number
}
