/**
 * Capability Registry — answers "what do I have, and what state is it in?"
 *
 * V0.2: Recipe Runtime integrated.
 * - connect() runs the recipe's "connect" intent
 * - verify() runs the recipe's "verify" intent
 * - reauthorize() runs the recipe's "reauthorize" intent
 * - If a recipe step returns waiting_user, the challenge is thrown
 *   as an error with structured info for the UI to display.
 *
 * V0.1 caching architecture:
 * - Static data (manifests) lives in the Catalog — instant, always in memory.
 * - Discovered data (skill/MCP/CLI status) is cached in memory + persisted to
 *   ~/.dsh/capability-center/cache.json so it survives restarts.
 * - list() returns cached data immediately (instant) and triggers a
 *   background refresh if the cache is stale (5 min TTL).
 * - health(id) does a real-time check for a single capability (on-demand).
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
import type { RecipeEngine, RecipeRunResult } from '../recipe/engine'
import type { RecipeDocument } from '../domain/types'

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

/** Error thrown when a recipe needs user interaction. */
export class RecipeWaitingError extends Error {
  constructor(
    public readonly challenge: { type: string; message: string; command?: string },
    public readonly recipeId: string,
    public readonly intent: string,
    public readonly checkpoint: unknown,
  ) {
    super(challenge.message)
    this.name = 'RecipeWaitingError'
  }
}

/** Error thrown when a recipe fails. */
export class RecipeFailedError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly code: string,
  ) {
    super(message)
    this.name = 'RecipeFailedError'
  }
}

interface CacheFile {
  schemaVersion: 1
  lastRefresh: number
  statusMap: Record<string, CapabilityStatus>
  discovered: Capability[]
}

export class CapabilityRegistry {
  private statusMap = new Map<string, CapabilityStatus>()
  private discoveredCache: Capability[] = []
  private readonly cacheFile: string | undefined
  private lastRefresh = 0
  private refreshing = false

  constructor(
    private catalog: CapabilityCatalog,
    private skillAdapter?: SkillAdapter,
    private mcpAdapter?: MCPAdapter,
    private cliAdapter?: CLIAdapter,
    private imAdapter?: IMRecommendationAdapter,
    cacheFile?: string,
    private recipeEngine?: RecipeEngine,
    private recipes?: Map<string, RecipeDocument>,
  ) {
    this.cacheFile = cacheFile
  }

  // ── Cache I/O ────────────────────────────────────────────────

