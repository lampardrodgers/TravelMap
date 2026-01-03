import { parseNumber } from '../../utils.js'
import { amapGetJson, amapBases } from './client.js'
import { lngLatToText, parseLocation } from './geo.js'

function getBicyclingPaths(json) {
  const dataPaths = Array.isArray(json?.data?.paths) ? json.data.paths : []
  if (dataPaths.length) return dataPaths
  const routePaths = Array.isArray(json?.route?.paths) ? json.route.paths : []
  if (routePaths.length) return routePaths
  const rawPaths = Array.isArray(json?.paths) ? json.paths : []
  return rawPaths
}

function normalizeTrafficStatus(status) {
  const value = String(status || '').trim()
  if (!value) return 'smooth'
  if (value.includes('严重')) return 'serious'
  if (value.includes('拥堵')) return 'jam'
  if (value.includes('缓行')) return 'slow'
  if (value.includes('畅通')) return 'smooth'
  return 'smooth'
}

export async function getDrivingSummary({ origin, destination, amapKey }) {
  const json = await amapGetJson(
    'direction/driving',
    {
      origin: lngLatToText(origin),
      destination: lngLatToText(destination),
      extensions: 'all',
      strategy: 0,
    },
    amapKey,
  )

  const route = json?.route
  const firstPath = route?.paths?.[0]
  if (!firstPath) throw new Error('驾车规划无结果')

  return {
    distanceMeters: parseNumber(firstPath.distance) ?? 0,
    durationSeconds: parseNumber(firstPath.duration) ?? 0,
    taxiCostYuan: parseNumber(route?.taxi_cost),
    tollsYuan: parseNumber(firstPath.tolls),
    tollDistanceMeters: parseNumber(firstPath.toll_distance),
  }
}

export async function getWalkingSummary({ origin, destination, amapKey }) {
  const json = await amapGetJson(
    'direction/walking',
    {
      origin: lngLatToText(origin),
      destination: lngLatToText(destination),
    },
    amapKey,
  )

  const route = json?.route
  const firstPath = route?.paths?.[0]
  if (!firstPath) throw new Error('步行规划无结果')

  return {
    distanceMeters: parseNumber(firstPath.distance) ?? 0,
    durationSeconds: parseNumber(firstPath.duration) ?? 0,
  }
}

export async function getCyclingSummary({ origin, destination, amapKey }) {
  const json = await amapGetJson(
    'direction/bicycling',
    {
      origin: lngLatToText(origin),
      destination: lngLatToText(destination),
    },
    amapKey,
    {
      base: amapBases.v4,
      isOk: (data) => data?.status === '1' || Number(data?.errcode ?? 0) === 0,
      getErrorInfo: (data) => ({
        info: String(data?.errmsg || data?.info || 'UNKNOWN'),
        code: String(data?.errcode ?? data?.infocode ?? 'N/A'),
      }),
    },
  )

  const firstPath = getBicyclingPaths(json)[0]
  if (!firstPath) throw new Error('骑车规划无结果')

  return {
    distanceMeters: parseNumber(firstPath.distance) ?? 0,
    durationSeconds: parseNumber(firstPath.duration) ?? 0,
  }
}

function summarizeTransitSegment(segment) {
  /** @type {string[]} */
  const parts = []
  /** @type {Array<{kind: string, label: string}>} */
  const legs = []
  let hasTaxi = false

  const walking = segment?.walking
  if (walking?.distance) {
    const meters = parseNumber(walking.distance) ?? 0
    if (meters > 0) {
      parts.push(`步行${Math.round(meters)}m`)
      legs.push({ kind: 'walking', label: '步行', distanceMeters: Math.round(meters) })
    }
  }

  const bus = segment?.bus
  const buslines = bus?.buslines || []
  for (const line of buslines) {
    const name = line?.name
    const viaStops = parseNumber(line?.via_num)
    if (name) {
      parts.push(`${name}${viaStops !== null ? `(${viaStops}站)` : ''}`)
      const short = String(name).split('(')[0].trim()
      const type = String(line?.type || '')
      const kind = type.includes('地铁') || short.includes('地铁') ? 'subway' : 'bus'
      legs.push({ kind, label: short || String(name) })
    }
  }

  const railway = segment?.railway
  if (railway?.name) {
    parts.push(`火车/高铁:${railway.name}`)
    legs.push({ kind: 'railway', label: String(railway.name) })
  }

  const taxi = segment?.taxi
  if (taxi && Object.keys(taxi).length > 0) {
    hasTaxi = true
    const dist = parseNumber(taxi.distance)
    parts.push(`打车${dist !== null ? `${Math.round(dist)}m` : ''}`)
    legs.push({ kind: 'taxi', label: '打车', distanceMeters: dist !== null ? Math.round(dist) : undefined })
  }

  return { text: parts.filter(Boolean).join(' → '), hasTaxi, legs }
}

function pickDurationSeconds(...values) {
  for (const value of values) {
    const parsed = parseNumber(value)
    if (parsed !== null) return parsed
  }
  return null
}

