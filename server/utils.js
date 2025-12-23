export function createConcurrencyLimiter(maxActive) {
  let activeCount = 0
  /** @type {Array<{ fn: () => Promise<unknown>, resolve: (v: unknown) => void, reject: (e: unknown) => void }>} */
  const queue = []

  const tryStartNext = () => {
    while (activeCount < maxActive && queue.length > 0) {
      const item = queue.shift()
      if (!item) return

      activeCount += 1
      item
        .fn()
        .then(item.resolve)
        .catch(item.reject)
        .finally(() => {
          activeCount -= 1
          tryStartNext()
        })
    }
  }

  return function limit(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject })
      tryStartNext()
    })
  }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function createRateLimiter({ maxConcurrent, minIntervalMs, maxQueueSize }) {
  let activeCount = 0
  let lastStartAt = 0
  let timer = null
  const intervalMs = Number.isFinite(minIntervalMs) ? Math.max(0, minIntervalMs) : 0
  const normalizedQueueSize = Number.isFinite(maxQueueSize) ? Math.max(0, Math.floor(maxQueueSize)) : Infinity

  /** @type {Array<{ fn: () => Promise<unknown>, resolve: (v: unknown) => void, reject: (e: unknown) => void }>} */
  const queue = []

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  const tryStartNext = () => {
    clearTimer()

    if (activeCount >= maxConcurrent) return
    const item = queue.shift()
    if (!item) return

    const now = Date.now()
    const waitMs = Math.max(0, intervalMs - (now - lastStartAt))
    if (waitMs > 0) {
      queue.unshift(item)
      timer = setTimeout(tryStartNext, waitMs)
      return
    }

    lastStartAt = Date.now()
    activeCount += 1
    item
      .fn()
      .then(item.resolve)
      .catch(item.reject)
      .finally(() => {
        activeCount -= 1
        tryStartNext()
      })
  }

  return function limit(fn) {
    return new Promise((resolve, reject) => {
      const canStartImmediately =
        activeCount < maxConcurrent &&
        queue.length === 0 &&
        Math.max(0, intervalMs - (Date.now() - lastStartAt)) === 0

      if (normalizedQueueSize !== Infinity && queue.length >= normalizedQueueSize && !canStartImmediately) {
        reject(new Error(`请求过载：限流队列已满（${normalizedQueueSize}）`))
        return
      }

      queue.push({ fn, resolve, reject })
      tryStartNext()
    })
  }
}

export function toTrimmedLines(text) {
  return String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

export function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

export function parseLngLatText(text) {
  const match = String(text)
    .trim()
    .match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/)
  if (!match) return null
  const lng = Number(match[1])
  const lat = Number(match[2])
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
  if (Math.abs(lng) > 180 || Math.abs(lat) > 90) return null
  return { lng, lat }
}

export function parseNumber(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

export function compact(value) {
  return value === undefined ? null : value
}