  async loadCache(): Promise<void> {
    if (!this.cacheFile) return
    try {
      const fs = await import('node:fs/promises')
      const content = await fs.readFile(this.cacheFile, 'utf-8')
      const data: CacheFile = JSON.parse(content)
      this.discoveredCache = data.discovered || []
      this.statusMap = new Map(Object.entries(data.statusMap || {}))
      this.lastRefresh = data.lastRefresh || 0
    } catch { /* file doesn't exist yet */ }
  }

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
    } catch { /* non-fatal */ }
  }

  // ── Background refresh ──────────────────────────────────────

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
      const merged = new Map<string, Capability>()
      for (const cap of skillCaps) merged.set(cap.id, cap)
      for (const cap of mcpCaps) merged.set(cap.id, cap)
      for (const cap of cliCaps) merged.set(cap.id, cap)
      if (imCap) merged.set(imCap.id, imCap)
      this.discoveredCache = [...merged.values()]
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

  async list(): Promise<Capability[]> {
    if (Date.now() - this.lastRefresh > CACHE_TTL_MS && !this.refreshing) {
      this.refreshInBackground().catch(() => {})
    }
    const catalogCaps = await this.catalog.list()
    const merged = new Map<string, Capability>()
    for (const cap of catalogCaps) merged.set(cap.id, cap)
    for (const cap of this.discoveredCache) merged.set(cap.id, cap)
    return [...merged.values()].map((cap) => ({
      ...cap,
      status: this.statusMap.get(cap.id) ?? cap.status,
    }))
  }

  async get(id: string): Promise<Capability | null> {
    return (await this.list()).find((cap) => cap.id === id) ?? null
  }

  // ── Mutations (dispatch to adapters or recipe engine) ───────

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

  /**
   * Connect a connector. If a recipe exists for this capability,
   * run the recipe's "connect" intent. Otherwise, fall back to the
   * adapter's connect method.
   */
  async connect(id: string): Promise<void> {
    const cap = await this.catalog.get(id)
    if (!cap || cap.type !== 'connector') return

    // Try recipe first
    const recipe = this.findRecipe(id)
    if (recipe && this.recipeEngine) {
      const result = await this.recipeEngine.executeIntent(recipe, 'connect')
      this.handleRecipeResult(result, id, 'connect')
      return
    }

    // Fallback to adapter
    if (cap.transport === 'mcp') await this.mcpAdapter?.connect(cap)
    else if (cap.transport === 'cli') await this.cliAdapter?.connect(cap)
    this.statusMap.set(id, 'connected')
    this.refreshInBackground().catch(() => {})
  }

  async disconnect(id: string): Promise<void> {
    const cap = await this.catalog.get(id)
    if (!cap || cap.type !== 'connector') return

    // Try recipe "disconnect" intent (if exists)
    const recipe = this.findRecipe(id)
    if (recipe && this.recipeEngine && recipe.intents.disconnect) {
      const result = await this.recipeEngine.executeIntent(recipe, 'disconnect')
      this.handleRecipeResult(result, id, 'disconnect')
      return
    }

    // Fallback to adapter
    if (cap.transport === 'mcp') await this.mcpAdapter?.disconnect(cap)
    else if (cap.transport === 'cli') await this.cliAdapter?.disconnect(cap)
    this.statusMap.set(id, 'installed')
    this.refreshInBackground().catch(() => {})
  }

  /**
   * Verify a connector's status. Runs the recipe's "verify" intent
   * if available, otherwise falls back to adapter health check.
   */
  async verify(id: string): Promise<HealthStatus> {
    const cap = await this.catalog.get(id)
    if (!cap) return { healthy: false, message: 'Not found' }

    const recipe = this.findRecipe(id)
    if (recipe && this.recipeEngine && recipe.intents.verify) {
      const result = await this.recipeEngine.executeIntent(recipe, 'verify')
      if (result.state === 'completed') {
        // Derive health from step outputs
        const healthy = this.checkVerificationResult(result.stepOutputs)
        const status: CapabilityStatus = healthy ? 'connected' : 'expired'
        this.statusMap.set(id, status)
        this.refreshInBackground().catch(() => {})
        return { healthy, lastChecked: Date.now() }
      }
      if (result.state === 'failed') {
        this.statusMap.set(id, 'error')
        return { healthy: false, message: result.error.message, lastChecked: Date.now() }
      }
    }

    // Fallback to adapter health
    return this.health(id)
  }

  /**
   * Reauthorize a connector. Runs the recipe's "reauthorize" intent.
   */
  async reauthorize(id: string): Promise<void> {
    const recipe = this.findRecipe(id)
    if (recipe && this.recipeEngine && recipe.intents.reauthorize) {
      const result = await this.recipeEngine.executeIntent(recipe, 'reauthorize')
      this.handleRecipeResult(result, id, 'reauthorize')
      return
    }
    // Fallback: try connect
    await this.connect(id)
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

  // ── Private helpers ─────────────────────────────────────────

  private findRecipe(capId: string): RecipeDocument | undefined {
    return this.recipes?.get(capId)
  }

  private handleRecipeResult(result: RecipeRunResult, capId: string, intent: string): void {
    if (result.state === 'completed') {
      // Derive status from step outputs
      const healthy = this.checkVerificationResult(result.stepOutputs)
      this.statusMap.set(capId, healthy ? 'connected' : 'expired')
      this.refreshInBackground().catch(() => {})
      return
    }

    if (result.state === 'waiting_user') {
      // Throw a structured error with the challenge info
      const c = result.challenge
      throw new RecipeWaitingError(
        {
          type: c.type,
          message: c.type === 'terminal' ? (c as any).message : '需要用户操作',
          command: c.type === 'terminal' ? (c as any).terminalRunRef : undefined,
        },
        capId,
        intent,
        result.checkpoint,
      )
    }

    if (result.state === 'failed') {
      throw new RecipeFailedError(
        result.error.message,
        result.retryable,
        result.error.code,
      )
    }
  }

  /**
   * Check if the verification step outputs indicate a healthy connection.
   * Looks for assert step outputs with `passed: true`.
   */
  private checkVerificationResult(stepOutputs: Record<string, Record<string, unknown>>): boolean {
    for (const output of Object.values(stepOutputs)) {
      if (output.passed === true) return true
      if (output.passed === false) return false
    }
    // If no assert steps, assume success if we got this far
    return true
  }
}
