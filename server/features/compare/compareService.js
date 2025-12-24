import { createConcurrencyLimiter } from '../../utils.js'
import { getCyclingSummary, getDrivingSummary, getTransitSummary, getWalkingSummary } from '../../services/amap/routes.js'

export function normalizeReversePlaces(raw, placesLen) {
  const flags = Array.isArray(raw) ? raw : []
  return Array.from({ length: placesLen }, (_, i) => flags[i] === true)
}

export function normalizeResolvedPlaces(raw, kind) {
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

export async function computeComparisons({
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

        const item = { hotelIdx, placeIdx, driving: null, walking: null, cycling: null, transit: null, errors: null }
        comparisons.push(item)

        const [drivingResult, walkingResult, cyclingResult, transitResult] = await Promise.allSettled([
          limit(() => getDrivingSummary({ origin, destination, amapKey })),
          limit(() => getWalkingSummary({ origin, destination, amapKey })),
          limit(() => getCyclingSummary({ origin, destination, amapKey })),
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

        if (walkingResult.status === 'fulfilled') item.walking = walkingResult.value
        if (walkingResult.status === 'rejected') {
          item.errors = { ...(item.errors || {}), walking: String(walkingResult.reason?.message || walkingResult.reason) }
        }

        if (cyclingResult.status === 'fulfilled') item.cycling = cyclingResult.value
        if (cyclingResult.status === 'rejected') {
          item.errors = { ...(item.errors || {}), cycling: String(cyclingResult.reason?.message || cyclingResult.reason) }
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
