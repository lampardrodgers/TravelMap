import './App.css'
import { useMemo, useRef, useState } from 'react'
import { comparePlaces, fetchRoute, recompareResolved, type CompareResponse, type Comparison } from './api'
import { MapView, type MapViewHandle } from './components/MapView'
import { BusIcon, CarIcon, ClockIcon, CoinIcon, PinIcon, SubwayIcon, WalkIcon } from './components/Icons'

function toErrorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err)
}

type TransitLeg = { kind: 'walking' | 'taxi' | 'bus' | 'subway' | 'railway'; label: string; distanceMeters?: number }

function App() {
  const [city, setCity] = useState('')
  const [cityLimit, setCityLimit] = useState(true)
  const [hotelsText, setHotelsText] = useState('')
  const [placesText, setPlacesText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<CompareResponse | null>(null)
  const [selectedHotelIdx, setSelectedHotelIdx] = useState<number | null>(null)
  const [reversePlaces, setReversePlaces] = useState<boolean[]>([])
  const [reverseLoadingIdx, setReverseLoadingIdx] = useState<number | null>(null)
  const [routeLoadingKey, setRouteLoadingKey] = useState<string | null>(null)
  const mapRef = useRef<MapViewHandle | null>(null)

  const comparisonMap = useMemo(() => {
    const map = new Map<string, Comparison>()
    for (const c of data?.comparisons ?? []) {
      map.set(`${c.hotelIdx}-${c.placeIdx}`, c)
    }
    return map
  }, [data])

  const legsFromSummary = (summary: string): TransitLeg[] => {
    const rawParts = summary
      .split('|')
      .flatMap((s) => s.split('→'))
      .map((s) => s.trim())
      .filter(Boolean)

    const legs: TransitLeg[] = []
    for (const part of rawParts) {
      const p = part.replace(/\u00a0/g, ' ')
      if (p.startsWith('步行')) {
        const m = p.match(/步行\s*([\d.]+)\s*(km|m|公里|米)?/i)
        const num = m ? Number(m[1]) : NaN
        const unit = (m?.[2] || 'm').toLowerCase()
        const distanceMeters =
          Number.isFinite(num) ? Math.round(unit === 'km' || unit === '公里' ? num * 1000 : num) : undefined
        legs.push({ kind: 'walking', label: '步行', distanceMeters })
        continue
      }
      if (p.includes('打车')) {
        const m = p.match(/打车\s*([\d.]+)\s*(km|m|公里|米)?/i)
        const num = m ? Number(m[1]) : NaN
        const unit = (m?.[2] || 'm').toLowerCase()
        const distanceMeters =
          Number.isFinite(num) ? Math.round(unit === 'km' || unit === '公里' ? num * 1000 : num) : undefined
        legs.push({ kind: 'taxi', label: '打车', distanceMeters })
        continue
      }
      const short = p.split('(')[0]?.trim() || p
      if (short.includes('地铁')) {
        legs.push({ kind: 'subway', label: short })
        continue
      }
      if (short.endsWith('路') || short.includes('公交')) {
        legs.push({ kind: 'bus', label: short.replace(/^公交/, '') })
        continue
      }
      legs.push({ kind: 'railway', label: short })
    }

    return legs
  }

  const parseLines = (text: string) =>
    text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)

  const normalizeReversePlaces = (len: number, raw?: boolean[]) => Array.from({ length: len }, (_, i) => raw?.[i] === true)

  const formatDistance = (meters: number) => {
    if (!Number.isFinite(meters)) return '-'
    if (meters < 1000) return `${Math.round(meters)} m`
    return `${(meters / 1000).toFixed(1)} km`
  }

  const formatDistanceCompact = (meters: number) => {
    if (!Number.isFinite(meters)) return '-'
    if (meters < 1000) return `${Math.round(meters)}m`
    return `${(meters / 1000).toFixed(1)}km`
  }

  const formatDuration = (seconds: number) => {
    if (!Number.isFinite(seconds)) return '-'
    const mins = Math.round(seconds / 60)
    if (mins < 60) return `${mins} 分`
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return `${h} 小时 ${m} 分`
  }

  const formatDurationCompact = (seconds: number) => {
    if (!Number.isFinite(seconds)) return '-'
    const mins = Math.round(seconds / 60)
    if (mins < 60) return `${mins}分`
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return `${h}小时${m}分`
  }

  const formatYuan = (value: number | null | undefined) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return '-'
    return `¥${value.toFixed(1).replace(/\\.0$/, '')}`
  }

  const selectHotel = (idx: number | null, nextData: CompareResponse | null = data) => {
    setSelectedHotelIdx(idx)
    if (!nextData) return
    mapRef.current?.setPoints({ hotels: nextData.hotels, places: nextData.places, selectedHotelIdx: idx })
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
      })
      setData(resp)
      setReversePlaces(normalizeReversePlaces(resp.places.length, resp.reversePlaces ?? nextReversePlaces))
      selectHotel(0, resp)
    } catch (err) {
      setData(null)
      setSelectedHotelIdx(null)
      setReversePlaces([])
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
      })

      const idxMap = new Map<string, number>()
      data.comparisons.forEach((c, i) => idxMap.set(`${c.hotelIdx}-${c.placeIdx}`, i))
      const merged = data.comparisons.slice()
      for (const c of resp.comparisons) {
        const key = `${c.hotelIdx}-${c.placeIdx}`
        const i = idxMap.get(key)
        if (i === undefined) merged.push(c)
        else merged[i] = c
      }
      setData({ ...data, comparisons: merged, reversePlaces: resp.reversePlaces })
      setReversePlaces(normalizeReversePlaces(data.places.length, resp.reversePlaces))
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setReverseLoadingIdx(null)
    }
  }

  const onShowRoute = async (params: { mode: 'driving' | 'transit'; placeIdx: number; planIndex?: number }) => {
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
      })
      mapRef.current?.showRoute({ polylines: resp.polylines, segments: resp.segments })
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setRouteLoadingKey(null)
    }
  }

  const selectedHotel = data && selectedHotelIdx !== null ? data.hotels[selectedHotelIdx] : null

  return (
    <div className="tm-root">
      <div className="tm-sidebar">
        <div className="tm-head">
          <div className="tm-head__title">TravelMap</div>
          <div className="tm-head__desc">酒店对比：打车/公交耗时与费用，一眼选出更合适的落脚点</div>
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
                酒店（每行 1 个，可多行）
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
                地点（交通枢纽/公司/景点等，每行 1 个）
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
              <button className="tm-btn tm-btn--ghost" onClick={() => mapRef.current?.clearRoute()}>
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
                    className={`tm-hotel ${selectedHotelIdx === idx ? 'tm-hotel--active' : ''}`}
                    onClick={() => selectHotel(idx)}
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
                <div className="tm-selected__title">当前酒店</div>
                <div className="tm-selected__main">{selectedHotel.name}</div>
                <div className="tm-selected__meta">{selectedHotel.address || selectedHotel.input}</div>
              </div>
            ) : null}

            {selectedHotelIdx !== null ? (
              <>
                <div className="tm-section tm-section--tight">
                  <div className="tm-section__title">目的地</div>
                </div>
                <div className="tm-destlist">
                  {data.places.map((p, placeIdx) => {
                    const c = comparisonMap.get(`${selectedHotelIdx}-${placeIdx}`)
                    const drivingDisabled = routeLoadingKey === `driving-${selectedHotelIdx}-${placeIdx}-0` || !c?.driving
                    const reverse = reversePlaces[placeIdx] === true
                    return (
                      <div key={`${p.input}-${placeIdx}`} className="tm-destcard">
                        <div className="tm-destcard__head">
                          <div className="tm-destcard__toprow">
                            <div className="tm-destcard__name">
                              <span className="tm-place-badge">{`P${placeIdx + 1}`}</span>
                              {p.name}
                            </div>
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
                          <div className="tm-destcard__addr">{p.address || p.input}</div>
                        </div>

                        <div className="tm-destcard__body">
                          <div className="tm-block tm-block--car">
                            <div className="tm-block__top">
                              <div className="tm-block__title tm-block__title--car">
                                <span className="tm-block__icon">
                                  <CarIcon />
                                </span>
                                打车
                              </div>
                              <button
                                className="tm-btn tm-btn--small"
                                onClick={() => onShowRoute({ mode: 'driving', placeIdx })}
                                disabled={drivingDisabled}
                              >
                                {routeLoadingKey === `driving-${selectedHotelIdx}-${placeIdx}-0` ? '加载中…' : '在地图上显示'}
                              </button>
                            </div>
                            {c?.driving ? (
                              <div className="tm-kv">
                                <span className="tm-pill tm-pill--blue">{formatDistance(c.driving.distanceMeters)}</span>
                                <span className="tm-pill tm-pill--blue">{formatDuration(c.driving.durationSeconds)}</span>
                                <span className="tm-pill tm-pill--blue">约 {formatYuan(c.driving.taxiCostYuan)}</span>
                              </div>
                            ) : (
                              <div className="tm-muted">{c?.errors?.driving || '暂无结果'}</div>
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
                            </div>
                            {c?.transit?.plans?.length ? (
                              <div className="tm-planlist">
                                {c.transit.plans.map((plan, i) => {
                                  const key = `transit-${selectedHotelIdx}-${placeIdx}-${i}`
                                  const rawLegs =
                                    plan.legs?.length ? (plan.legs as TransitLeg[]) : plan.summary ? legsFromSummary(plan.summary) : []
                                  const legs = (() => {
                                    if (!plan.summary) return rawLegs
                                    const parsed = legsFromSummary(plan.summary)
                                    if (!parsed.length) return rawLegs
                                    return rawLegs.map((l, idx) => {
                                      if (l.kind === 'walking' && typeof l.distanceMeters !== 'number') {
                                        const p = parsed[idx]
                                        if (p?.kind === 'walking' && typeof p.distanceMeters === 'number') {
                                          return { ...l, distanceMeters: p.distanceMeters }
                                        }
                                      }
                                      return l
                                    })
                                  })()
                                  return (
                                    <div key={key} className="tm-plan">
                                      <div className="tm-plan__head">
                                        <div className="tm-plan__title">{`方案 ${i + 1}`}</div>
                                        <button
                                          className="tm-btn tm-btn--small"
                                          onClick={() => onShowRoute({ mode: 'transit', placeIdx, planIndex: i })}
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
                                })}
                              </div>
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

      <div className="tm-mapwrap">
        <MapView ref={mapRef} />
      </div>
    </div>
  )
}

export default App
