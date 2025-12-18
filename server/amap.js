import { createRateLimiter, parseLngLatText, parseNumber, sleep } from './utils.js'

const AMAP_API_BASE = 'https://restapi.amap.com/v3'
const AMAP_CONCURRENCY = Number(process.env.AMAP_CONCURRENCY || 2)
const AMAP_QPS = Number(process.env.AMAP_QPS || 3)
const AMAP_MAX_RETRIES = Number(process.env.AMAP_MAX_RETRIES || 3)

const requestLimiter = createRateLimiter({
  maxConcurrent: Number.isFinite(AMAP_CONCURRENCY) && AMAP_CONCURRENCY > 0 ? AMAP_CONCURRENCY : 2,
  minIntervalMs: Number.isFinite(AMAP_QPS) && AMAP_QPS > 0 ? Math.ceil(1000 / AMAP_QPS) : 350,
})

export function getAmapKey() {
  return process.env.AMAP_WEB_KEY || process.env.AMAP_KEY || process.env.VITE_AMAP_KEY || ''
}

function requireAmapKey() {
  const key = getAmapKey()
  if (!key) throw new Error('缺少高德 Key：请设置 AMAP_WEB_KEY 或 AMAP_KEY（也可复用 VITE_AMAP_KEY）')
  return key
}

function buildUrl(pathname, params) {
  const url = new URL(`${AMAP_API_BASE}/${pathname}`)
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    url.searchParams.set(key, String(value))
  }
  return url
}

async function amapGetJson(pathname, params) {
  const url = buildUrl(pathname, { ...params, key: requireAmapKey() })
  const maxRetries = Number.isFinite(AMAP_MAX_RETRIES) ? Math.max(0, Math.min(AMAP_MAX_RETRIES, 8)) : 3

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const json = await requestLimiter(async () => {
      const resp = await fetch(url)
      if (!resp.ok) {
        throw new Error(`高德请求失败：${resp.status} ${resp.statusText}`)
      }
      return /** @type {any} */ (await resp.json())
    })

    if (json?.status === '1') return json

    const info = String(json?.info || 'UNKNOWN')
    const infocode = String(json?.infocode || 'N/A')
    const isQpsExceeded = infocode === '10021' || info === 'CUQPS_HAS_EXCEEDED_THE_LIMIT'
    if (isQpsExceeded && attempt < maxRetries) {
      const backoffMs = 350 * Math.pow(2, attempt) + Math.floor(Math.random() * 120)
      await sleep(backoffMs)
      continue
    }

    throw new Error(`高德返回错误：${info} (${infocode})`)
  }

  throw new Error('高德请求失败：重试次数已用尽')
}

function parseLocation(locationText) {
  const parsed = parseLngLatText(locationText)
  if (parsed) return parsed
  const parts = String(locationText).split(',')
  if (parts.length !== 2) return null
  const lng = Number(parts[0])
  const lat = Number(parts[1])
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
  return { lng, lat }
}

export function lngLatToText(lngLat) {
  return `${lngLat.lng},${lngLat.lat}`
}

export async function resolvePlace({ text, city, cityLimit }) {
  const coord = parseLngLatText(text)
  if (coord) {
    try {
      const regeo = await amapGetJson('geocode/regeo', {
        location: lngLatToText(coord),
        extensions: 'base',
        radius: 1000,
      })
      const comp = regeo?.regeocode?.addressComponent
      const formatted = regeo?.regeocode?.formatted_address
      return {
        input: text,
        name: formatted || text,
        address: formatted || null,
        location: coord,
        citycode: comp?.citycode || null,
        adcode: comp?.adcode || null,
        source: 'coord',
      }
    } catch {
      // 坐标兜底：不阻塞后续规划
    }
    return {
      input: text,
      name: text,
      address: null,
      location: coord,
      citycode: null,
      adcode: null,
      source: 'coord',
    }
  }

  // 1) POI 文本搜索（更适合酒店/地标）
  const poiJson = await amapGetJson('place/text', {
    keywords: text,
    extensions: 'base',
    offset: 1,
    page: 1,
    city: city || undefined,
    citylimit: cityLimit && city ? 'true' : undefined,
  })

  /** @type {any[]} */
  const pois = poiJson?.pois || []
  const firstPoi = pois[0]
  if (firstPoi?.location) {
    const location = parseLocation(firstPoi.location)
    if (!location) throw new Error(`POI 解析失败：location=${firstPoi.location}`)
    return {
      input: text,
      name: firstPoi.name || text,
      address: firstPoi.address || null,
      location,
      citycode: firstPoi.citycode || null,
      adcode: firstPoi.adcode || null,
      source: 'poi',
    }
  }

  // 2) 地理编码兜底（适合详细地址）
  const geoJson = await amapGetJson('geocode/geo', {
    address: text,
    city: city || undefined,
  })
  /** @type {any[]} */
  const geocodes = geoJson?.geocodes || []
  const firstGeo = geocodes[0]
  if (firstGeo?.location) {
    const location = parseLocation(firstGeo.location)
    if (!location) throw new Error(`地理编码解析失败：location=${firstGeo.location}`)
    return {
      input: text,
      name: firstGeo.formatted_address || text,
      address: firstGeo.formatted_address || null,
      location,
      citycode: firstGeo.citycode || null,
      adcode: firstGeo.adcode || null,
      source: 'geocode',
    }
  }

  throw new Error(`未找到地点：${text}`)
}

