import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import {
  comparePlaces,
  fetchCandidates,
  fetchRoute,
  recompareResolved,
} from '../../services/api'
import type { CompareResponse, Comparison, ResolvedPlace } from '../../domain/types'
import { MapView, type MapViewHandle } from '../../components/MapView'
import { BikeIcon, BusIcon, CarIcon, ClockIcon, CoinIcon, PinIcon, SettingsIcon, SubwayIcon, WalkIcon } from '../../components/Icons'
import type { Settings, SettingsDraft, TravelMode } from './types'
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  clampCandidateLimit,
  formatDistance,
  formatDistanceCompact,
  formatDuration,
  formatDurationCompact,
  formatYuan,
  getPlanLegs,
  isSameLocation,
  loadSettings,
  mergeComparisons,
  normalizeReversePlaces,
  normalizeSettings,
  normalizeTravelModes,
  parseLines,
  saveSettings,
  toErrorMessage,
  candidateKey,
} from './compareUtils'

export function CompareView({ modeSwitcher }: { modeSwitcher?: ReactNode }) {
  const initialSettings = useMemo(() => loadSettings(), [])
  const [city, setCity] = useState('')
  const [cityLimit, setCityLimit] = useState(true)
  const [hotelsText, setHotelsText] = useState('')
  const [placesText, setPlacesText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<CompareResponse | null>(null)
  const [selectedHotelIdx, setSelectedHotelIdx] = useState<number | null>(null)
  const [expandedPlaces, setExpandedPlaces] = useState<boolean[]>([])
  const [reversePlaces, setReversePlaces] = useState<boolean[]>([])
  const [reverseLoadingIdx, setReverseLoadingIdx] = useState<number | null>(null)
  const [routeLoadingKey, setRouteLoadingKey] = useState<string | null>(null)
  const [travelModes, setTravelModes] = useState<TravelMode[]>([])
  const [activeRoute, setActiveRoute] = useState<{ mode: TravelMode | 'transit'; placeIdx: number; planIndex?: number; hotelIdx: number } | null>(null)
  const [candidatePanel, setCandidatePanel] = useState<{ kind: 'hotel' | 'place'; idx: number } | null>(null)
  const [candidateList, setCandidateList] = useState<ResolvedPlace[]>([])
  const [candidateLoadingKey, setCandidateLoadingKey] = useState<string | null>(null)
  const [candidateApplyingKey, setCandidateApplyingKey] = useState<string | null>(null)
  const [candidateError, setCandidateError] = useState<string | null>(null)
  const [settings, setSettings] = useState<Settings>(initialSettings)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft>({
    amapKey: initialSettings.amapKey,
    amapWebKey: initialSettings.amapWebKey,
    amapSecurityCode: initialSettings.amapSecurityCode,
    candidateLimit: String(initialSettings.candidateLimit),
  })
  const mapRef = useRef<MapViewHandle | null>(null)
  const candidateRequestRef = useRef<string | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState(520)
  const [focusPlaceIdx, setFocusPlaceIdx] = useState<number | null>(null)
  const [hoveredHotelIdx, setHoveredHotelIdx] = useState<number | null>(null)
  const [hoveredPlaceIdx, setHoveredPlaceIdx] = useState<number | null>(null)
  const focusPlaceTimeoutRef = useRef<number | null>(null)
  const splitterDragRef = useRef<{ active: boolean; startX: number; startWidth: number; pointerId: number | null }>({
    active: false,
    startX: 0,
    startWidth: 520,
    pointerId: null,
  })
  const resizeRafRef = useRef<number | null>(null)

  const comparisonMap = useMemo(() => {
    const map = new Map<string, Comparison>()
    for (const c of data?.comparisons ?? []) {
      map.set(`${c.hotelIdx}-${c.placeIdx}`, c)
    }
    return map
  }, [data])

  const amapKeyOverride = settings.amapKey.trim()
  const amapWebKeyOverride = settings.amapWebKey.trim()
  const amapSecurityCodeOverride = settings.amapSecurityCode.trim()
  const runtimeAmapKey = amapKeyOverride ? amapKeyOverride : undefined
  const runtimeAmapWebKey = amapWebKeyOverride ? amapWebKeyOverride : undefined
  const runtimeAmapSecurityCode = amapSecurityCodeOverride ? amapSecurityCodeOverride : undefined
  const runtimeAmapRequestKey = runtimeAmapWebKey || runtimeAmapKey
  const candidateLimit = clampCandidateLimit(settings.candidateLimit)

  const openSettingsPanel = () => {
    setSettingsDraft({
      amapKey: settings.amapKey,
      amapWebKey: settings.amapWebKey,
      amapSecurityCode: settings.amapSecurityCode,
      candidateLimit: String(settings.candidateLimit),
    })
    setSettingsOpen(true)
  }

  const closeSettingsPanel = () => {
    setSettingsOpen(false)
    setSettingsDraft({
      amapKey: settings.amapKey,
      amapWebKey: settings.amapWebKey,
      amapSecurityCode: settings.amapSecurityCode,
      candidateLimit: String(settings.candidateLimit),
    })
  }

  const saveSettingsPanel = () => {
    const next = normalizeSettings(settingsDraft, settings)
    setSettings(next)
    setSettingsOpen(false)
  }

  const saveSettingsLocal = () => {
    const next = normalizeSettings(settingsDraft, settings)
    setSettings(next)
    saveSettings(next)
  }

  const clearSettingsLocal = () => {
    if (!window.confirm('确定要清除本地设置吗？此操作不可撤销。')) return
    try {
      window.localStorage.removeItem(SETTINGS_STORAGE_KEY)
    } catch {
      // ignore
    }
    setSettings({ ...DEFAULT_SETTINGS })
    setSettingsDraft({
      amapKey: DEFAULT_SETTINGS.amapKey,
      amapWebKey: DEFAULT_SETTINGS.amapWebKey,
      amapSecurityCode: DEFAULT_SETTINGS.amapSecurityCode,
      candidateLimit: String(DEFAULT_SETTINGS.candidateLimit),
    })
  }

  const selectHotel = (idx: number | null, nextData: CompareResponse | null = data) => {
    if (idx !== selectedHotelIdx && nextData) {
      setExpandedPlaces(Array.from({ length: nextData.places.length }, () => false))
    }
    if (idx !== selectedHotelIdx) {
      setCandidatePanel(null)
      setCandidateList([])
      setCandidateError(null)
      setCandidateLoadingKey(null)
    }
    setSelectedHotelIdx(idx)
    if (idx !== selectedHotelIdx) setActiveRoute(null)
    if (!nextData) return
    mapRef.current?.setPoints({ hotels: nextData.hotels, places: nextData.places, selectedHotelIdx: idx })
  }

  const openCandidatePanel = async (kind: 'hotel' | 'place', idx: number) => {
    if (!data) return
    const key = candidateKey(kind, idx)
    candidateRequestRef.current = key
    setCandidatePanel({ kind, idx })
    setCandidateList([])
    setCandidateError(null)
    setCandidateLoadingKey(key)
    try {
      const item = kind === 'hotel' ? data.hotels[idx] : data.places[idx]
      const resp = await fetchCandidates({
        text: item.input,
        city: city.trim() || undefined,
        cityLimit,
        limit: candidateLimit,
        amapKey: runtimeAmapRequestKey,
      })
      if (candidateRequestRef.current !== key) return
      const list = Array.isArray(resp.candidates) ? resp.candidates : []
      setCandidateList(list)
      if (!list.length) setCandidateError('未找到可替换的结果')
    } catch (err) {
      if (candidateRequestRef.current !== key) return
      setCandidateError(toErrorMessage(err))
    } finally {
      if (candidateRequestRef.current === key) setCandidateLoadingKey(null)
    }
  }

  const applyCandidate = async (kind: 'hotel' | 'place', idx: number, candidate: ResolvedPlace) => {
    if (!data) return
    const key = candidateKey(kind, idx)
    const nextHotels = data.hotels.slice()
    const nextPlaces = data.places.slice()
    if (kind === 'hotel') nextHotels[idx] = candidate
    else nextPlaces[idx] = candidate

    setCandidateApplyingKey(key)
    setError(null)
    try {
      const resp = await recompareResolved({
        city: city.trim() || undefined,
        hotels: nextHotels,
        places: nextPlaces,
        reversePlaces,
        onlyPlaceIdx: kind === 'place' ? idx : null,
        onlyHotelIdx: kind === 'hotel' ? idx : null,
        amapKey: runtimeAmapRequestKey,
      })

      const nextData = {
        ...data,
        hotels: nextHotels,
        places: nextPlaces,
        comparisons: mergeComparisons(data.comparisons, resp.comparisons),
        reversePlaces: resp.reversePlaces,
      }
      setData(nextData)
      setReversePlaces(normalizeReversePlaces(nextPlaces.length, resp.reversePlaces))
      mapRef.current?.setPoints({ hotels: nextHotels, places: nextPlaces, selectedHotelIdx })
      setActiveRoute(null)
      setCandidatePanel(null)
      setCandidateList([])
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setCandidateApplyingKey(null)
    }
  }

  const focusPlace = (placeIdx: number) => {
    const placesLen = data?.places.length ?? 0
    if (placeIdx < 0 || placeIdx >= placesLen) return
    setExpandedPlaces((prev) => {
      const next = prev.length === placesLen ? prev.slice() : Array.from({ length: placesLen }, () => false)
      next[placeIdx] = true
      return next
    })
    setFocusPlaceIdx(placeIdx)
    if (focusPlaceTimeoutRef.current) window.clearTimeout(focusPlaceTimeoutRef.current)
    focusPlaceTimeoutRef.current = window.setTimeout(() => setFocusPlaceIdx(null), 1800)
    if (typeof document !== 'undefined') {
      const el = document.getElementById(`tm-place-${placeIdx}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const handleHotelMarkerSelect = (idx: number) => {
    if (!data) return
    selectHotel(idx)
  }

  const handlePlaceMarkerSelect = (idx: number) => {
    if (!data) return
    focusPlace(idx)
  }

  const handleCandidateMarkerSelect = (idx: number) => {
    if (!candidatePanel || !data) return
    const candidate = candidateList[idx]
    if (!candidate) return
    const current = candidatePanel.kind === 'hotel' ? data.hotels[candidatePanel.idx] : data.places[candidatePanel.idx]
    if (!current) return
    if (isSameLocation(candidate.location, current.location)) return
    void applyCandidate(candidatePanel.kind, candidatePanel.idx, candidate)
  }

  const handleHotelMarkerHover = (idx: number | null) => {
    setHoveredHotelIdx(idx)
  }

  const handlePlaceMarkerHover = (idx: number | null) => {
    setHoveredPlaceIdx(idx)
  }

  const onCompare = async () => {
    setError(null)
    setLoading(true)
    try {
      const hotels = parseLines(hotelsText)
      const places = parseLines(placesText)
      const nextReversePlaces = normalizeReversePlaces(places.length, reversePlaces.length === places.length ? reversePlaces : undefined)
      const resp = await comparePlaces({
        city: city.trim() || undefined,
        cityLimit,
        hotels,
        places,
        reversePlaces: nextReversePlaces,
        amapKey: runtimeAmapRequestKey,
      })
      setData(resp)
      setExpandedPlaces(Array.from({ length: resp.places.length }, () => false))
      setReversePlaces(normalizeReversePlaces(resp.places.length, resp.reversePlaces ?? nextReversePlaces))
      setTravelModes(normalizeTravelModes(resp.places.length))
      setCandidatePanel(null)
      setCandidateList([])
      setCandidateError(null)
      setCandidateLoadingKey(null)
      setActiveRoute(null)
      selectHotel(0, resp)
    } catch (err) {
      setData(null)
      setSelectedHotelIdx(null)
      setExpandedPlaces([])
      setReversePlaces([])
      setTravelModes([])
      setActiveRoute(null)
      setError(toErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const togglePlaceDirection = async (placeIdx: number) => {
    const nextReversePlaces = normalizeReversePlaces(data?.places.length ?? 0, reversePlaces)
    nextReversePlaces[placeIdx] = !nextReversePlaces[placeIdx]
    setReversePlaces(nextReversePlaces)
    if (!data) return

    setReverseLoadingIdx(placeIdx)
    setError(null)
    try {
      const resp = await recompareResolved({
        city: city.trim() || undefined,
        hotels: data.hotels,
        places: data.places,
        reversePlaces: nextReversePlaces,
        onlyPlaceIdx: placeIdx,
        amapKey: runtimeAmapRequestKey,
      })

      const merged = mergeComparisons(data.comparisons, resp.comparisons)
      setData({ ...data, comparisons: merged, reversePlaces: resp.reversePlaces })
      setReversePlaces(normalizeReversePlaces(data.places.length, resp.reversePlaces))
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setReverseLoadingIdx(null)
    }
  }

  const onShowRoute = async (params: { mode: TravelMode | 'transit'; placeIdx: number; planIndex?: number }) => {
    if (!data || selectedHotelIdx === null) return
    const hotel = data.hotels[selectedHotelIdx]
    const place = data.places[params.placeIdx]
    const reverse = reversePlaces[params.placeIdx] === true
    const originPlace = reverse ? place : hotel
    const destPlace = reverse ? hotel : place
    const loadingKey = `${params.mode}-${selectedHotelIdx}-${params.placeIdx}-${params.planIndex ?? 0}`
    setRouteLoadingKey(loadingKey)
    setError(null)
    try {
      const resp = await fetchRoute({
        mode: params.mode,
        origin: originPlace.location,
        destination: destPlace.location,
        city: city.trim() || originPlace.citycode || undefined,
        cityd: city.trim() || destPlace.citycode || undefined,
        planIndex: params.planIndex,
        amapKey: runtimeAmapRequestKey,
      })
      mapRef.current?.showRoute({ polylines: resp.polylines, segments: resp.segments })
      setActiveRoute({
        mode: params.mode,
        placeIdx: params.placeIdx,
        planIndex: params.planIndex,
        hotelIdx: selectedHotelIdx,
      })
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setRouteLoadingKey(null)
    }
  }

  const updateTravelMode = (placeIdx: number, mode: TravelMode) => {
    setTravelModes((prev) => {
      const next = normalizeTravelModes(data?.places.length ?? prev.length, prev)
      next[placeIdx] = mode
      return next
    })
    if (!activeRoute || selectedHotelIdx === null) return
    if (activeRoute.placeIdx !== placeIdx || activeRoute.hotelIdx !== selectedHotelIdx) return
    if (activeRoute.mode === mode || activeRoute.mode === 'transit') return
    const comparison = comparisonMap.get(`${selectedHotelIdx}-${placeIdx}`)
    const summary = mode === 'walking' ? comparison?.walking : mode === 'cycling' ? comparison?.cycling : comparison?.driving
    if (!summary) {
      mapRef.current?.clearRoute()
      setActiveRoute(null)
      return
    }
    void onShowRoute({ mode, placeIdx })
  }

  const selectedHotel = data && selectedHotelIdx !== null ? data.hotels[selectedHotelIdx] : null

  const renderCandidatePanel = (kind: 'hotel' | 'place', idx: number, current: ResolvedPlace) => {
    if (!candidatePanel || candidatePanel.kind !== kind || candidatePanel.idx !== idx) return null
    const key = candidateKey(kind, idx)
    const loading = candidateLoadingKey === key
    const applying = candidateApplyingKey === key
    return (
      <div className="tm-candidate">
        <div className="tm-candidate__head">
          <div className="tm-candidate__title">可选结果</div>
          <div className="tm-candidate__tools">
            <button
              className="tm-btn tm-btn--small tm-btn--ghost"
              type="button"
              onClick={() => {
                setCandidatePanel(null)
                setCandidateList([])
                setCandidateError(null)
              }}
            >
              关闭
            </button>
          </div>
        </div>
        {loading ? (
          <div className="tm-muted">加载中…</div>
        ) : candidateError ? (
          <div className="tm-error tm-error--inline">{candidateError}</div>
        ) : candidateList.length ? (
          <div
            className="tm-candidate__list"
            onMouseLeave={() => {
              mapRef.current?.highlightCandidate(null)
            }}
          >
            {candidateList.map((c, i) => {
              const selected = isSameLocation(c.location, current.location)
              const disabled = applying || selected
              return (
                <button
                  key={`${c.name}-${i}`}
                  className={`tm-candidate__item ${selected ? 'tm-candidate__item--active' : ''}`}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    if (disabled) return
                    applyCandidate(kind, idx, c)
                  }}
                  onMouseEnter={() => {
                    mapRef.current?.highlightCandidate(i)
                  }}
                >
                  <div className="tm-candidate__name">
                    <span className="tm-candidate__badge">{`C${i + 1}`}</span>
                    <span>{c.name}</span>
                    {selected ? <span className="tm-badge">已选</span> : null}
                  </div>
                  <div className="tm-candidate__addr">{c.address || c.input}</div>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="tm-muted">暂无可选结果</div>
        )}
        {applying ? <div className="tm-muted">更新中…</div> : null}
      </div>
    )
  }

  useEffect(() => {
    if (resizeRafRef.current) cancelAnimationFrame(resizeRafRef.current)
    resizeRafRef.current = requestAnimationFrame(() => {
      mapRef.current?.resize()
    })
    return () => {
      if (resizeRafRef.current) cancelAnimationFrame(resizeRafRef.current)
    }
  }, [sidebarWidth])

  useEffect(() => {
    if (!candidatePanel) {
      mapRef.current?.clearCandidates()
      mapRef.current?.highlightCandidate(null)
      return
    }
    if (candidateList.length > 0) {
      mapRef.current?.setCandidates({ candidates: candidateList })
    } else {
      mapRef.current?.clearCandidates()
    }
    mapRef.current?.highlightCandidate(null)
  }, [candidateList, candidatePanel])

  useEffect(() => {
    return () => {
      if (focusPlaceTimeoutRef.current) window.clearTimeout(focusPlaceTimeoutRef.current)
    }
  }, [])

  const clampSidebarWidth = (next: number) => {
    const min = 360
    const max = Math.max(min, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 320)
    return Math.min(max, Math.max(min, Math.round(next)))
  }

  const onSplitterPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    splitterDragRef.current = { active: true, startX: e.clientX, startWidth: sidebarWidth, pointerId: e.pointerId }
    e.currentTarget.setPointerCapture(e.pointerId)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  const onSplitterPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = splitterDragRef.current
    if (!drag.active || drag.pointerId !== e.pointerId) return
    const dx = e.clientX - drag.startX
    setSidebarWidth(clampSidebarWidth(drag.startWidth + dx))
  }

  const endSplitterDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = splitterDragRef.current
    if (!drag.active || drag.pointerId !== e.pointerId) return
    splitterDragRef.current = { ...drag, active: false, pointerId: null }
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }

  const rootStyle = { '--tm-sidebar-w': `${sidebarWidth}px` } as CSSProperties

  return (
    <div className="tm-root" style={rootStyle}>
      <div className="tm-sidebar">
        <div className="tm-head">
          <div className="tm-head__row">
            <div className="tm-head__title">TravelMap</div>
            <button className="tm-btn tm-btn--small tm-btn--ghost tm-btn--icon" type="button" onClick={openSettingsPanel}>
              <span className="tm-btn__icon" aria-hidden="true">
                <SettingsIcon />
              </span>
              设置
            </button>
          </div>
          <div className="tm-head__desc">酒店对比：打车/公交耗时与费用，一眼选出更合适的落脚点</div>
          {modeSwitcher ? <div className="tm-head__modes">{modeSwitcher}</div> : null}
        </div>

        <div className="tm-panel">
          <div className="tm-row tm-row--between tm-row--gap">
            <div className="tm-field tm-field--grow">
              <label className="tm-label">城市（建议填写，提高公交/POI 准确度）</label>
              <input className="tm-input" value={city} onChange={(e) => setCity(e.target.value)} placeholder="例如：杭州 / 北京 / 上海" />
            </div>
            <label className="tm-check tm-check--pill" title="勾选后只在该城市内做 POI 匹配，减少歧义">
              <input type="checkbox" checked={cityLimit} onChange={(e) => setCityLimit(e.target.checked)} />
              城市内搜索
            </label>
          </div>

          <div className="tm-grid2">
            <div className="tm-field">
              <label className="tm-label">
                <span className="tm-label__icon tm-label__icon--hotel">
                  <PinIcon />
                </span>
                选择地（每行 1 个）
              </label>
              <textarea
                className="tm-textarea"
                value={hotelsText}
                onChange={(e) => setHotelsText(e.target.value)}
                placeholder={`例：\n全季酒店(北京国贸店)\n汉庭酒店(北京望京SOHO店)\n116.481028,39.989643`}
              />
            </div>
            <div className="tm-field">
              <label className="tm-label">
                <span className="tm-label__icon tm-label__icon--place">
                  <PinIcon />
                </span>
                前往点（每行 1 个）
              </label>
              <textarea
                className="tm-textarea"
                value={placesText}
                onChange={(e) => setPlacesText(e.target.value)}
                placeholder={`例：\n北京南站\n国贸\n北京动物园\n116.434446,39.90816`}
              />
            </div>
          </div>

          <div className="tm-actions">
            <button className="tm-btn tm-btn--primary" onClick={onCompare} disabled={loading}>
              {loading ? '计算中…' : '开始对比'}
            </button>
            {data ? (
              <button
                className="tm-btn tm-btn--ghost"
                onClick={() => {
                  mapRef.current?.clearRoute()
                  setActiveRoute(null)
                }}
              >
                清除路线
              </button>
            ) : null}
          </div>

          {error ? <div className="tm-error">{error}</div> : null}
        </div>

        {data ? (
          <div className="tm-panel">
            <div className="tm-section">
              <div className="tm-section__title">酒店</div>
              <div className="tm-hotel-list">
                {data.hotels.map((h, idx) => (
                  <button
                    key={`${h.input}-${idx}`}
                    className={`tm-hotel ${selectedHotelIdx === idx ? 'tm-hotel--active' : ''} ${hoveredHotelIdx === idx ? 'tm-hotel--hover' : ''}`}
                    onClick={() => selectHotel(idx)}
                    onMouseEnter={() => {
                      setHoveredHotelIdx(idx)
                      mapRef.current?.highlightHotel(idx)
                    }}
                    onMouseLeave={() => {
                      setHoveredHotelIdx(null)
                      mapRef.current?.highlightHotel(null)
                    }}
                  >
                    <div className="tm-hotel__badge">{`H${idx + 1}`}</div>
                    <div className="tm-hotel__main">
                      <div className="tm-hotel__name">{h.name}</div>
                      <div className="tm-hotel__addr">{h.address || h.input}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {selectedHotel ? (
              <div className="tm-selected">
                <div className="tm-selected__row">
                  <div className="tm-selected__title">当前酒店</div>
                  <button
                    className="tm-btn tm-btn--small tm-btn--ghost"
                    type="button"
                    onClick={() => {
                      if (selectedHotelIdx === null) return
                      openCandidatePanel('hotel', selectedHotelIdx)
                    }}
                    disabled={loading}
                  >
                    匹配有误
                  </button>
                </div>
                <div className="tm-selected__main">{selectedHotel.name}</div>
                <div className="tm-selected__meta">{selectedHotel.address || selectedHotel.input}</div>
                {selectedHotelIdx !== null ? renderCandidatePanel('hotel', selectedHotelIdx, selectedHotel) : null}
              </div>
            ) : null}

            {selectedHotelIdx !== null ? (
              <>
                <div className="tm-section tm-section--tight">
                  <div className="tm-section__head">
                    <div className="tm-section__title">目的地</div>
                    <div className="tm-section__tools">
                      <button
                        className="tm-btn tm-btn--small tm-btn--ghost"
                        type="button"
                        onClick={() => {
                          const len = data.places.length
                          const isAllExpanded = len > 0 && Array.from({ length: len }, (_, i) => expandedPlaces[i] === true).every(Boolean)
                          setExpandedPlaces(Array.from({ length: len }, () => !isAllExpanded))
                        }}
                      >
                        {data.places.length > 0 && Array.from({ length: data.places.length }, (_, i) => expandedPlaces[i] === true).every(Boolean)
                          ? '全部收起'
                          : '全部展开'}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="tm-destlist">
                  {data.places.map((p, placeIdx) => {
                    const c = comparisonMap.get(`${selectedHotelIdx}-${placeIdx}`)
                    const reverse = reversePlaces[placeIdx] === true
                    const expanded = expandedPlaces[placeIdx] === true
                    const fastestTransit = (() => {
                      const plans = c?.transit?.plans ?? []
                      if (!plans.length) return null
                      let bestIdx = 0
                      let best = plans[0]!
                      for (let i = 1; i < plans.length; i += 1) {
                        const candidate = plans[i]!
                        if (candidate.durationSeconds < best.durationSeconds) {
                          best = candidate
                          bestIdx = i
                        }
                      }
                      return { plan: best, idx: bestIdx }
                    })()
                    const activeMode = travelModes[placeIdx] ?? 'driving'
                    const activeSummary =
                      activeMode === 'walking' ? c?.walking : activeMode === 'cycling' ? c?.cycling : c?.driving
                    const activeError =
                      activeMode === 'walking' ? c?.errors?.walking : activeMode === 'cycling' ? c?.errors?.cycling : c?.errors?.driving
                    const activeRouteKey = `${activeMode}-${selectedHotelIdx}-${placeIdx}-0`
                    const activeModeDisabled = routeLoadingKey === activeRouteKey || !activeSummary
                    return (
                      <div
                        key={`${p.input}-${placeIdx}`}
                        id={`tm-place-${placeIdx}`}
                        className={`tm-destcard ${focusPlaceIdx === placeIdx ? 'tm-destcard--focus' : ''} ${hoveredPlaceIdx === placeIdx ? 'tm-destcard--hover' : ''}`}
                        onMouseEnter={() => {
                          mapRef.current?.highlightPlace(placeIdx)
                        }}
                        onMouseLeave={() => {
                          mapRef.current?.highlightPlace(null)
                        }}
                      >
                        <div className="tm-destcard__head">
                          <div className="tm-destcard__toprow">
                            <div className="tm-destcard__name">
                              <span className="tm-place-badge">{`P${placeIdx + 1}`}</span>
                              {p.name}
                            </div>
                            <div className="tm-destcard__actions">
                              <button
                                className="tm-btn tm-btn--small tm-btn--ghost"
                                type="button"
                                onClick={() => openCandidatePanel('place', placeIdx)}
                                disabled={loading}
                              >
                                匹配有误
                              </button>
                              <button
                                className="tm-dirbtn"
                                type="button"
                                onClick={() => togglePlaceDirection(placeIdx)}
                                disabled={reverseLoadingIdx === placeIdx || loading}
                                title="切换：酒店→目的地 / 目的地→酒店"
                              >
                                {reverseLoadingIdx === placeIdx ? '更新中…' : reverse ? '目的地 → 酒店' : '酒店 → 目的地'}
                              </button>
                            </div>
                          </div>
                          <div className="tm-destcard__addr">{p.address || p.input}</div>
                          {renderCandidatePanel('place', placeIdx, p)}
                        </div>

                        <div className="tm-destcard__body">
                          <div className="tm-block tm-block--car">
                            <div className="tm-block__top">
                              <div className="tm-block__title tm-block__title--car">
                                <div className="tm-mode-group" role="tablist" aria-label="出行方式">
                                  <button
                                    className={`tm-mode-btn ${activeMode === 'driving' ? 'is-active' : ''}`}
                                    type="button"
                                    onClick={() => updateTravelMode(placeIdx, 'driving')}
                                    aria-pressed={activeMode === 'driving'}
                                  >
                                    <span className="tm-block__icon">
                                      <CarIcon />
                                    </span>
                                    打车
                                  </button>
                                  <button
                                    className={`tm-mode-btn ${activeMode === 'walking' ? 'is-active' : ''}`}
                                    type="button"
                                    onClick={() => updateTravelMode(placeIdx, 'walking')}
                                    aria-pressed={activeMode === 'walking'}
                                  >
                                    <span className="tm-block__icon">
                                      <WalkIcon />
                                    </span>
                                    步行
                                  </button>
                                  <button
                                    className={`tm-mode-btn ${activeMode === 'cycling' ? 'is-active' : ''}`}
                                    type="button"
                                    onClick={() => updateTravelMode(placeIdx, 'cycling')}
                                    aria-pressed={activeMode === 'cycling'}
                                  >
                                    <span className="tm-block__icon">
                                      <BikeIcon />
                                    </span>
                                    骑车
                                  </button>
                                </div>
                              </div>
                              <button
                                className="tm-btn tm-btn--small"
                                onClick={() => onShowRoute({ mode: activeMode, placeIdx })}
                                disabled={activeModeDisabled}
                              >
                                {routeLoadingKey === activeRouteKey ? '加载中…' : '在地图上显示'}
                              </button>
                            </div>
                            {activeSummary ? (
                              <div className="tm-kv">
                                <span className="tm-pill tm-pill--blue">{formatDistance(activeSummary.distanceMeters)}</span>
                                <span className="tm-pill tm-pill--blue">{formatDuration(activeSummary.durationSeconds)}</span>
                                {activeMode === 'driving' ? (
                                  <span className="tm-pill tm-pill--blue">约 {formatYuan(c?.driving?.taxiCostYuan ?? null)}</span>
                                ) : null}
                              </div>
                            ) : (
                              <div className="tm-muted">{activeError || '暂无结果'}</div>
                            )}
                          </div>

                          <div className="tm-block tm-block--transit">
                            <div className="tm-block__top">
                              <div className="tm-block__title tm-block__title--transit">
                                <span className="tm-block__icon">
                                  <SubwayIcon />
                                </span>
                                公交/地铁（多方案）
                              </div>
                              <button
                                className="tm-btn tm-btn--small tm-btn--ghost"
                                type="button"
                                onClick={() => {
                                  const len = data.places.length
                                  setExpandedPlaces((prev) => {
                                    const next = prev.length === len ? prev.slice() : Array.from({ length: len }, () => false)
                                    next[placeIdx] = !expanded
                                    return next
                                  })
                                }}
                              >
                                {expanded ? '收起' : '展开'}
                              </button>
                            </div>
                            {c?.transit?.plans?.length ? (
                              expanded ? (
                                <div className="tm-planlist">
                                  {(() => {
                                    const planMeta = c.transit.plans.map((plan, idx) => {
                                      const legs = getPlanLegs(plan)
                                      const transitLegs = legs.filter((l) => l.kind === 'bus' || l.kind === 'subway' || l.kind === 'railway')
                                      const transferCount = transitLegs.length ? Math.max(0, transitLegs.length - 1) : null
                                      return { plan, legs, transferCount, idx }
                                    })
                                    const minDuration = planMeta.length ? Math.min(...planMeta.map((m) => m.plan.durationSeconds)) : null
                                    const minWalking = (() => {
                                      const values = planMeta
                                        .map((m) => m.plan.walkingDistanceMeters)
                                        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
                                      return values.length ? Math.min(...values) : null
                                    })()
                                    const minCost = (() => {
                                      const values = planMeta
                                        .map((m) => m.plan.costYuan)
                                        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
                                      return values.length ? Math.min(...values) : null
                                    })()
                                    const minTransfers = (() => {
                                      const values = planMeta
                                        .map((m) => m.transferCount)
                                        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
                                      return values.length ? Math.min(...values) : null
                                    })()
                                    const taggedPlans = planMeta.map((meta) => {
                                      const tags = [
                                        minDuration !== null && meta.plan.durationSeconds === minDuration
                                          ? { id: 'time', label: '时间短', icon: <ClockIcon /> }
                                          : null,
                                        minWalking !== null && meta.plan.walkingDistanceMeters === minWalking
                                          ? { id: 'walk', label: '步行少', icon: <WalkIcon /> }
                                          : null,
                                        minTransfers !== null && meta.transferCount === minTransfers
                                          ? { id: 'transfer', label: '换乘少', icon: <SubwayIcon /> }
                                          : null,
                                        minCost !== null && meta.plan.costYuan === minCost
                                          ? { id: 'cost', label: '花费少', icon: <CoinIcon /> }
                                          : null,
                                      ].filter(Boolean) as Array<{ id: 'time' | 'walk' | 'transfer' | 'cost'; label: string; icon: ReactNode }>
                                      const tagFlags = {
                                        time: tags.some((tag) => tag.id === 'time'),
                                        walk: tags.some((tag) => tag.id === 'walk'),
                                        transfer: tags.some((tag) => tag.id === 'transfer'),
                                        cost: tags.some((tag) => tag.id === 'cost'),
                                      }
                                      return { ...meta, tags, tagFlags }
                                    })
                                    const tagPriority: Array<'time' | 'walk' | 'transfer' | 'cost'> = ['time', 'walk', 'transfer', 'cost']
                                    const sortedPlans = taggedPlans.slice().sort((a, b) => {
                                      for (const key of tagPriority) {
                                        if (a.tagFlags[key] === b.tagFlags[key]) continue
                                        return a.tagFlags[key] ? -1 : 1
                                      }
                                      return a.idx - b.idx
                                    })
                                    return sortedPlans.map(({ plan, legs, idx, tags }, orderIdx) => {
                                      const key = `transit-${selectedHotelIdx}-${placeIdx}-${idx}`
                                      return (
                                        <div key={key} className="tm-plan">
                                          <div className="tm-plan__head">
                                            <div className="tm-plan__meta">
                                              <div className="tm-plan__title">{`方案 ${orderIdx + 1}`}</div>
                                              {tags.length ? (
                                                <div className="tm-plan__tags" aria-label="方案标签">
                                                  {tags.map((tag) => (
                                                    <span key={`${key}-${tag.id}`} className={`tm-plan-tag tm-plan-tag--${tag.id}`}>
                                                      <span className="tm-plan-tag__icon">{tag.icon}</span>
                                                      <span className="tm-plan-tag__text">{tag.label}</span>
                                                    </span>
                                                  ))}
                                                </div>
                                              ) : null}
                                            </div>
                                            <button
                                              className="tm-btn tm-btn--small"
                                              onClick={() => onShowRoute({ mode: 'transit', placeIdx, planIndex: idx })}
                                              disabled={routeLoadingKey === key}
                                            >
                                              {routeLoadingKey === key ? '加载中…' : '在地图上显示'}
                                            </button>
                                          </div>

                                        <div className="tm-plan__statswrap" aria-label="整体行程信息">
                                          <div className="tm-plan__stats">
                                            <div className="tm-stat tm-stat--time">
                                              <span className="tm-stat__icon">
                                                <ClockIcon />
                                              </span>
                                              <div className="tm-stat__row">
                                                <span className="tm-stat__label">用时</span>
                                                <span className="tm-stat__value">{formatDurationCompact(plan.durationSeconds)}</span>
                                              </div>
                                            </div>
                                            <div className="tm-stat tm-stat--cost">
                                              <span className="tm-stat__icon">
                                                <CoinIcon />
                                              </span>
                                              <div className="tm-stat__row">
                                                <span className="tm-stat__label">费用</span>
                                                <span className="tm-stat__value">{formatYuan(plan.costYuan)}</span>
                                              </div>
                                            </div>
                                            <div className="tm-stat tm-stat--walk">
                                              <span className="tm-stat__icon">
                                                <WalkIcon />
                                              </span>
                                              <div className="tm-stat__row">
                                                <span className="tm-stat__label">步行</span>
                                                <span className="tm-stat__value">
                                                  {plan.walkingDistanceMeters !== null ? formatDistanceCompact(plan.walkingDistanceMeters) : '—'}
                                                </span>
                                              </div>
                                            </div>
                                          </div>
                                          {plan.hasTaxi ? <div className="tm-plan__note">含打车段</div> : null}
                                        </div>

                                        {legs.length ? (
                                          <div className="tm-timeline" aria-label="行程分段">
                                            {legs.slice(0, 12).map((l, idx, arr) => (
                                              <span key={`${key}-leg-${idx}`} className="tm-timeline__item">
                                                <span className={`tm-seg tm-seg--${l.kind}`}>
                                                  <span className="tm-seg__icon">
                                                    {l.kind === 'walking' ? (
                                                      <WalkIcon />
                                                    ) : l.kind === 'bus' ? (
                                                      <BusIcon />
                                                    ) : l.kind === 'subway' ? (
                                                      <SubwayIcon />
                                                    ) : l.kind === 'taxi' ? (
                                                      <CarIcon />
                                                    ) : null}
                                                  </span>
                                                  <span className="tm-seg__text">
                                                    {l.kind === 'walking' && typeof l.distanceMeters === 'number'
                                                      ? `步行 ${formatDistanceCompact(l.distanceMeters)}`
                                                      : l.label}
                                                  </span>
                                                </span>
                                                {idx < arr.length - 1 ? <span className="tm-timeline__arrow">→</span> : null}
                                              </span>
                                            ))}
                                          </div>
                                        ) : plan.summary ? (
                                          <div className="tm-plan__summary">{plan.summary}</div>
                                        ) : null}
                                      </div>
                                    )
                                  })
                                })()}
                                </div>
                              ) : fastestTransit ? (
                                <div className="tm-transit-compact">
                                  <div className="tm-transit-compact__head">
                                    <div className="tm-transit-compact__label">最快方案</div>
                                    <button
                                      className="tm-btn tm-btn--small"
                                      onClick={() => onShowRoute({ mode: 'transit', placeIdx, planIndex: fastestTransit.idx })}
                                      disabled={routeLoadingKey === `transit-${selectedHotelIdx}-${placeIdx}-${fastestTransit.idx}`}
                                    >
                                      {routeLoadingKey === `transit-${selectedHotelIdx}-${placeIdx}-${fastestTransit.idx}` ? '加载中…' : '在地图上显示'}
                                    </button>
                                  </div>
                                  <div className="tm-mini-stats" aria-label="最快公交信息">
                                    <span className="tm-mini-pill tm-mini-pill--violet">
                                      <ClockIcon />
                                      {formatDurationCompact(fastestTransit.plan.durationSeconds)}
                                    </span>
                                    <span className="tm-mini-pill tm-mini-pill--violet">
                                      <CoinIcon />
                                      {formatYuan(fastestTransit.plan.costYuan)}
                                    </span>
                                    <span className="tm-mini-pill tm-mini-pill--violet">
                                      <WalkIcon />
                                      {fastestTransit.plan.walkingDistanceMeters !== null
                                        ? formatDistanceCompact(fastestTransit.plan.walkingDistanceMeters)
                                        : '—'}
                                    </span>
                                  </div>
                                </div>
                              ) : null
                            ) : (
                              <div className="tm-muted">{c?.errors?.transit || '暂无结果（跨城/无公交覆盖时常见）'}</div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            ) : null}
          </div>
        ) : (
          <div className="tm-panel tm-hint">
            <div className="tm-section-title">提示</div>
            <ul>
              <li>每行一个地点；也支持直接输入坐标：lng,lat</li>
              <li>尽量把城市写清楚（例如“上海 虹桥火车站”），公交结果更准</li>
              <li>如果地图加载失败，可能需要配置 JSAPI 安全密钥（VITE_AMAP_SECURITY_CODE）</li>
            </ul>
          </div>
        )}
      </div>

      <div
        className="tm-splitter"
        role="separator"
        aria-orientation="vertical"
        onPointerDown={onSplitterPointerDown}
        onPointerMove={onSplitterPointerMove}
        onPointerUp={endSplitterDrag}
        onPointerCancel={endSplitterDrag}
      />
      <div className="tm-mapwrap">
        <MapView
          ref={mapRef}
          amapKey={runtimeAmapKey}
          securityJsCode={runtimeAmapSecurityCode}
          onSelectHotel={handleHotelMarkerSelect}
          onSelectPlace={handlePlaceMarkerSelect}
          onSelectCandidate={handleCandidateMarkerSelect}
          onHoverHotel={handleHotelMarkerHover}
          onHoverPlace={handlePlaceMarkerHover}
        />
      </div>

      {settingsOpen ? (
        <div
          className="tm-modal"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            closeSettingsPanel()
          }}
        >
          <div
            className="tm-modal__panel"
            onClick={(e) => {
              e.stopPropagation()
            }}
          >
            <div className="tm-modal__head">设置</div>
            <div className="tm-modal__body">
              <div className="tm-section tm-section--tight">
                <div className="tm-section__title">API 配置（可留空）</div>
                <div className="tm-field">
                  <label className="tm-label">VITE_AMAP_KEY</label>
                  <input
                    className="tm-input"
                    value={settingsDraft.amapKey}
                    onChange={(e) => setSettingsDraft((prev) => ({ ...prev, amapKey: e.target.value }))}
                    placeholder="留空则使用 .env 中的 VITE_AMAP_KEY"
                  />
                </div>
                <div className="tm-field">
                  <label className="tm-label">AMAP_WEB_KEY</label>
                  <input
                    className="tm-input"
                    value={settingsDraft.amapWebKey}
                    onChange={(e) => setSettingsDraft((prev) => ({ ...prev, amapWebKey: e.target.value }))}
                    placeholder="留空则使用 .env 中的 AMAP_WEB_KEY"
                  />
                </div>
                <div className="tm-field">
                  <label className="tm-label">VITE_AMAP_SECURITY_CODE</label>
                  <div className="tm-field__row">
                    <input
                      className="tm-input"
                      value={settingsDraft.amapSecurityCode}
                      onChange={(e) => setSettingsDraft((prev) => ({ ...prev, amapSecurityCode: e.target.value }))}
                      placeholder="JSAPI 安全密钥（可选）"
                    />
                    <button className="tm-btn tm-btn--small tm-btn--primary" type="button" onClick={saveSettingsLocal}>
                      保存到本地
                    </button>
                  </div>
                  <div className="tm-field__hint">点“保存到本地”才会写入浏览器缓存。</div>
                </div>
              </div>
              <div className="tm-field">
                <label className="tm-label">匹配有误：最多显示候选数</label>
                <input
                  className="tm-input"
                  type="number"
                  min={1}
                  max={20}
                  value={settingsDraft.candidateLimit}
                  onChange={(e) => setSettingsDraft((prev) => ({ ...prev, candidateLimit: e.target.value }))}
                />
              </div>
            </div>
            <div className="tm-modal__actions">
              <button className="tm-btn tm-btn--ghost" type="button" onClick={closeSettingsPanel}>
                取消
              </button>
              <button className="tm-btn tm-btn--ghost" type="button" onClick={clearSettingsLocal}>
                清除本地设置
              </button>
              <button className="tm-btn tm-btn--ghost" type="button" onClick={saveSettingsPanel}>
                仅本次保存
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default CompareView
