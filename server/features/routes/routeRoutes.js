import express from 'express'
import {
  getCyclingRoutePolylines,
  getDrivingRoutePolylines,
  getTransitRoutePolylines,
  getWalkingRoutePolylines,
} from '../../services/amap/routes.js'
import { isNonEmptyString } from '../../utils.js'

export function createRouteRouter() {
  const router = express.Router()

  router.post('/route', async (req, res) => {
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

      if (mode === 'walking') {
        const data = await getWalkingRoutePolylines({ origin: o, destination: d, amapKey })
        return res.json({ mode, ...data })
      }

      if (mode === 'cycling') {
        const data = await getCyclingRoutePolylines({ origin: o, destination: d, amapKey })
        return res.json({ mode, ...data })
      }

      return res.status(400).json({ error: 'mode 仅支持 driving/transit/walking/cycling' })
    } catch (err) {
      return res.status(500).json({ error: String(err?.message || err) })
    }
  })

  return router
}