export async function getDrivingSummary({ origin, destination }) {
  const json = await amapGetJson('direction/driving', {
    origin: lngLatToText(origin),
    destination: lngLatToText(destination),
    extensions: 'all',
    strategy: 0,
  })

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
      legs.push({ kind: 'walking', label: '步行' })
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
    legs.push({ kind: 'taxi', label: '打车' })
  }

  return { text: parts.filter(Boolean).join(' → '), hasTaxi, legs }
}

export async function getTransitSummary({ origin, destination, city, cityd, strategy, maxPlans }) {
  const json = await amapGetJson('direction/transit/integrated', {
    origin: lngLatToText(origin),
    destination: lngLatToText(destination),
    city: city || '',
    cityd: cityd || '',
    extensions: 'base',
    strategy: strategy ?? 0,
  })

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

export async function getDrivingRoutePolylines({ origin, destination }) {
  const json = await amapGetJson('direction/driving', {
    origin: lngLatToText(origin),
    destination: lngLatToText(destination),
    extensions: 'all',
    strategy: 0,
  })

  const route = json?.route
  const firstPath = route?.paths?.[0]
  const steps = Array.isArray(firstPath?.steps) ? firstPath.steps : []
  const paths = steps.flatMap((s) => polylineTextToPath(s?.polyline))
  return {
    taxiCostYuan: parseNumber(route?.taxi_cost),
    polylines: [
      {
        kind: 'driving',
        path: paths,
      },
    ],
  }
}

export async function getTransitRoutePolylines({ origin, destination, city, cityd, strategy, planIndex }) {
  const json = await amapGetJson('direction/transit/integrated', {
    origin: lngLatToText(origin),
    destination: lngLatToText(destination),
    city: city || '',
    cityd: cityd || '',
    extensions: 'base',
    strategy: strategy ?? 0,
  })

  /** @type {any[]} */
  const transits = json?.route?.transits || []
  if (transits.length === 0) throw new Error('公交规划无结果')
  const idx = Math.max(0, Math.min(Number(planIndex ?? 0), transits.length - 1))
  const transit = transits[idx]
  const segments = Array.isArray(transit?.segments) ? transit.segments : []

  /** @type {Array<{kind: string, label: string, path: Array<[number, number]>, from?: {name: string | null, location: {lng: number, lat: number} | null}, to?: {name: string | null, location: {lng: number, lat: number} | null}}>} */
  const routeSegments = []

  for (const seg of segments) {
    const walking = seg?.walking
    if (walking?.steps?.length) {
      const walkPath = walking.steps.flatMap((s) => polylineTextToPath(s?.polyline))
      if (walkPath.length) {
        const fromLoc = walking?.origin ? parseLocation(walking.origin) : null
        const toLoc = walking?.destination ? parseLocation(walking.destination) : null
        routeSegments.push({
          kind: 'walking',
          label: '步行',
          path: walkPath,
          from: { name: null, location: fromLoc },
          to: { name: null, location: toLoc },
        })
      }
    }

    const taxi = seg?.taxi
    if (taxi?.polyline) {
      const taxiPath = polylineTextToPath(taxi.polyline)
      if (taxiPath.length) {
        routeSegments.push({
          kind: 'taxi',
          label: '打车',
          path: taxiPath,
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
      routeSegments.push({
        kind,
        label: short,
        path: busPath,
        from: { name: fromStop?.name || null, location: fromLoc },
        to: { name: toStop?.name || null, location: toLoc },
      })
    }

    const railway = seg?.railway
    if (railway?.polyline) {
      const railwayPath = polylineTextToPath(railway.polyline)
      if (railwayPath.length) {
        routeSegments.push({
          kind: 'railway',
          label: String(railway?.name || '铁路'),
          path: railwayPath,
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
