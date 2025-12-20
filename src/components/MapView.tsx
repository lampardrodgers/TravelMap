import AMapLoader from '@amap/amap-jsapi-loader'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { LngLat, ResolvedPlace, RoutePolyline } from '../api'

export type MapViewHandle = {
  setPoints: (params: { hotels: ResolvedPlace[]; places: ResolvedPlace[]; selectedHotelIdx: number | null }) => void
  setCandidates: (params: { candidates: ResolvedPlace[] }) => void
  clearCandidates: () => void
  highlightCandidate: (index: number | null) => void
  showRoute: (params: { polylines: RoutePolyline[]; segments?: RouteSegment[] }) => void
  clearRoute: () => void
  resize: () => void
}

export type RouteSegment = {
  kind: RoutePolyline['kind']
  label?: string
  path: Array<[number, number]>
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

function createMarkerHtml(label: string, variant: 'hotel' | 'place' | 'selected' | 'candidate' | 'candidate-active') {
  const cls =
    variant === 'selected'
      ? 'tm-marker tm-marker--selected'
      : variant === 'hotel'
        ? 'tm-marker tm-marker--hotel'
        : variant === 'candidate'
          ? 'tm-marker tm-marker--candidate'
          : variant === 'candidate-active'
            ? 'tm-marker tm-marker--candidate tm-marker--candidate-active'
            : 'tm-marker tm-marker--place'
  return `<div class="${cls}">${label}</div>`
}

function normalizeCenter(points: ResolvedPlace[]): LngLat | null {
  if (points.length === 0) return null
  return points[0].location
}

export const MapView = forwardRef<MapViewHandle, { amapKey?: string }>(function MapView({ amapKey: amapKeyOverride }, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<AMapMap | null>(null)
  const amapRef = useRef<AMapNamespace | null>(null)
  const markerOverlaysRef = useRef<unknown[]>([])
  const candidateOverlaysRef = useRef<unknown[]>([])
  const candidateMarkersRef = useRef<Array<{ marker: unknown; label: string }>>([])
  const routeOverlaysRef = useRef<unknown[]>([])
  const routeLabelMarkersRef = useRef<Array<{ marker: unknown; kind: RoutePolyline['kind'] }>>([])
  const pendingPointsRef = useRef<{ hotels: ResolvedPlace[]; places: ResolvedPlace[]; selectedHotelIdx: number | null } | null>(null)
  const pendingRouteRef = useRef<{ polylines: RoutePolyline[]; segments?: RouteSegment[] } | null>(null)
  const pendingCandidatesRef = useRef<{ candidates: ResolvedPlace[] } | null>(null)
  const lastPointsRef = useRef<{ hotels: ResolvedPlace[]; places: ResolvedPlace[]; selectedHotelIdx: number | null } | null>(null)
  const lastRouteRef = useRef<{ polylines: RoutePolyline[]; segments?: RouteSegment[] } | null>(null)
  const lastCandidatesRef = useRef<{ candidates: ResolvedPlace[] } | null>(null)
  const onZoomEndRef = useRef<(() => void) | null>(null)
  const envAmapKey = import.meta.env.VITE_AMAP_KEY as string | undefined
  const amapKey = amapKeyOverride || envAmapKey
  const securityJsCode = import.meta.env.VITE_AMAP_SECURITY_CODE as string | undefined
  const [loadError, setLoadError] = useState<string | null>(() => (!amapKey ? '缺少高德 Key，无法加载地图' : null))

  useEffect(() => {
    setLoadError(!amapKey ? '缺少高德 Key，无法加载地图' : null)
  }, [amapKey])

  const clearMarkers = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    markerOverlaysRef.current.forEach((o) => map.remove(o))
    markerOverlaysRef.current = []
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
    lastRouteRef.current = null
  }, [])

  const setPoints = useCallback(({ hotels, places, selectedHotelIdx }: { hotels: ResolvedPlace[]; places: ResolvedPlace[]; selectedHotelIdx: number | null }) => {
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

    const overlays: unknown[] = []
    hotels.forEach((h, idx) => {
      const variant: 'hotel' | 'selected' = selectedHotelIdx === idx ? 'selected' : 'hotel'
      const marker = new AMap.Marker({
        position: [h.location.lng, h.location.lat],
        title: h.name,
        content: createMarkerHtml(`H${idx + 1}`, variant),
        offset: new AMap.Pixel(-12, -12),
      })
      overlays.push(marker)
    })

    places.forEach((p, idx) => {
      const marker = new AMap.Marker({
        position: [p.location.lng, p.location.lat],
        title: p.name,
        content: createMarkerHtml(`P${idx + 1}`, 'place'),
        offset: new AMap.Pixel(-12, -12),
      })
      overlays.push(marker)
    })

    overlays.forEach((o) => map.add(o))
    markerOverlaysRef.current = overlays

    const center = normalizeCenter(hotels) || normalizeCenter(places)
    if (center) map.setCenter([center.lng, center.lat])
    if (overlays.length > 0) map.setFitView(overlays)
  }, [clearCandidates, clearMarkers, clearRoute])

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

    const palette = ['#22c55e', '#a855f7', '#0ea5e9', '#f97316', '#eab308', '#10b981', '#ef4444', '#06b6d4', '#84cc16', '#fb7185', '#6366f1']
    const hashToIndex = (text: string) => {
      let h = 0
      for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) >>> 0
      return h % palette.length
    }

    const getColor = (kind: RoutePolyline['kind'], label?: string) => {
      if (kind === 'driving') return '#2563eb'
      if (kind === 'taxi') return '#dc2626'
      if (kind === 'walking') return '#64748b'
      const key = label || kind
      return palette[hashToIndex(key)]
    }

    const shouldShowLabel = (kind: RoutePolyline['kind'], zoom: number) => {
      if (kind === 'walking') return zoom >= 14
      return true
    }

    const getMidpoint = (path: Array<[number, number]>) => {
      if (!path.length) return null
      return path[Math.floor(path.length / 2)] || null
    }

    const items: RouteSegment[] = segments?.length
      ? segments
      : polylines.map((p) => ({ kind: p.kind, label: p.label, path: p.path }))

    const overlays: unknown[] = []
    const stopKeySet = new Set<string>()
    const labelMarkers: Array<{ marker: unknown; kind: RoutePolyline['kind'] }> = []
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

    for (const seg of items) {
      const color = getColor(seg.kind, seg.label)
      const style = (() => {
        switch (seg.kind) {
          case 'driving':
            return { strokeColor: color, strokeWeight: 7, strokeOpacity: 0.92 }
          case 'taxi':
            return { strokeColor: color, strokeWeight: 6, strokeOpacity: 0.92, strokeStyle: 'dashed' }
          case 'walking':
            return { strokeColor: color, strokeWeight: 5, strokeOpacity: 0.85, strokeStyle: 'dashed' }
          case 'bus':
          case 'subway':
          case 'railway':
          default:
            return { strokeColor: color, strokeWeight: 6, strokeOpacity: 0.92 }
        }
      })()

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
            : seg.kind === 'taxi'
              ? '打车'
              : seg.kind === 'subway'
                ? '地铁'
                : seg.kind === 'bus'
                  ? '公交'
                  : '路线')

      const mid = getMidpoint(seg.path)
      if (mid) {
        const marker = new AMap.Marker({
          position: mid,
          content: `<div class="tm-route-label" style="--c:${color}">${escapeHtml(labelText)}</div>`,
          offset: new AMap.Pixel(-14, -14),
        })
        const markerApi = marker as unknown as AMapMarkerLike
        if (!shouldShowLabel(seg.kind, zoom)) markerApi?.hide?.()
        labelMarkers.push({ marker, kind: seg.kind })
        overlays.push(marker)
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
    }

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
            const show = item.kind === 'walking' ? z >= 14 : true
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
      showRoute,
      clearRoute,
      resize: () => {
        mapRef.current?.resize?.()
      },
    }),
    [clearCandidates, clearRoute, highlightCandidate, setCandidates, setPoints, showRoute],
  )

  return (
    <div className="tm-map">
      {loadError ? <div className="tm-map__error">{loadError}</div> : null}
      <div ref={containerRef} className="tm-map__container" />
    </div>
  )
})