function estimateDurationSeconds(distanceMeters, speedMps) {
  const distance = parseNumber(distanceMeters)
  if (distance === null || distance <= 0 || !Number.isFinite(speedMps) || speedMps <= 0) return null
  return Math.round(distance / speedMps)
}

export async function getTransitSummary({ origin, destination, city, cityd, strategy, maxPlans, amapKey }) {
  const json = await amapGetJson(
    'direction/transit/integrated',
    {
      origin: lngLatToText(origin),
      destination: lngLatToText(destination),
      city: city || '',
      cityd: cityd || '',
      extensions: 'base',
      strategy: strategy ?? 0,
    },
    amapKey,
  )

  /** @type {any[]} */
  const transits = json?.route?.transits || []
  if (transits.length === 0) throw new Error('公交规划无结果')

  const limit = Math.max(1, Math.min(Number(maxPlans ?? 3), 6))
  return {
    plans: transits.slice(0, limit).map((t) => {
      const segments = Array.isArray(t?.segments) ? t.segments : []
      const segmentSummaries = segments.map((s) => summarizeTransitSegment(s))
      return {
        durationSeconds: parseNumber(t?.duration) ?? 0,
        costYuan: parseNumber(t?.cost),
        walkingDistanceMeters: parseNumber(t?.walking_distance),
        summary: segmentSummaries.map((s) => s.text).filter(Boolean).join(' | '),
        hasTaxi: segmentSummaries.some((s) => s.hasTaxi),
        legs: segmentSummaries.flatMap((s) => s.legs || []),
      }
    }),
  }
}

function polylineTextToPath(polylineText) {
  if (!polylineText) return []
  return String(polylineText)
    .split(';')
    .map((point) => {
      const [lngText, latText] = String(point).split(',')
      const lng = Number(lngText)
      const lat = Number(latText)
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
      return [lng, lat]
    })
    .filter(Boolean)
}

export async function getDrivingRoutePolylines({ origin, destination, amapKey }) {
  const json = await amapGetJson(
    'direction/driving',
    {
      origin: lngLatToText(origin),
      destination: lngLatToText(destination),
      extensions: 'all',
      strategy: 0,
    },
    amapKey,
  )

  const route = json?.route
  const firstPath = route?.paths?.[0]
  const durationSeconds = parseNumber(firstPath?.duration)
  const steps = Array.isArray(firstPath?.steps) ? firstPath.steps : []
  const routeSegments = []
  for (const step of steps) {
    const tmcs = Array.isArray(step?.tmcs) ? step.tmcs : []
    if (tmcs.length) {
      for (const tmc of tmcs) {
        const tmcPath = polylineTextToPath(tmc?.polyline)
        if (!tmcPath.length) continue
        routeSegments.push({
          kind: 'driving',
          label: '打车',
          path: tmcPath,
          trafficStatus: normalizeTrafficStatus(tmc?.status),
        })
      }
      continue
    }
    const stepPath = polylineTextToPath(step?.polyline)
    if (!stepPath.length) continue
    routeSegments.push({
      kind: 'driving',
      label: '打车',
      path: stepPath,
      trafficStatus: 'smooth',
    })
  }

  const fallbackPaths = steps.flatMap((s) => polylineTextToPath(s?.polyline))
  if (routeSegments.length === 0 && fallbackPaths.length) {
    routeSegments.push({
      kind: 'driving',
      label: '打车',
      path: fallbackPaths,
      trafficStatus: 'smooth',
    })
  }

  if (routeSegments.length && durationSeconds !== null) {
    routeSegments[0].durationSeconds = durationSeconds ?? undefined
  }

  return {
    taxiCostYuan: parseNumber(route?.taxi_cost),
    segments: routeSegments,
    polylines: routeSegments.map((seg) => ({ kind: seg.kind, path: seg.path, label: seg.label })),
  }
}

export async function getWalkingRoutePolylines({ origin, destination, amapKey }) {
  const json = await amapGetJson(
    'direction/walking',
    {
      origin: lngLatToText(origin),
      destination: lngLatToText(destination),
    },
    amapKey,
  )

  const route = json?.route
  const firstPath = route?.paths?.[0]
  const durationSeconds = parseNumber(firstPath?.duration)
  const steps = Array.isArray(firstPath?.steps) ? firstPath.steps : []
  const paths = steps.flatMap((s) => polylineTextToPath(s?.polyline))
  return {
    segments: [
      {
        kind: 'walking',
        label: '步行',
        path: paths,
        durationSeconds: durationSeconds ?? undefined,
      },
    ],
    polylines: [
      {
        kind: 'walking',
        path: paths,
        label: '步行',
      },
    ],
  }
}

