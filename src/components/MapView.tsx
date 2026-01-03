import AMapLoader from '@amap/amap-jsapi-loader'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { LngLat, ResolvedPlace, RoutePolyline, TrafficStatus } from '../domain/types'

export type MapViewHandle = {
  setPoints: (params: { hotels: ResolvedPlace[]; places: ResolvedPlace[]; selectedHotelIdx: number | null }) => void
  setCandidates: (params: { candidates: ResolvedPlace[] }) => void
  clearCandidates: () => void
  highlightCandidate: (index: number | null) => void
  highlightHotel: (index: number | null) => void
  highlightPlace: (index: number | null) => void
  showRoute: (params: { polylines: RoutePolyline[]; segments?: RouteSegment[] }) => void
  clearRoute: () => void
  resize: () => void
}

export type RouteSegment = {
  kind: RoutePolyline['kind']
  label?: string
  path: Array<[number, number]>
  durationSeconds?: number
  trafficStatus?: TrafficStatus
  from?: { name: string | null; location: LngLat | null }
  to?: { name: string | null; location: LngLat | null }
}

type AMapMap = {
  add: (overlay: unknown) => void
  remove: (overlay: unknown) => void
  addControl: (control: unknown) => void
  setCenter: (center: [number, number]) => void
  setFitView: (overlays?: unknown[]) => void
  resize?: () => void
  getZoom?: () => number
  on?: (event: string, handler: () => void) => void
  off?: (event: string, handler: () => void) => void
  destroy?: () => void
}

type AMapNamespace = {
  Map: new (container: HTMLElement, options: Record<string, unknown>) => AMapMap
  Marker: new (options: Record<string, unknown>) => unknown
  Polyline: new (options: Record<string, unknown>) => unknown
  Pixel: new (x: number, y: number) => unknown
  ToolBar: new () => unknown
  Scale: new () => unknown
}

type AMapMarkerLike = { show?: () => void; hide?: () => void; setContent?: (content: string) => void }
type AMapOverlayLike = {
  show?: () => void
  hide?: () => void
  on?: (event: string, handler: () => void) => void
  off?: (event: string, handler: () => void) => void
}

function createMarkerHtml(
  label: string,
  variant: 'hotel' | 'place' | 'selected' | 'candidate' | 'candidate-active',
  highlightKind?: 'hotel' | 'place',
) {
  const base =
    variant === 'selected'
      ? 'tm-marker tm-marker--selected'
      : variant === 'hotel'
        ? 'tm-marker tm-marker--hotel'
        : variant === 'candidate'
          ? 'tm-marker tm-marker--candidate'
          : variant === 'candidate-active'
            ? 'tm-marker tm-marker--candidate tm-marker--candidate-active'
            : 'tm-marker tm-marker--place'
  const highlight =
    highlightKind === 'hotel' ? ' tm-marker--hover-hotel' : highlightKind === 'place' ? ' tm-marker--hover-place' : ''
  return `<div class="${base}${highlight}">${label}</div>`
}

function normalizeCenter(points: ResolvedPlace[]): LngLat | null {
  if (points.length === 0) return null
  return points[0].location
}

function formatDurationLabel(seconds?: number) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return null
  const mins = Math.round(seconds / 60)
  if (mins <= 0) return null
  if (mins < 60) return `约 ${mins} 分`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `约 ${h} 小时 ${m} 分`
}

export const MapView = forwardRef<
  MapViewHandle,
  {
    amapKey?: string
    securityJsCode?: string
    onSelectHotel?: (index: number) => void
    onSelectPlace?: (index: number) => void
    onSelectCandidate?: (index: number) => void
    onHoverHotel?: (index: number | null) => void
    onHoverPlace?: (index: number | null) => void
  }
