import 'dotenv/config'
import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  getDrivingRoutePolylines,
  getDrivingSummary,
  getTransitRoutePolylines,
  getTransitSummary,
  resolvePlace,
  searchPlaceCandidates,
} from './amap.js'
import { createConcurrencyLimiter, isNonEmptyString } from './utils.js'

const PORT = Number(process.env.PORT || 5174)
const MAX_ITEMS = 20
const MAX_PAIRS = 240

const app = express()
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (_req, res) => res.json({ ok: true }))

function normalizeReversePlaces(raw, placesLen) {
  const flags = Array.isArray(raw) ? raw : []
  return Array.from({ length: placesLen }, (_, i) => flags[i] === true)
}

function normalizeResolvedPlaces(raw, kind) {
  const items = Array.isArray(raw) ? raw : []
  return items.map((p, idx) => {
    const location = p?.location ?? {}
    const lng = Number(location.lng)
    const lat = Number(location.lat)
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      throw new Error(`${kind}[${idx}] 坐标非法`)
    }
    return {
      input: String(p?.input ?? ''),
      name: String(p?.name ?? ''),
      address: p?.address == null ? null : String(p.address),
      location: { lng, lat },
      citycode: p?.citycode == null ? null : String(p.citycode),
      adcode: p?.adcode == null ? null : String(p.adcode),
      source: p?.source === 'coord' || p?.source === 'poi' || p?.source === 'geocode' ? p.source : 'geocode',
    }
  })
}

async function computeComparisons({
  resolvedHotels,
  resolvedPlaces,
  reversePlaces,
  city,
  maxTransitPlans,
  transitStrategy,
  onlyPlaceIdx = null,
  onlyHotelIdx = null,
  amapKey,
}) {
  const limit = createConcurrencyLimiter(5)
  const comparisons = []

  const placeIndices =
    onlyPlaceIdx === null
      ? resolvedPlaces.map((_p, idx) => idx)
      : Number.isInteger(onlyPlaceIdx) && onlyPlaceIdx >= 0 && onlyPlaceIdx < resolvedPlaces.length
        ? [onlyPlaceIdx]
        : []

  const hotelIndices =
    onlyHotelIdx === null
      ? resolvedHotels.map((_h, idx) => idx)
      : Number.isInteger(onlyHotelIdx) && onlyHotelIdx >= 0 && onlyHotelIdx < resolvedHotels.length
        ? [onlyHotelIdx]
        : []

  if (onlyPlaceIdx !== null && placeIndices.length === 0) {
    throw new Error('onlyPlaceIdx 非法')
  }
  if (onlyHotelIdx !== null && hotelIndices.length === 0) {
    throw new Error('onlyHotelIdx 非法')
  }

  await Promise.all(
    hotelIndices.flatMap((hotelIdx) =>
      placeIndices.map(async (placeIdx) => {
        const hotel = resolvedHotels[hotelIdx]
        const place = resolvedPlaces[placeIdx]
        const reverse = reversePlaces[placeIdx] === true
        const origin = reverse ? place.location : hotel.location
        const destination = reverse ? hotel.location : place.location

        const originCitycode = reverse ? place.citycode : hotel.citycode
        const destCitycode = reverse ? hotel.citycode : place.citycode

        const cityForTransit = city || originCitycode || ''
        const citydForTransit = city || destCitycode || cityForTransit

        const item = { hotelIdx, placeIdx, driving: null, transit: null, errors: null }
        comparisons.push(item)

        const [drivingResult, transitResult] = await Promise.allSettled([
          limit(() => getDrivingSummary({ origin, destination, amapKey })),
          limit(() =>
            getTransitSummary({
              origin,
              destination,
              city: cityForTransit,
              cityd: citydForTransit,
              strategy: transitStrategy,
              maxPlans: maxTransitPlans,
              amapKey,
            }),
          ),
        ])

        if (drivingResult.status === 'fulfilled') item.driving = drivingResult.value
        if (drivingResult.status === 'rejected') {
          item.errors = { ...(item.errors || {}), driving: String(drivingResult.reason?.message || drivingResult.reason) }
        }

        if (transitResult.status === 'fulfilled') item.transit = transitResult.value
        if (transitResult.status === 'rejected') {
          item.errors = { ...(item.errors || {}), transit: String(transitResult.reason?.message || transitResult.reason) }
        }

        return item
      }),
    ),
  )

  return comparisons
}

app.post('/api/compare', async (req, res) => {
  try {
    const body = req.body ?? {}
    const hotels = Array.isArray(body.hotels) ? body.hotels : []
    const places = Array.isArray(body.places) ? body.places : []
    const city = isNonEmptyString(body.city) ? body.city.trim() : null
    const cityLimit = body.cityLimit !== false
    const amapKey = isNonEmptyString(body.amapKey) ? body.amapKey.trim() : null
    const maxTransitPlans = body.maxTransitPlans ?? 3
    const transitStrategy = body.transitStrategy ?? 0

    const cleanedHotels = hotels.map(String).map((s) => s.trim()).filter(Boolean)
    const cleanedPlaces = places.map(String).map((s) => s.trim()).filter(Boolean)
    const reversePlaces = normalizeReversePlaces(body.reversePlaces, cleanedPlaces.length)

    if (cleanedHotels.length === 0) {
      return res.status(400).json({ error: '请至少输入 1 个酒店' })
    }
    if (cleanedPlaces.length === 0) {
      return res.status(400).json({ error: '请至少输入 1 个地点' })
    }
    if (cleanedHotels.length > MAX_ITEMS || cleanedPlaces.length > MAX_ITEMS) {
      return res.status(400).json({ error: `酒店/地点最多各 ${MAX_ITEMS} 条（避免超额与等待过久）` })
    }
    if (cleanedHotels.length * cleanedPlaces.length > MAX_PAIRS) {
      return res
        .status(400)
        .json({ error: `组合过多：最多 ${MAX_PAIRS} 组（当前 ${cleanedHotels.length * cleanedPlaces.length} 组）` })
    }

    const limit = createConcurrencyLimiter(5)
    const cache = new Map()

    const resolveCached = async (text) => {
      if (cache.has(text)) return cache.get(text)
      const promise = limit(() => resolvePlace({ text, city, cityLimit, amapKey }))
      cache.set(text, promise)
      return promise
    }

    const resolvedHotels = await Promise.all(cleanedHotels.map((t) => resolveCached(t)))
    const resolvedPlaces = await Promise.all(cleanedPlaces.map((t) => resolveCached(t)))

    const comparisons = await computeComparisons({
      resolvedHotels,
      resolvedPlaces,
      reversePlaces,
      city,
      maxTransitPlans,
      transitStrategy,
      amapKey,
    })

    return res.json({
      hotels: resolvedHotels,
      places: resolvedPlaces,
      reversePlaces,
      comparisons,
    })
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) })
  }
})

