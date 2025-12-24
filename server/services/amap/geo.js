import { parseLngLatText } from '../../utils.js'

export function parseLocation(locationText) {
  const raw = String(locationText ?? '').trim()
  if (!raw) return null
  const normalized = raw.split(/[;|]/)[0]?.trim() || ''
  const parsed = parseLngLatText(normalized)
  if (parsed) return parsed
  const parts = normalized.split(',')
  if (parts.length !== 2) return null
  const lng = Number(parts[0])
  const lat = Number(parts[1])
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
  return { lng, lat }
}

export function lngLatToText(lngLat) {
  return `${lngLat.lng},${lngLat.lat}`
}
