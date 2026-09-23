/**
 * Capability Registry — answers "what do I have, and what state is it in?"
 *
 * V0.1 caching architecture:
 * - Static data (manifests) lives in the Catalog — instant, always in memory.
 * - Discovered data (skill/MCP/CLI status) is cached in memory + persisted to
 *   ~/.dsh/capability-center/cache.json so it survives restarts.
 * - list() returns cached data immediately (instant) and triggers a
 *   background refresh if the cache is stale (5 min TTL).
 * - health(id) does a real-time check for a single capability (on-demand).
 *
 * The Registry is a dispatcher: it delegates to adapters for actual work.
 */
import type {
  Capability,
  CapabilityStatus,
  HealthStatus,
} from './types'
import type { CapabilityCatalog } from './catalog'
import type { SkillAdapter } from '../adapters/skill-adapter'
import type { MCPAdapter } from '../adapters/mcp-adapter'
import type { CLIAdapter } from '../adapters/cli-adapter'
import type { IMRecommendationAdapter } from '../adapters/im-recommendation-adapter'

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

interface CacheFile {
  schemaVersion: 1
  lastRefresh: number
  statusMap: Record<string, CapabilityStatus>
  discovered: Capability[]
}

export class CapabilityRegistry {
  /** Live status overrides from detection (in-memory). */
  private statusMap = new Map<string, CapabilityStatus>()
  /** Cached discovered capabilities from last refresh. */
  private discoveredCache: Capability[] = []
  /** Cache file path (undefined = no persistence). */
  private readonly cacheFile: string | undefined
  /** Last background refresh timestamp. */
  private lastRefresh = 0
  /** Guard against concurrent refreshes. */
  private refreshing = false

  constructor(
    private catalog: CapabilityCatalog,
    private skillAdapter?: SkillAdapter,
    private mcpAdapter?: MCPAdapter,
    private cliAdapter?: CLIAdapter,
    private imAdapter?: IMRecommendationAdapter,
    cacheFile?: string,
  ) {
    this.cacheFile = cacheFile
  }

  // ── Cache I/O ────────────────────────────────────────────────

  /** Load cached state from disk. Call once on startup. */
  async loadCache(): Promise<void> {
    if (!this.cacheFile) return
    try {
      const fs = await import('node:fs/promises')
      const content = await fs.readFile(this.cacheFile, 'utf-8')
      const data: CacheFile = JSON.parse(content)
      this.discoveredCache = data.discovered || []
      this.statusMap = new Map(Object.entries(data.statusMap || {}))
      this.lastRefresh = data.lastRefresh || 0
    } catch {
      // File doesn't exist yet — start empty
    }
  }

  /** Persist cache to disk (atomic write). */
  private async saveCache(): Promise<void> {
    if (!this.cacheFile) return
    try {
      const fs = await import('node:fs/promises')
      const path = await import('node:path')
      const dir = path.dirname(this.cacheFile)
      try { await fs.mkdir(dir, { recursive: true }) } catch { /* exists */ }
      const data: CacheFile = {
        schemaVersion: 1,
        lastRefresh: this.lastRefresh,
        statusMap: Object.fromEntries(this.statusMap),
        discovered: this.discoveredCache,
      }
      const tmp = this.cacheFile + '.tmp'
      await fs.writeFile(tmp, JSON.stringify(data, null, 2), { mode: 0o600 })
      await fs.rename(tmp, this.cacheFile)
    } catch {
      // Non-fatal — cache is best-effort
    }
  }

  // ── Background refresh ──────────────────────────────────────

  /**
   * Run all adapter discoveries in parallel, update cache, persist.
   * Non-blocking: callers should fire-and-forget this.
   */
  async refreshInBackground(): Promise<void> {
    if (this.refreshing) return
    this.refreshing = true
    try {
      const [skillResult, mcpResult, cliResult, imResult] = await Promise.allSettled([
        this.skillAdapter?.discover().catch(() => []) ?? Promise.resolve([]),
        this.mcpAdapter?.discover().catch(() => []) ?? Promise.resolve([]),
        this.cliAdapter?.discover().catch(() => []) ?? Promise.resolve([]),
        this.imAdapter?.getRecommendation().catch(() => undefined),
      ])

      const skillCaps = skillResult.status === 'fulfilled' ? skillResult.value : []
      const mcpCaps = mcpResult.status === 'fulfilled' ? mcpResult.value : []
      const cliCaps = cliResult.status === 'fulfilled' ? cliResult.value : []
      const imCap = imResult.status === 'fulfilled' ? imResult.value : undefined

      // Merge discovered capabilities (later entries override earlier)
      const merged = new Map<string, Capability>()
      for (const cap of skillCaps) merged.set(cap.id, cap)
      for (const cap of mcpCaps) merged.set(cap.id, cap)
      for (const cap of cliCaps) merged.set(cap.id, cap)
      if (imCap) merged.set(imCap.id, imCap)

      this.discoveredCache = [...merged.values()]

      // Update status map from fresh detections
      for (const cap of this.discoveredCache) {
        this.statusMap.set(cap.id, cap.status)
      }

      this.lastRefresh = Date.now()
      await this.saveCache()
    } finally {
      this.refreshing = false
    }
  }

