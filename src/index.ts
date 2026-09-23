/**
 * DSH Capability Center — Host-side Cordis Plugin Entry (V0.1)
 *
 * Major changes from V0:
 * - No hardcoded capability list. Connector manifests are loaded from
 *   src/connectors/{name}/manifest.json at build time.
 * - New domain layer: Integration → ConnectionMethod → ConnectionInstance.
 * - Provider registry with dsh-im L0 adapter.
 * - Recipe system with built-in executors.
 * - Hardened HTTP API with Origin/CSRF checks.
 *
 * The old flat Capability[] API is preserved via a compatibility projection
 * so the existing UI keeps working during migration.
 */
import { Context } from '@deepseek-ai/cordis'

// New domain layer
import { JsonCatalogStore } from './core/catalog/json-store'
import type { ConnectorManifest } from './core/catalog/manifest'
import { JsonRuntimeStore } from './core/runtime/json-store'
import { ProviderRegistry } from './core/provider/registry'
import { ConnectionAggregator } from './core/provider/aggregator'
import { createDshImL0Provider } from './core/provider/adapters/dsh-im-l0'

// Recipe system
import { ExecutorRegistry } from './core/recipe/executor-registry'
import { registerBuiltinExecutors } from './core/recipe/builtin-executors'
import { validateRecipe } from './core/recipe/schema'

// Existing adapters (still useful for skill/MCP discovery)
import { DefaultSkillAdapter } from './core/adapters/skill-adapter'
import { DefaultMCPAdapter } from './core/adapters/mcp-adapter'

// Routes
import { registerRoutes } from './routes'

// Connector manifests (loaded at build time via resolveJsonModule)
import feishuManifest from './connectors/feishu/manifest.json'
import feishuRecipe from './connectors/feishu/feishu-cli-user.recipe.json'

// ===== Manifest registry =====
const manifests: ConnectorManifest[] = [
  feishuManifest as unknown as ConnectorManifest,
]

// ===== Recipe registry =====
const recipes: unknown[] = [
  feishuRecipe,
]

// ===== Plugin Definition =====
export const name = 'dsh-capability-center'
export const inject = ['webServer']

export function apply(ctx: Context) {
  const logger = ctx.logger('dsh-capability-center')

  // --- Validate recipes at startup ---
  for (const recipe of recipes) {
    const result = validateRecipe(recipe)
    if (!result.ok) {
      logger.error(`Recipe validation failed: ${result.errors.join('; ')}`)
    } else if (result.warnings.length > 0) {
      logger.warn(`Recipe warnings: ${result.warnings.join('; ')}`)
    }
  }

  // --- Create catalog store (loads manifests) ---
  const catalogStore = new JsonCatalogStore()
  catalogStore.loadManifests(manifests)

  // --- Create runtime store (persists to DSH_HOME) ---
  const dshHome = process.env.DSH_HOME || `${process.env.HOME || process.env.USERPROFILE}/.dsh`
  const runtimeStore = new JsonRuntimeStore(dshHome)
  // Load asynchronously — don't block startup
  runtimeStore.load().catch((err) => {
    logger.warn(`Failed to load runtime store: ${err}`)
  })

  // --- Create provider registry ---
  const providerRegistry = new ProviderRegistry()

  // Register dsh-im L0 provider
  const dshImService = ctx.get('dshIm')
  const dshImVersion = detectPackageVersion(ctx, '@xmanrui/dsh-im')
  if (dshImService || dshImVersion) {
    const dshImProvider = createDshImL0Provider({
      host: ctx,
      packageVersion: dshImVersion,
    })
    providerRegistry.register(dshImProvider).catch((err) => {
      logger.warn(`Failed to register dsh-im provider: ${err}`)
    })
  }

  // --- Create aggregator ---
  const aggregator = new ConnectionAggregator(catalogStore, runtimeStore, providerRegistry)

  // --- Create executor registry ---
  const executorRegistry = new ExecutorRegistry()
  registerBuiltinExecutors(executorRegistry)

  // --- Keep existing adapters for skill/MCP discovery ---
  const agentPresets = ctx.get('agentPresets') as
    | { standingKeyFor(id?: string): Promise<object> }
    | undefined
  const skillAdapter = new DefaultSkillAdapter(
    ctx.get('skills'),
    agentPresets ? () => agentPresets.standingKeyFor() : undefined,
  )
  const mcpAdapter = new DefaultMCPAdapter(undefined, ctx)

  // --- Register HTTP routes (hardened) ---
  registerRoutes(ctx, {
    aggregator,
    catalogStore,
    runtimeStore,
    providerRegistry,
    executorRegistry,
    recipes,
    skillAdapter,
    mcpAdapter,
  })

  // Dispose live MCP fibers when the plugin unloads.
  ctx.effect(
    () => () => { void mcpAdapter.dispose() },
    'capability-center: MCP teardown',
  )

  logger.info('Capability Center V0.1 host plugin loaded')
}

// ===== Helpers =====

/**
 * Detect if a package is installed in the DSH profile and return its version.
 * Uses the composition inventory if available; falls back to undefined.
 */
function detectPackageVersion(ctx: Context, packageName: string): string | undefined {
  try {
    // Try reading from the composition's package.json
    const fs = require('node:fs')
    const path = require('node:path')
    const dshHome = process.env.DSH_HOME || `${process.env.HOME || process.env.USERPROFILE}/.dsh`
    const profilePkg = path.join(dshHome, 'profiles', 'web', 'package.json')
    if (fs.existsSync(profilePkg)) {
      const pkg = JSON.parse(fs.readFileSync(profilePkg, 'utf-8'))
      const deps = { ...pkg.dependencies, ...pkg.devDependencies }
      const version = deps[packageName]
      if (version) return version.replace(/[\^~]/, '')
    }
  } catch {
    // Ignore — detection is best-effort
  }
  return undefined
}
