import { Agent } from '@/lib/types'
import { readFileSync, existsSync } from 'fs'
import { loadRegistry } from '@/lib/agents-registry'

const AGENT_CACHE_TTL_MS = 5_000
const AGENT_CACHE_ENABLED = process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true'

let agentCache:
  | {
      loadedAt: number
      value: Agent[]
    }
  | null = null

export async function getAgents(): Promise<Agent[]> {
  if (
    AGENT_CACHE_ENABLED
    && agentCache
    && Date.now() - agentCache.loadedAt < AGENT_CACHE_TTL_MS
  ) {
    return agentCache.value
  }

  const workspacePath = process.env.WORKSPACE_PATH || ''
  const registry = loadRegistry()

  const agents = registry.map((entry) => {
    let soul: string | null = null
    if (entry.soulPath && workspacePath) {
      try {
        const fullPath = workspacePath + '/' + entry.soulPath
        if (existsSync(fullPath)) {
          soul = readFileSync(fullPath, 'utf-8')
        }
      } catch {
        soul = null
      }
    }
    return {
      ...entry,
      soul,
      crons: [],
    }
  })

  if (AGENT_CACHE_ENABLED) {
    agentCache = {
      loadedAt: Date.now(),
      value: agents,
    }
  }
  return agents
}

export async function getAgent(id: string): Promise<Agent | null> {
  const agents = await getAgents()
  return agents.find((a) => a.id === id) ?? null
}