  // ── Read operations (cache-first) ────────────────────────────

  /**
   * List all capabilities with cached status.
   * Returns instantly from memory; triggers background refresh if stale.
   */
  async list(): Promise<Capability[]> {
    // Trigger background refresh if cache is stale (non-blocking)
    if (Date.now() - this.lastRefresh > CACHE_TTL_MS && !this.refreshing) {
      this.refreshInBackground().catch(() => {})
    }

    // Get static catalog data (instant — from providers)
    const catalogCaps = await this.catalog.list()

    // Merge: catalog (static) + discovered cache (dynamic)
    const merged = new Map<string, Capability>()
    for (const cap of catalogCaps) merged.set(cap.id, cap)
    for (const cap of this.discoveredCache) merged.set(cap.id, cap)

    // Apply cached status overrides
    return [...merged.values()].map((cap) => ({
      ...cap,
      status: this.statusMap.get(cap.id) ?? cap.status,
    }))
  }

  /** Get a single capability with live status. */
  async get(id: string): Promise<Capability | null> {
    return (await this.list()).find((cap) => cap.id === id) ?? null
  }

  // ── Mutations (dispatch to adapters) ─────────────────────────

  async install(id: string): Promise<void> {
    const cap = await this.catalog.get(id)
    if (!cap) throw new Error(`Capability not found: ${id}`)
    switch (cap.type) {
      case 'skill': await this.skillAdapter?.install(cap); break
      case 'connector':
        if (cap.transport === 'mcp') await this.mcpAdapter?.install(cap)
        else if (cap.transport === 'cli') await this.cliAdapter?.install?.(cap)
        break
      case 'partner': throw new Error('Partner installation is managed by dsh-agent-partners')
    }
    this.statusMap.set(id, 'installed')
    this.refreshInBackground().catch(() => {})
  }

  async uninstall(id: string): Promise<void> {
    const cap = await this.catalog.get(id)
    if (!cap) return
    switch (cap.type) {
      case 'skill': await this.skillAdapter?.uninstall(cap); break
      case 'connector':
        if (cap.transport === 'mcp') await this.mcpAdapter?.uninstall(cap)
        else if (cap.transport === 'cli') await this.cliAdapter?.uninstall?.(cap)
        break
    }
    this.statusMap.delete(id)
    this.refreshInBackground().catch(() => {})
  }

  async enable(id: string): Promise<void> {
    const cap = await this.catalog.get(id)
    if (!cap) return
    if (cap.type === 'skill') await this.skillAdapter?.enable(cap)
    this.statusMap.set(id, 'installed')
    this.refreshInBackground().catch(() => {})
  }

  async disable(id: string): Promise<void> {
    const cap = await this.catalog.get(id)
    if (!cap) return
    if (cap.type === 'skill') await this.skillAdapter?.disable(cap)
    this.statusMap.set(id, 'disabled')
    this.refreshInBackground().catch(() => {})
  }

  async connect(id: string): Promise<void> {
    const cap = await this.catalog.get(id)
    if (!cap || cap.type !== 'connector') return
    if (cap.transport === 'mcp') await this.mcpAdapter?.connect(cap)
    else if (cap.transport === 'cli') await this.cliAdapter?.connect(cap)
    this.statusMap.set(id, 'connected')
    this.refreshInBackground().catch(() => {})
  }

  async disconnect(id: string): Promise<void> {
    const cap = await this.catalog.get(id)
    if (!cap || cap.type !== 'connector') return
    if (cap.transport === 'mcp') await this.mcpAdapter?.disconnect(cap)
    else if (cap.transport === 'cli') await this.cliAdapter?.disconnect(cap)
    this.statusMap.set(id, 'installed')
    this.refreshInBackground().catch(() => {})
  }

  /** Real-time health check for a single capability (on-demand). */
  async health(id: string): Promise<HealthStatus> {
    const cap = await this.catalog.get(id)
    if (!cap) return { healthy: false, message: 'Not found' }
    if (cap.type === 'connector') {
      if (cap.transport === 'mcp') return (await this.mcpAdapter?.health(cap)) ?? { healthy: false }
      if (cap.transport === 'cli') return (await this.cliAdapter?.health(cap)) ?? { healthy: false }
    }
    return { healthy: true }
  }
}