export async function getCyclingRoutePolylines({ origin, destination, amapKey }) {
  const json = await amapGetJson(
    'direction/bicycling',
    {
      origin: lngLatToText(origin),
      destination: lngLatToText(destination),
    },
    amapKey,
    {
      base: amapBases.v4,
      isOk: (data) => data?.status === '1' || Number(data?.errcode ?? 0) === 0,
      getErrorInfo: (data) => ({
        info: String(data?.errmsg || data?.info || 'UNKNOWN'),
        code: String(data?.errcode ?? data?.infocode ?? 'N/A'),
      }),
    },
  )

  const firstPath = getBicyclingPaths(json)[0]
  if (!firstPath) throw new Error('骑车规划无结果')
  const durationSeconds = parseNumber(firstPath?.duration)
  const steps = Array.isArray(firstPath?.steps) ? firstPath.steps : []
  const paths = steps.flatMap((s) => polylineTextToPath(s?.polyline))
  return {
    segments: [
      {
        kind: 'cycling',
        label: '骑车',
        path: paths,
        durationSeconds: durationSeconds ?? undefined,
      },
    ],
    polylines: [
      {
        kind: 'cycling',
        path: paths,
        label: '骑车',
      },
    ],
  }
}

export async function getTransitRoutePolylines({ origin, destination, city, cityd, strategy, planIndex, amapKey }) {
  const json = await amapGetJson(
    'direction/transit/integrated',
    {
      origin: lngLatToText(origin),
      destination: lngLatToText(destination),
      city: city || '',
      cityd: cityd || '',
      extensions: 'base',
      strategy: strategy ?? 0,
    },
    amapKey,
  )

  /** @type {any[]} */
  const transits = json?.route?.transits || []
  if (transits.length === 0) throw new Error('公交规划无结果')
  const idx = Math.max(0, Math.min(Number(planIndex ?? 0), transits.length - 1))
  const transit = transits[idx]
  const segments = Array.isArray(transit?.segments) ? transit.segments : []

  const speed = {
    walking: 1.2,
    bus: 6,
    subway: 8,
    railway: 15,
    taxi: 9,
  }

  /** @type {Array<{kind: string, label: string, path: Array<[number, number]>, durationSeconds?: number, from?: {name: string | null, location: {lng: number, lat: number} | null}, to?: {name: string | null, location: {lng: number, lat: number} | null}}>} */
  const routeSegments = []

  for (const seg of segments) {
    const walking = seg?.walking
    if (walking?.steps?.length) {
      const walkPath = walking.steps.flatMap((s) => polylineTextToPath(s?.polyline))
      if (walkPath.length) {
        const fromLoc = walking?.origin ? parseLocation(walking.origin) : null
        const toLoc = walking?.destination ? parseLocation(walking.destination) : null
        const walkDistance = parseNumber(walking?.distance)
        const walkDuration = pickDurationSeconds(walking?.duration) ?? estimateDurationSeconds(walkDistance, speed.walking)
        routeSegments.push({
          kind: 'walking',
          label: '步行',
          path: walkPath,
          durationSeconds: walkDuration ?? undefined,
          from: { name: null, location: fromLoc },
          to: { name: null, location: toLoc },
        })
      }
    }

    const taxi = seg?.taxi
    if (taxi?.polyline) {
      const taxiPath = polylineTextToPath(taxi.polyline)
      if (taxiPath.length) {
        const taxiDistance = parseNumber(taxi?.distance)
        const taxiDuration = pickDurationSeconds(taxi?.duration) ?? estimateDurationSeconds(taxiDistance, speed.taxi)
        routeSegments.push({
          kind: 'taxi',
          label: '打车',
          path: taxiPath,
          durationSeconds: taxiDuration ?? undefined,
        })
      }
    }

    const buslines = seg?.bus?.buslines || []
    for (const line of buslines) {
      const busPath = polylineTextToPath(line?.polyline)
      if (!busPath.length) continue
      const name = String(line?.name || '')
      const short = name.split('(')[0].trim() || name
      const type = String(line?.type || '')
      const kind = type.includes('地铁') || short.includes('地铁') ? 'subway' : 'bus'
      const fromStop = line?.departure_stop
      const toStop = line?.arrival_stop
      const fromLoc = fromStop?.location ? parseLocation(fromStop.location) : null
      const toLoc = toStop?.location ? parseLocation(toStop.location) : null
      const lineDistance = parseNumber(line?.distance)
      const lineDuration = pickDurationSeconds(line?.duration) ?? estimateDurationSeconds(lineDistance, kind === 'subway' ? speed.subway : speed.bus)
      routeSegments.push({
        kind,
        label: short,
        path: busPath,
        durationSeconds: lineDuration ?? undefined,
        from: { name: fromStop?.name || null, location: fromLoc },
        to: { name: toStop?.name || null, location: toLoc },
      })
    }

    const railway = seg?.railway
    if (railway?.polyline) {
      const railwayPath = polylineTextToPath(railway.polyline)
      if (railwayPath.length) {
        const railDistance = parseNumber(railway?.distance) ?? parseNumber(railway?.trip?.distance)
        const railDuration = pickDurationSeconds(railway?.duration, railway?.trip?.duration) ?? estimateDurationSeconds(railDistance, speed.railway)
        routeSegments.push({
          kind: 'railway',
          label: String(railway?.name || '铁路'),
          path: railwayPath,
          durationSeconds: railDuration ?? undefined,
        })
      }
    }
  }

  return {
    planIndex: idx,
    segments: routeSegments,
    polylines: routeSegments.map((s) => ({ kind: s.kind, path: s.path, label: s.label })),
  }
}
