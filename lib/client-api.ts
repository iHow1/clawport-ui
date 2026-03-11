import type { Agent, CronJob } from '@/lib/types'

const CLIENT_CACHE_TTL_MS = 5_000

interface CacheEntry<T> {
  data: T | null
  expiresAt: number
  promise: Promise<T> | null
}

interface CronsPayload {
  crons: CronJob[]
  pipelines: unknown[]
}

interface ClientApiCache {
  agents: CacheEntry<Agent[]>
  crons: CacheEntry<CronsPayload>
}

const CACHE_KEY = '__clawportClientApiCache'

function createEntry<T>(): CacheEntry<T> {
  return {
    data: null,
    expiresAt: 0,
    promise: null,
  }
}

function getCache(): ClientApiCache {
  const root = globalThis as typeof globalThis & {
    [CACHE_KEY]?: ClientApiCache
  }

  root[CACHE_KEY] ??= {
    agents: createEntry<Agent[]>(),
    crons: createEntry<CronsPayload>(),
  }
  return root[CACHE_KEY]
}

async function getCached<T>(entry: CacheEntry<T>, loader: () => Promise<T>): Promise<T> {
  const now = Date.now()
  if (entry.data !== null && entry.expiresAt > now) {
    return entry.data
  }
  if (entry.promise) {
    return await entry.promise
  }

  entry.promise = loader()
    .then((data) => {
      entry.data = data
      entry.expiresAt = Date.now() + CLIENT_CACHE_TTL_MS
      return data
    })
    .finally(() => {
      entry.promise = null
    })

  return await entry.promise
}

export async function fetchAgentsCached(): Promise<Agent[]> {
  const cache = getCache()
  return await getCached(cache.agents, async () => {
    const response = await fetch('/api/agents')
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const data: unknown = await response.json()
    return Array.isArray(data) ? (data as Agent[]) : []
  })
}

export async function fetchCronsCached(): Promise<CronsPayload> {
  const cache = getCache()
  return await getCached(cache.crons, async () => {
    const response = await fetch('/api/crons')
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data: unknown = await response.json()
    const payload = data as { crons?: CronJob[]; pipelines?: unknown[] } | CronJob[]
    return {
      crons: Array.isArray(payload) ? payload : payload.crons ?? [],
      pipelines: Array.isArray(payload) ? [] : payload.pipelines ?? [],
    }
  })
}

export function invalidateClientApiCache(key?: 'agents' | 'crons'): void {
  const cache = getCache()
  if (!key || key === 'agents') {
    cache.agents = createEntry<Agent[]>()
  }
  if (!key || key === 'crons') {
    cache.crons = createEntry<CronsPayload>()
  }
}
