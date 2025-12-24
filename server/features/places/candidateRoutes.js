import express from 'express'
import { searchPlaceCandidates } from '../../services/amap/places.js'
import { isNonEmptyString } from '../../utils.js'

export function createCandidateRouter() {
  const router = express.Router()

  router.post('/candidates', async (req, res) => {
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

  return router
}