>(function MapView(
  { amapKey: amapKeyOverride, securityJsCode: securityJsCodeOverride, onSelectHotel, onSelectPlace, onSelectCandidate, onHoverHotel, onHoverPlace },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<AMapMap | null>(null)
  const amapRef = useRef<AMapNamespace | null>(null)
  const markerOverlaysRef = useRef<unknown[]>([])
  const hotelMarkersRef = useRef<Array<{ marker: unknown; label: string }>>([])
  const placeMarkersRef = useRef<Array<{ marker: unknown; label: string }>>([])
  const hoveredHotelIdxRef = useRef<number | null>(null)
  const hoveredPlaceIdxRef = useRef<number | null>(null)
  const selectedHotelIdxRef = useRef<number | null>(null)
  const candidateOverlaysRef = useRef<unknown[]>([])
  const candidateMarkersRef = useRef<Array<{ marker: unknown; label: string }>>([])
  const routeOverlaysRef = useRef<unknown[]>([])
  const routeLabelMarkersRef = useRef<
    Array<{
      marker: unknown
      kind: RoutePolyline['kind']
      alwaysShow: boolean
      segmentIndex: number
      baseLabel: string
      color: string
      durationSeconds?: number
    }>
  >([])
  const activeSegmentsRef = useRef<Set<number>>(new Set())
  const pendingPointsRef = useRef<{ hotels: ResolvedPlace[]; places: ResolvedPlace[]; selectedHotelIdx: number | null } | null>(null)
  const pendingRouteRef = useRef<{ polylines: RoutePolyline[]; segments?: RouteSegment[] } | null>(null)
  const pendingCandidatesRef = useRef<{ candidates: ResolvedPlace[] } | null>(null)
  const lastPointsRef = useRef<{ hotels: ResolvedPlace[]; places: ResolvedPlace[]; selectedHotelIdx: number | null } | null>(null)
  const lastRouteRef = useRef<{ polylines: RoutePolyline[]; segments?: RouteSegment[] } | null>(null)
  const lastCandidatesRef = useRef<{ candidates: ResolvedPlace[] } | null>(null)
  const onZoomEndRef = useRef<(() => void) | null>(null)
  const onSelectHotelRef = useRef<typeof onSelectHotel>(onSelectHotel)
  const onSelectPlaceRef = useRef<typeof onSelectPlace>(onSelectPlace)
  const onSelectCandidateRef = useRef<typeof onSelectCandidate>(onSelectCandidate)
  const onHoverHotelRef = useRef<typeof onHoverHotel>(onHoverHotel)
  const onHoverPlaceRef = useRef<typeof onHoverPlace>(onHoverPlace)
  const envAmapKey = import.meta.env.VITE_AMAP_KEY as string | undefined
  const amapKey = amapKeyOverride || envAmapKey
  const envSecurityJsCode = import.meta.env.VITE_AMAP_SECURITY_CODE as string | undefined
  const securityJsCode = securityJsCodeOverride || envSecurityJsCode
  const [loadError, setLoadError] = useState<string | null>(null)
  const keyError = !amapKey ? '缺少高德 Key，无法加载地图' : null
  const displayError = keyError ?? loadError

  useEffect(() => {
    onSelectHotelRef.current = onSelectHotel
    onSelectPlaceRef.current = onSelectPlace
    onSelectCandidateRef.current = onSelectCandidate
    onHoverHotelRef.current = onHoverHotel
    onHoverPlaceRef.current = onHoverPlace
  }, [onSelectHotel, onSelectPlace, onSelectCandidate, onHoverHotel, onHoverPlace])

  const clearMarkers = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    markerOverlaysRef.current.forEach((o) => map.remove(o))
    markerOverlaysRef.current = []
    hotelMarkersRef.current = []
    placeMarkersRef.current = []
  }, [])

  const clearCandidates = useCallback(() => {
    const map = mapRef.current
    pendingCandidatesRef.current = null
    lastCandidatesRef.current = null
    if (!map) return
    candidateOverlaysRef.current.forEach((o) => map.remove(o))
    candidateOverlaysRef.current = []
    candidateMarkersRef.current = []
  }, [])

  const clearRoute = useCallback(() => {
    const map = mapRef.current
    pendingRouteRef.current = null
    if (!map) return
    routeOverlaysRef.current.forEach((o) => map.remove(o))
    routeOverlaysRef.current = []
    routeLabelMarkersRef.current = []
    activeSegmentsRef.current = new Set()
    lastRouteRef.current = null
  }, [])

  const updateHotelMarkers = useCallback(() => {
    const hoveredIdx = hoveredHotelIdxRef.current
    const selectedIdx = selectedHotelIdxRef.current
    hotelMarkersRef.current.forEach((item, idx) => {
      const markerApi = item.marker as unknown as AMapMarkerLike
      const variant = selectedIdx === idx ? 'selected' : 'hotel'
      const highlight = hoveredIdx === idx ? 'hotel' : undefined
      markerApi?.setContent?.(createMarkerHtml(item.label, variant, highlight))
    })
  }, [])

  const updatePlaceMarkers = useCallback(() => {
    const hoveredIdx = hoveredPlaceIdxRef.current
    placeMarkersRef.current.forEach((item, idx) => {
      const markerApi = item.marker as unknown as AMapMarkerLike
      const highlight = hoveredIdx === idx ? 'place' : undefined
      markerApi?.setContent?.(createMarkerHtml(item.label, 'place', highlight))
    })
  }, [])

  const highlightHotel = useCallback(
    (index: number | null) => {
      hoveredHotelIdxRef.current = index
      updateHotelMarkers()
    },
    [updateHotelMarkers],
  )

  const highlightPlace = useCallback(
    (index: number | null) => {
      hoveredPlaceIdxRef.current = index
      updatePlaceMarkers()
    },
    [updatePlaceMarkers],
  )

  const setPoints = useCallback(
    ({ hotels, places, selectedHotelIdx }: { hotels: ResolvedPlace[]; places: ResolvedPlace[]; selectedHotelIdx: number | null }) => {
      lastPointsRef.current = { hotels, places, selectedHotelIdx }
      const AMap = amapRef.current
      const map = mapRef.current
      if (!AMap || !map) {
        pendingPointsRef.current = { hotels, places, selectedHotelIdx }
        return
      }

      clearRoute()
      clearCandidates()
      clearMarkers()

      selectedHotelIdxRef.current = selectedHotelIdx
      const overlays: unknown[] = []
      const hotelMarkers: Array<{ marker: unknown; label: string }> = []
      const placeMarkers: Array<{ marker: unknown; label: string }> = []
      hotels.forEach((h, idx) => {
        const variant: 'hotel' | 'selected' = selectedHotelIdx === idx ? 'selected' : 'hotel'
        const highlight = hoveredHotelIdxRef.current === idx ? 'hotel' : undefined
        const marker = new AMap.Marker({
          position: [h.location.lng, h.location.lat],
          title: h.name,
          content: createMarkerHtml(`H${idx + 1}`, variant, highlight),
          offset: new AMap.Pixel(-12, -12),
        })
        const markerOverlay = marker as unknown as AMapOverlayLike
        markerOverlay?.on?.('click', () => onSelectHotelRef.current?.(idx))
        markerOverlay?.on?.('mouseover', () => {
          hoveredHotelIdxRef.current = idx
          updateHotelMarkers()
          onHoverHotelRef.current?.(idx)
        })
        markerOverlay?.on?.('mouseout', () => {
          hoveredHotelIdxRef.current = null
          updateHotelMarkers()
          onHoverHotelRef.current?.(null)
        })
        overlays.push(marker)
        hotelMarkers.push({ marker, label: `H${idx + 1}` })
      })

      places.forEach((p, idx) => {
        const highlight = hoveredPlaceIdxRef.current === idx ? 'place' : undefined
        const marker = new AMap.Marker({
          position: [p.location.lng, p.location.lat],
          title: p.name,
          content: createMarkerHtml(`P${idx + 1}`, 'place', highlight),
          offset: new AMap.Pixel(-12, -12),
        })
        const markerOverlay = marker as unknown as AMapOverlayLike
        markerOverlay?.on?.('click', () => onSelectPlaceRef.current?.(idx))
        markerOverlay?.on?.('mouseover', () => {
          hoveredPlaceIdxRef.current = idx
          updatePlaceMarkers()
          onHoverPlaceRef.current?.(idx)
        })
        markerOverlay?.on?.('mouseout', () => {
          hoveredPlaceIdxRef.current = null
          updatePlaceMarkers()
          onHoverPlaceRef.current?.(null)
        })
        overlays.push(marker)
        placeMarkers.push({ marker, label: `P${idx + 1}` })
      })

      overlays.forEach((o) => map.add(o))
      markerOverlaysRef.current = overlays
      hotelMarkersRef.current = hotelMarkers
      placeMarkersRef.current = placeMarkers

      const center = normalizeCenter(hotels) || normalizeCenter(places)
      if (center) map.setCenter([center.lng, center.lat])
      if (overlays.length > 0) map.setFitView(overlays)
    },
    [clearCandidates, clearMarkers, clearRoute, updateHotelMarkers, updatePlaceMarkers],
  )

  const setCandidates = useCallback(({ candidates }: { candidates: ResolvedPlace[] }) => {
    lastCandidatesRef.current = { candidates }
    const AMap = amapRef.current
    const map = mapRef.current
    if (!AMap || !map) {
      pendingCandidatesRef.current = { candidates }
      return
    }

    clearCandidates()

    const overlays: unknown[] = []
    const markers: Array<{ marker: unknown; label: string }> = []
    candidates.forEach((c, idx) => {
      const label = `C${idx + 1}`
      const marker = new AMap.Marker({
        position: [c.location.lng, c.location.lat],
        title: c.name,
        content: createMarkerHtml(label, 'candidate'),
        offset: new AMap.Pixel(-12, -12),
      })
      const markerOverlay = marker as unknown as AMapOverlayLike
      markerOverlay?.on?.('click', () => onSelectCandidateRef.current?.(idx))
      overlays.push(marker)
      markers.push({ marker, label })
    })

    overlays.forEach((o) => map.add(o))
    candidateOverlaysRef.current = overlays
    candidateMarkersRef.current = markers
  }, [clearCandidates])

  const highlightCandidate = useCallback((index: number | null) => {
    candidateMarkersRef.current.forEach((item, idx) => {
      const markerApi = item.marker as unknown as AMapMarkerLike
      const variant = index !== null && idx === index ? 'candidate-active' : 'candidate'
      markerApi?.setContent?.(createMarkerHtml(item.label, variant))
    })
  }, [])

  const showRoute = useCallback(({ polylines, segments }: { polylines: RoutePolyline[]; segments?: RouteSegment[] }) => {
    lastRouteRef.current = { polylines, segments }
    const AMap = amapRef.current
    const map = mapRef.current
    if (!AMap || !map) {
      pendingRouteRef.current = { polylines, segments }
      return
    }

    clearRoute()

    const transitKinds = new Set<RoutePolyline['kind']>(['subway', 'bus', 'railway'])
    const transitColorCache = new Map<string, string>()
    const transitLineOverrides: Record<string, string> = {}

    const normalizeLineLabel = (label?: string) => {
      if (!label) return ''
      return String(label).replace(/\s+/g, '').replace(/（/g, '(').replace(/）/g, ')')
    }

    const hexToRgb = (value: string) => {
      const hex = value.replace('#', '').trim()
      if (hex.length === 3) {
        const r = Number.parseInt(hex[0] + hex[0], 16)
        const g = Number.parseInt(hex[1] + hex[1], 16)
        const b = Number.parseInt(hex[2] + hex[2], 16)
        return Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b) ? { r, g, b } : null
      }
      if (hex.length !== 6) return null
      const r = Number.parseInt(hex.slice(0, 2), 16)
      const g = Number.parseInt(hex.slice(2, 4), 16)
      const b = Number.parseInt(hex.slice(4, 6), 16)
      return Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b) ? { r, g, b } : null
    }

    const colorDistance = (a: string, b: string) => {
      const c1 = hexToRgb(a)
      const c2 = hexToRgb(b)
      if (!c1 || !c2) return Number.MAX_SAFE_INTEGER
      const dr = c1.r - c2.r
      const dg = c1.g - c2.g
      const db = c1.b - c2.b
      return Math.sqrt(dr * dr + dg * dg + db * db)
    }

    const stringToHue = (text: string) => {
      let h = 0
      for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) >>> 0
      return h % 360
    }

    const hslToHex = (h: number, s: number, l: number) => {
      const sat = Math.max(0, Math.min(100, s)) / 100
      const light = Math.max(0, Math.min(100, l)) / 100
      const c = (1 - Math.abs(2 * light - 1)) * sat
      const hh = ((h % 360) + 360) % 360 / 60
      const x = c * (1 - Math.abs((hh % 2) - 1))
      let r = 0
      let g = 0
      let b = 0
      if (hh >= 0 && hh < 1) [r, g, b] = [c, x, 0]
      else if (hh >= 1 && hh < 2) [r, g, b] = [x, c, 0]
      else if (hh >= 2 && hh < 3) [r, g, b] = [0, c, x]
      else if (hh >= 3 && hh < 4) [r, g, b] = [0, x, c]
      else if (hh >= 4 && hh < 5) [r, g, b] = [x, 0, c]
      else[r, g, b] = [c, 0, x]
      const m = light - c / 2
      const toHex = (v: number) => {
        const n = Math.round((v + m) * 255)
        return n.toString(16).padStart(2, '0')
      }
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`
    }

    const pickTransitColor = (key: string, avoid: string | null) => {
      const baseHue = stringToHue(key)
      let hue = baseHue
      let color = hslToHex(hue, 68, 48)
      if (!avoid) return color
      for (let step = 0; step < 10; step += 1) {
        if (colorDistance(color, avoid) >= 80) return color
        hue = (baseHue + 34 * (step + 1)) % 360
        color = hslToHex(hue, 68, 48)
      }
      return color
    }

    const trafficColors: Record<TrafficStatus, string> = {
      smooth: '#22c55e',
      slow: '#f59e0b',
      jam: '#ef4444',
      serious: '#b91c1c',
    }

    const pickTrafficColor = (status?: TrafficStatus) => trafficColors[status ?? 'smooth']

    const getColor = (
      kind: RoutePolyline['kind'],
      label: string | undefined,
      avoidTransitColor: string | null,
      trafficStatus?: TrafficStatus,
    ) => {
      if (kind === 'driving' || kind === 'taxi') return pickTrafficColor(trafficStatus)
      if (kind === 'walking') return '#64748b'
      if (kind === 'cycling') return '#0ea5e9'
      const lineKey = normalizeLineLabel(label) || kind
      const override = transitLineOverrides[lineKey]
      if (override) return override
      if (!transitKinds.has(kind)) return hslToHex(stringToHue(lineKey), 68, 48)
      const cached = transitColorCache.get(lineKey)
      if (cached) return cached
      const color = pickTransitColor(lineKey, avoidTransitColor)
      transitColorCache.set(lineKey, color)
      return color
    }

    const items: RouteSegment[] = segments?.length
      ? segments
      : polylines.map((p) => ({ kind: p.kind, label: p.label, path: p.path }))

    const isPureWalking = items.length > 0 && items.every((seg) => seg.kind === 'walking')
    const isPureCycling = items.length > 0 && items.every((seg) => seg.kind === 'cycling')

    const shouldShowLabel = (kind: RoutePolyline['kind'], zoom: number) => {
      if (kind === 'walking') return isPureWalking || zoom >= 14
      if (kind === 'cycling') return isPureCycling || zoom >= 14
      return true
    }

    const getMidpoint = (path: Array<[number, number]>) => {
      if (!path.length) return null
      return path[Math.floor(path.length / 2)] || null
    }

    const overlays: unknown[] = []
    const stopKeySet = new Set<string>()
    const labelMarkers: Array<{
      marker: unknown
      kind: RoutePolyline['kind']
      alwaysShow: boolean
      segmentIndex: number
      baseLabel: string
      color: string
      durationSeconds?: number
    }> = []
    const zoom = map.getZoom?.() ?? 0

    const escapeHtml = (value: string) =>
      value.replace(/[&<>"']/g, (ch) => {
        switch (ch) {
          case '&':
            return '&amp;'
          case '<':
            return '&lt;'
          case '>':
            return '&gt;'
          case '"':
            return '&quot;'
          case "'":
            return '&#39;'
          default:
            return ch
        }
      })

    const buildRouteLabelHtml = (label: string, color: string, timeText?: string | null) => {
      const safeLabel = escapeHtml(label)
      if (!timeText) return `<div class="tm-route-label" style="--c:${color}"><span class="tm-route-label__main">${safeLabel}</span></div>`
      return `<div class="tm-route-label tm-route-label--active" style="--c:${color}"><span class="tm-route-label__main">${safeLabel}</span><span class="tm-route-label__time">${escapeHtml(timeText)}</span></div>`
    }

    const updateSegmentLabels = () => {
      routeLabelMarkersRef.current.forEach((item) => {
        const markerApi = item.marker as unknown as AMapMarkerLike
        const isActive = activeSegmentsRef.current.has(item.segmentIndex)
        const timeText = isActive ? formatDurationLabel(item.durationSeconds) : null
        markerApi?.setContent?.(buildRouteLabelHtml(item.baseLabel, item.color, timeText))
      })
    }

    const toggleSegment = (nextIndex: number) => {
      const activeSet = activeSegmentsRef.current
      if (activeSet.has(nextIndex)) activeSet.delete(nextIndex)
      else activeSet.add(nextIndex)
      updateSegmentLabels()
      const handler = onZoomEndRef.current
      if (handler) handler()
    }

    const allowSegmentFocus = Boolean(segments?.length) && items.some((seg) => seg.kind !== 'driving' && seg.kind !== 'taxi')

    const drivingLabelIndex = (() => {
      const indices = items
        .map((seg, idx) => ((seg.kind === 'driving' || seg.kind === 'taxi') && seg.trafficStatus ? idx : null))
        .filter((idx): idx is number => idx !== null)
      if (!indices.length) return null
      return indices[Math.floor(indices.length / 2)] ?? null
    })()

    let lastTransitColor: string | null = null
    items.forEach((seg, segIndex) => {
      const color = getColor(seg.kind, seg.label, lastTransitColor, seg.trafficStatus)
      const style = (() => {
        switch (seg.kind) {
          case 'driving':
            return { strokeColor: color, strokeWeight: 7, strokeOpacity: 0.92 }
          case 'taxi':
            return { strokeColor: color, strokeWeight: 6, strokeOpacity: 0.92, strokeStyle: 'dashed' }
          case 'walking':
            return { strokeColor: color, strokeWeight: 5, strokeOpacity: 0.85, strokeStyle: 'dashed' }
          case 'cycling':
            return { strokeColor: color, strokeWeight: 6, strokeOpacity: 0.9, strokeStyle: 'dashed' }
          case 'bus':
          case 'subway':
          case 'railway':
          default:
            return { strokeColor: color, strokeWeight: 6, strokeOpacity: 0.92 }
        }
      })()

      if (transitKinds.has(seg.kind)) lastTransitColor = color

      const overlay = new AMap.Polyline({
        path: seg.path,
        ...style,
      })
      overlays.push(overlay)

      const labelText =
        seg.label ||
        (seg.kind === 'driving'
          ? '驾车'
          : seg.kind === 'walking'
            ? '步行'
            : seg.kind === 'cycling'
              ? '骑车'
              : seg.kind === 'taxi'
                ? '打车'
                : seg.kind === 'subway'
                  ? '地铁'
                  : seg.kind === 'bus'
                    ? '公交'
                    : '路线')

      const mid = getMidpoint(seg.path)
      const shouldShowLabel =
        !(seg.kind === 'driving' || seg.kind === 'taxi') || !seg.trafficStatus || drivingLabelIndex === segIndex
      if (mid && shouldShowLabel) {
        const marker = new AMap.Marker({
          position: mid,
          content: buildRouteLabelHtml(labelText, color),
          offset: new AMap.Pixel(-14, -14),
        })
        const markerApi = marker as unknown as AMapMarkerLike
        if (!shouldShowLabel(seg.kind, zoom)) markerApi?.hide?.()
        const alwaysShow = (seg.kind === 'walking' && isPureWalking) || (seg.kind === 'cycling' && isPureCycling)
        labelMarkers.push({
          marker,
          kind: seg.kind,
          alwaysShow,
          segmentIndex: segIndex,
          baseLabel: labelText,
          color,
          durationSeconds: seg.durationSeconds,
        })
        overlays.push(marker)
        if (allowSegmentFocus) {
          const markerOverlay = marker as unknown as AMapOverlayLike
          markerOverlay?.on?.('click', () => {
            toggleSegment(segIndex)
          })
        }
      }

      const pushStop = (stop: RouteSegment['from'] | RouteSegment['to']) => {
        if (!stop?.location || !stop?.name) return
        const key = `${stop.location.lng.toFixed(5)},${stop.location.lat.toFixed(5)}:${stop.name}`
        if (stopKeySet.has(key)) return
        stopKeySet.add(key)
        const marker = new AMap.Marker({
          position: [stop.location.lng, stop.location.lat],
          title: stop.name,
          content: `<div class="tm-route-stop" style="--c:${color}"><span class="tm-route-stop__dot"></span><span class="tm-route-stop__text">${escapeHtml(stop.name)}</span></div>`,
          offset: new AMap.Pixel(0, -18),
        })
        overlays.push(marker)
      }

      pushStop(seg.from)
      pushStop(seg.to)
    })

    overlays.forEach((o) => map.add(o))
    routeOverlaysRef.current = overlays
    routeLabelMarkersRef.current = labelMarkers

    const handler = onZoomEndRef.current
    if (handler) handler()
    if (overlays.length > 0) map.setFitView(overlays)
  }, [clearRoute])

  useEffect(() => {
    let cancelled = false

    if (!amapKey) return

    if (securityJsCode) {
      window._AMapSecurityConfig = { securityJsCode }
    }

    AMapLoader.load({
      key: amapKey,
      version: '2.0',
      plugins: ['AMap.ToolBar', 'AMap.Scale'],
    })
      .then((AMapUnknown) => {
        if (cancelled) return
        const AMap = AMapUnknown as unknown as AMapNamespace
        amapRef.current = AMap
        if (!containerRef.current) return
        mapRef.current = new AMap.Map(containerRef.current, {
          zoom: 11,
          center: [116.397428, 39.90923],
        })
        mapRef.current.addControl(new AMap.ToolBar())
        mapRef.current.addControl(new AMap.Scale())

        const map = mapRef.current
        const onZoomEnd = () => {
          const z = map?.getZoom?.() ?? 0
          for (const item of routeLabelMarkersRef.current) {
            const markerApi = item.marker as unknown as AMapMarkerLike
            const show = item.alwaysShow ? true : item.kind === 'walking' || item.kind === 'cycling' ? z >= 14 : true
            if (show) markerApi?.show?.()
            else markerApi?.hide?.()
          }
        }
        onZoomEndRef.current = onZoomEnd
        map?.on?.('zoomend', onZoomEnd)

        const nextCandidates = pendingCandidatesRef.current || lastCandidatesRef.current
        const nextRoute = pendingRouteRef.current || lastRouteRef.current
        const nextPoints = pendingPointsRef.current || lastPointsRef.current
        if (nextPoints) {
          pendingPointsRef.current = null
          setPoints(nextPoints)
        }
        if (nextCandidates) {
          pendingCandidatesRef.current = null
          setCandidates(nextCandidates)
        }
        if (nextRoute) {
          pendingRouteRef.current = null
          showRoute(nextRoute)
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : String(err))
      })

    return () => {
      cancelled = true
      try {
        const map = mapRef.current
        const handler = onZoomEndRef.current
        if (handler) map?.off?.('zoomend', handler)
        mapRef.current?.destroy?.()
      } catch {
        // ignore
      }
      mapRef.current = null
      amapRef.current = null
    }
  }, [amapKey, securityJsCode, setCandidates, setPoints, showRoute])

  useImperativeHandle(
    ref,
    () => ({
      setPoints,
      setCandidates,
      clearCandidates,
      highlightCandidate,
      highlightHotel,
      highlightPlace,
      showRoute,
      clearRoute,
      resize: () => {
        mapRef.current?.resize?.()
      },
    }),
    [clearCandidates, clearRoute, highlightCandidate, highlightHotel, highlightPlace, setCandidates, setPoints, showRoute],
  )

  return (
    <div className="tm-map">
      {displayError ? <div className="tm-map__error">{displayError}</div> : null}
      <div ref={containerRef} className="tm-map__container" />
    </div>
  )
})
