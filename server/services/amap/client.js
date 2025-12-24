import { createRateLimiter, sleep } from '../../utils.js'

const AMAP_API_BASE = 'https://restapi.amap.com/v3'
const AMAP_API_BASE_V4 = 'https://restapi.amap.com/v4'
const AMAP_CONCURRENCY = Number(process.env.AMAP_CONCURRENCY || 2)
const AMAP_QPS = Number(process.env.AMAP_QPS || 3)
const AMAP_MAX_RETRIES = Number(process.env.AMAP_MAX_RETRIES || 3)
const AMAP_TIMEOUT_MS = Number(process.env.AMAP_TIMEOUT_MS || 8000)
const AMAP_QUEUE_LIMIT = Number(process.env.AMAP_QUEUE_LIMIT || 120)

const requestLimiter = createRateLimiter({
  maxConcurrent: Number.isFinite(AMAP_CONCURRENCY) && AMAP_CONCURRENCY > 0 ? AMAP_CONCURRENCY : 2,
  minIntervalMs: Number.isFinite(AMAP_QPS) && AMAP_QPS > 0 ? Math.ceil(1000 / AMAP_QPS) : 350,
  maxQueueSize: Number.isFinite(AMAP_QUEUE_LIMIT) && AMAP_QUEUE_LIMIT >= 0 ? AMAP_QUEUE_LIMIT : undefined,
})

export function getAmapKey(override) {
  const custom = typeof override === 'string' ? override.trim() : ''
  if (custom) return custom
  return process.env.AMAP_WEB_KEY || process.env.AMAP_KEY || process.env.VITE_AMAP_KEY || ''
}

function requireAmapKey(override) {
  const key = getAmapKey(override)
  if (!key) throw new Error('缺少高德 Key：请设置 AMAP_WEB_KEY 或 AMAP_KEY（也可复用 VITE_AMAP_KEY）')
  return key
}

function buildUrl(base, pathname, params) {
  const url = new URL(`${base}/${pathname}`)
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    url.searchParams.set(key, String(value))
  }
  return url
}

export async function amapGetJson(pathname, params, amapKey, options = {}) {
  const {
    base = AMAP_API_BASE,
    isOk = (json) => json?.status === '1',
    getErrorInfo = (json) => ({
      info: String(json?.info || 'UNKNOWN'),
      code: String(json?.infocode || 'N/A'),
    }),
    isQpsExceeded = (info, code) => code === '10021' || info === 'CUQPS_HAS_EXCEEDED_THE_LIMIT',
  } = options

  const url = buildUrl(base, pathname, { ...params, key: requireAmapKey(amapKey) })
  const maxRetries = Number.isFinite(AMAP_MAX_RETRIES) ? Math.max(0, Math.min(AMAP_MAX_RETRIES, 8)) : 3
  const timeoutMs = Number.isFinite(AMAP_TIMEOUT_MS) && AMAP_TIMEOUT_MS > 0 ? AMAP_TIMEOUT_MS : 8000

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const json = await requestLimiter(async () => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const resp = await fetch(url, { signal: controller.signal })
        if (!resp.ok) {
          throw new Error(`高德请求失败：${resp.status} ${resp.statusText}`)
        }
        return /** @type {any} */ (await resp.json())
      } catch (err) {
        if (err?.name === 'AbortError') {
          throw new Error(`高德请求超时（${timeoutMs}ms）`)
        }
        throw err
      } finally {
        clearTimeout(timeoutId)
      }
    })

    if (isOk(json)) return json

    const { info, code } = getErrorInfo(json)
    const qpsExceeded = isQpsExceeded(info, code)
    if (qpsExceeded && attempt < maxRetries) {
      const backoffMs = 350 * Math.pow(2, attempt) + Math.floor(Math.random() * 120)
      await sleep(backoffMs)
      continue
    }

    throw new Error(`高德返回错误：${info} (${code})`)
  }

  throw new Error('高德请求失败：重试次数已用尽')
}

export const amapBases = {
  v3: AMAP_API_BASE,
  v4: AMAP_API_BASE_V4,
}
