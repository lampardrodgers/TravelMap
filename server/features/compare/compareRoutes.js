import express from 'express'
import { resolvePlace } from '../../services/amap/places.js'
import { createConcurrencyLimiter, isNonEmptyString } from '../../utils.js'
import { computeComparisons, normalizeResolvedPlaces, normalizeReversePlaces } from './compareService.js'

const MAX_ITEMS = 20
const MAX_PAIRS = 240

export function createCompareRouter() {
  const router = express.Router()

  router.post('/compare', async (req, res) => {
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

  router.post('/recompare', async (req, res) => {
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

  return router
}