app.post('/api/candidates', async (req, res) => {
  try {
    const body = req.body ?? {}
    const text = isNonEmptyString(body.text) ? body.text.trim() : ''
    const city = isNonEmptyString(body.city) ? body.city.trim() : null
    const cityLimit = body.cityLimit !== false
    const amapKey = isNonEmptyString(body.amapKey) ? body.amapKey.trim() : null
    const limit = body.limit ?? 8

    if (!text) return res.status(400).json({ error: 'text 不能为空' })

    const candidates = await searchPlaceCandidates({ text, city, cityLimit, limit, amapKey })
    return res.json({ candidates })
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) })
  }
})

app.post('/api/recompare', async (req, res) => {
  try {
    const body = req.body ?? {}
    const city = isNonEmptyString(body.city) ? body.city.trim() : null
    const hotels = normalizeResolvedPlaces(body.hotels, 'hotels')
    const places = normalizeResolvedPlaces(body.places, 'places')
    const reversePlaces = normalizeReversePlaces(body.reversePlaces, places.length)
    const maxTransitPlans = body.maxTransitPlans ?? 3
    const transitStrategy = body.transitStrategy ?? 0
    const onlyPlaceIdx = body.onlyPlaceIdx ?? null
    const onlyHotelIdx = body.onlyHotelIdx ?? null
    const amapKey = isNonEmptyString(body.amapKey) ? body.amapKey.trim() : null

    if (hotels.length === 0) return res.status(400).json({ error: 'hotels 不能为空' })
    if (places.length === 0) return res.status(400).json({ error: 'places 不能为空' })
    if (hotels.length > MAX_ITEMS || places.length > MAX_ITEMS) {
      return res.status(400).json({ error: `酒店/地点最多各 ${MAX_ITEMS} 条（避免超额与等待过久）` })
    }
    if (onlyPlaceIdx === null && onlyHotelIdx === null && hotels.length * places.length > MAX_PAIRS) {
      return res.status(400).json({ error: `组合过多：最多 ${MAX_PAIRS} 组（当前 ${hotels.length * places.length} 组）` })
    }

    const comparisons = await computeComparisons({
      resolvedHotels: hotels,
      resolvedPlaces: places,
      reversePlaces,
      city,
      maxTransitPlans,
      transitStrategy,
      onlyPlaceIdx,
      onlyHotelIdx,
      amapKey,
    })

    return res.json({
      reversePlaces,
      comparisons,
    })
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) })
  }
})

app.post('/api/route', async (req, res) => {
  try {
    const body = req.body ?? {}
    const mode = body.mode
    const origin = body.origin
    const destination = body.destination
    const city = isNonEmptyString(body.city) ? body.city.trim() : null
    const cityd = isNonEmptyString(body.cityd) ? body.cityd.trim() : null
    const amapKey = isNonEmptyString(body.amapKey) ? body.amapKey.trim() : null
    const strategy = body.strategy ?? 0
    const planIndex = body.planIndex ?? 0

    if (!origin || !destination) return res.status(400).json({ error: 'origin/destination 必填' })
    if (!Number.isFinite(Number(origin.lng)) || !Number.isFinite(Number(origin.lat))) {
      return res.status(400).json({ error: 'origin 坐标非法' })
    }
    if (!Number.isFinite(Number(destination.lng)) || !Number.isFinite(Number(destination.lat))) {
      return res.status(400).json({ error: 'destination 坐标非法' })
    }

    const o = { lng: Number(origin.lng), lat: Number(origin.lat) }
    const d = { lng: Number(destination.lng), lat: Number(destination.lat) }

    if (mode === 'driving') {
      const data = await getDrivingRoutePolylines({ origin: o, destination: d, amapKey })
      return res.json({ mode, ...data })
    }

    if (mode === 'transit') {
      const data = await getTransitRoutePolylines({
        origin: o,
        destination: d,
        city: city || '',
        cityd: cityd || '',
        strategy,
        planIndex,
        amapKey,
      })
      return res.json({ mode, ...data })
    }

    return res.status(400).json({ error: 'mode 仅支持 driving/transit' })
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) })
  }
})

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.resolve(__dirname, '../dist')
const distIndex = path.join(distDir, 'index.html')
if (fs.existsSync(distIndex)) {
  app.use(express.static(distDir))
  // Express 5 + path-to-regexp v6 不支持 '*'，用正则兜底，同时避免吃掉 /api
  app.get(/^\/(?!api(?:\/|$)).*/, (_req, res) => res.sendFile(distIndex))
}

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`)
})
