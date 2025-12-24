import { parseLngLatText } from '../../utils.js'
import { amapGetJson } from './client.js'
import { lngLatToText, parseLocation } from './geo.js'

export async function resolvePlace({ text, city, cityLimit, amapKey }) {
  const coord = parseLngLatText(text)
  if (coord) {
    try {
      const regeo = await amapGetJson(
        'geocode/regeo',
        {
          location: lngLatToText(coord),
          extensions: 'base',
          radius: 1000,
        },
        amapKey,
      )
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
  const poiJson = await amapGetJson(
    'place/text',
    {
      keywords: text,
      // 用 all 拿到 entr_location 等字段；大型 POI（机场/园区/商场）用 location 往往是“中心点”，会导致公交规划偏离真实出入口
      extensions: 'all',
      offset: 1,
      page: 1,
      city: city || undefined,
      citylimit: cityLimit && city ? 'true' : undefined,
    },
    amapKey,
  )

  /** @type {any[]} */
  const pois = poiJson?.pois || []
  let matchedPoi = null
  let matchedLocation = null
  for (const poi of pois) {
    const location = parseLocation(poi?.entr_location) || parseLocation(poi?.location)
    if (!location) continue
    matchedPoi = poi
    matchedLocation = location
    break
  }
  if (matchedPoi && matchedLocation) {
    return {
      input: text,
      name: matchedPoi.name || text,
      address: matchedPoi.address || null,
      location: matchedLocation,
      citycode: matchedPoi.citycode || null,
      adcode: matchedPoi.adcode || null,
      source: 'poi',
    }
  }

  // 2) 地理编码兜底（适合详细地址）
  const geoJson = await amapGetJson(
    'geocode/geo',
    {
      address: text,
      city: city || undefined,
    },
    amapKey,
  )
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

function buildPoiCandidates({ text, pois }) {
  const seen = new Set()
  const candidates = []
  for (const poi of pois) {
    const poiLocationText = poi?.entr_location || poi?.location
    if (!poiLocationText) continue
    const location = parseLocation(poiLocationText)
    if (!location) continue
    const key = `${location.lng.toFixed(6)},${location.lat.toFixed(6)}-${poi?.name || ''}`
    if (seen.has(key)) continue
    seen.add(key)
    candidates.push({
      input: text,
      name: poi?.name || text,
      address: poi?.address || null,
      location,
      citycode: poi?.citycode || null,
      adcode: poi?.adcode || null,
      source: 'poi',
    })
  }
  return candidates
}

export async function searchPlaceCandidates({ text, city, cityLimit, limit, amapKey }) {
  const coord = parseLngLatText(text)
  if (coord) return []

  const capped = Math.max(1, Math.min(Number(limit ?? 8), 20))
  const poiJson = await amapGetJson(
    'place/text',
    {
      keywords: text,
      extensions: 'all',
      offset: capped,
      page: 1,
      city: city || undefined,
      citylimit: cityLimit && city ? 'true' : undefined,
    },
    amapKey,
  )

  /** @type {any[]} */
  const pois = poiJson?.pois || []
  const candidates = buildPoiCandidates({ text, pois })
  if (candidates.length) return candidates

  const geoJson = await amapGetJson(
    'geocode/geo',
    {
      address: text,
      city: city || undefined,
    },
    amapKey,
  )
  /** @type {any[]} */
  const geocodes = geoJson?.geocodes || []
  const geoCandidates = []
  for (const geo of geocodes.slice(0, capped)) {
    if (!geo?.location) continue
    const location = parseLocation(geo.location)
    if (!location) continue
    geoCandidates.push({
      input: text,
      name: geo.formatted_address || text,
      address: geo.formatted_address || null,
      location,
      citycode: geo?.citycode || null,
      adcode: geo?.adcode || null,
      source: 'geocode',
    })
  }
  return geoCandidates
}
