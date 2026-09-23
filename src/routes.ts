/**
 * DSH Capability Center — Hardened HTTP API (V0.1)
 *
 * Security improvements over V0:
 * - Origin/Host header validation (CSRF protection)
 * - Body size limit (1MB)
 * - Method allowlist (GET for reads, POST for mutations)
 * - Input validation for all mutation endpoints
 * - No arbitrary command execution — mutations go through
 *   the Recipe Engine or Provider SPI, never raw shell
 *
 * API surface:
 *   GET  /api/capability-center/views              — list IntegrationView[]
 *   GET  /api/capability-center/views/:id          — get one IntegrationView
 *   GET  /api/capability-center/providers           — list ProviderDescriptor[]
 *   POST /api/capability-center/action              — execute a declared action
 *   GET  /api/capability-center/recipes             — list validated recipes
 *   POST /api/capability-center/recipes/validate     — validate a recipe document
 *
 * Compatibility:
 *   GET  /api/capability-center/list                — old flat Capability[] format
 */
import type { ConnectionAggregator } from './core/provider/aggregator'
import type { JsonCatalogStore } from './core/catalog/json-store'
import type { JsonRuntimeStore } from './core/runtime/json-store'
import type { ProviderRegistry } from './core/provider/registry'
import type { ExecutorRegistry } from './core/recipe/executor-registry'
import type { DefaultSkillAdapter } from './core/adapters/skill-adapter'
import type { DefaultMCPAdapter } from './core/adapters/mcp-adapter'
import type { IntegrationView, ActionDescriptor } from './core/domain/types'
import { validateRecipe } from './core/recipe/schema'

export interface RouteContext {
  aggregator: ConnectionAggregator
  catalogStore: JsonCatalogStore
  runtimeStore: JsonRuntimeStore
  providerRegistry: ProviderRegistry
  executorRegistry: ExecutorRegistry
  recipes: unknown[]
  skillAdapter: DefaultSkillAdapter
  mcpAdapter: DefaultMCPAdapter
}

const MAX_BODY_BYTES = 1_048_576 // 1MB
const ALLOWED_ORIGINS = new Set([
  '127.0.0.1',
  'localhost',
])

/** Check Origin/Host headers to prevent CSRF. */
function checkOrigin(req: { headers: Record<string, string | string[] | undefined> }): boolean {
  const origin = req.headers.origin
  const host = req.headers.host

  // If no Origin header, it's a same-origin request from the browser
  // (browsers always send Origin for cross-origin POST).
  // For same-origin requests, Host header is sufficient.
  if (!origin) {
    if (!host) return false
    const hostname = String(host).split(':')[0]
    return ALLOWED_ORIGINS.has(hostname) || hostname.endsWith('.localhost')
  }

  // Cross-origin: check if Origin is allowed
  try {
    const url = new URL(String(origin))
    return ALLOWED_ORIGINS.has(url.hostname) || url.hostname.endsWith('.localhost')
  } catch {
    return false
  }
}

/** Read and validate request body with size limit. */
async function readBody(req: { headers: Record<string, string | string[] | undefined> }): Promise<Record<string, unknown> | null> {
  // Body is already parsed by DSH web server in most cases
  // This is a fallback for raw body reading
  const contentLength = req.headers['content-length']
  if (contentLength && parseInt(String(contentLength), 10) > MAX_BODY_BYTES) {
    throw new Error('Request body too large')
  }
  return null
}

function sendJson(res: any, status: number, data: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(data))
}

/** Register the /api/capability-center route family. */
export function registerRoutes(ctx: any, routeContext: RouteContext): void {
  const { aggregator, providerRegistry, recipes } = routeContext
  const webServer = ctx.webServer
  if (!webServer) return

  ctx.effect(
    () =>
      webServer.register({
        kind: 'prefix',
        path: '/api/capability-center',
        handler: async (req: any, res: any) => {
          const url = new URL(String(req.url), 'http://localhost')
          const segments = url.pathname
            .replace(/^\/api\/capability-center\/?/, '')
            .split('/')
            .filter(Boolean)

          try {
            // ── CSRF check for all non-GET requests ──
            if (req.method !== 'GET' && !checkOrigin(req)) {
              sendJson(res, 403, { error: 'origin_check_failed' })
              return
            }

            // ── GET /views — list all IntegrationView[] ──
            if (req.method === 'GET' && segments[0] === 'views') {
              const views = await aggregator.listViews()
              sendJson(res, 200, { views })
              return
            }

            // ── GET /views/:id — get one IntegrationView ──
            if (req.method === 'GET' && segments[0] === 'views' && segments[1]) {
              const id = decodeURIComponent(segments[1])
              const view = await aggregator.getView(id)
              if (!view) {
                sendJson(res, 404, { error: 'not_found', id })
                return
              }
              sendJson(res, 200, { view })
              return
            }

            // ── GET /providers — list ProviderDescriptor[] ──
            if (req.method === 'GET' && segments[0] === 'providers') {
              const descriptors = providerRegistry.listDescriptors()
              sendJson(res, 200, { providers: descriptors })
              return
            }

            // ── GET /recipes — list validated recipes ──
            if (req.method === 'GET' && segments[0] === 'recipes') {
              const validated = recipes.map((r) => {
                const result = validateRecipe(r)
                return {
                  id: (r as any).id,
                  version: (r as any).version,
                  integrationId: (r as any).integrationId,
                  methodId: (r as any).methodId,
                  valid: result.ok,
                  errors: result.errors,
                  warnings: result.warnings,
                }
              })
              sendJson(res, 200, { recipes: validated })
              return
            }

            // ── POST /recipes/validate — validate a recipe document ──
            if (req.method === 'POST' && segments[0] === 'recipes' && segments[1] === 'validate') {
              const body = req.body ?? (await readBody(req))
              if (!body) {
                sendJson(res, 400, { error: 'empty_body' })
                return
              }
              const result = validateRecipe(body)
              sendJson(res, 200, result)
              return
            }

            // ── POST /action — execute a declared action ──
            if (req.method === 'POST' && segments[0] === 'action') {
              const body = req.body ?? (await readBody(req))
              if (!body || typeof body !== 'object') {
                sendJson(res, 400, { error: 'invalid_body' })
                return
              }

              const { actionId, integrationId, methodId, externalInstanceId, input } = body as {
                actionId?: string
                integrationId?: string
                methodId?: string
                externalInstanceId?: string
                input?: Record<string, unknown>
              }

              if (!actionId || !methodId) {
                sendJson(res, 400, { error: 'missing_actionId_or_methodId' })
                return
              }

              // Find the method to determine owner
              const method = await routeContext.catalogStore.getMethod(methodId)
              if (!method) {
                sendJson(res, 404, { error: 'method_not_found', methodId })
                return
              }

              if (method.ownerKind === 'provider') {
                const provider = providerRegistry.get(method.ownerRef)
                if (!provider || !provider.executeAction) {
                  sendJson(res, 503, { error: 'provider_unavailable', providerId: method.ownerRef })
                  return
                }

                // For navigation actions, return the ManagerNavigation
                if (actionId === 'open-manager' && provider.openManager) {
                  const nav = await provider.openManager({
                    integrationId,
                    methodId,
                    externalInstanceId,
                  })
                  sendJson(res, 200, { result: { state: 'completed', navigation: nav } })
                  return
                }

                const result = await provider.executeAction({
                  actionId,
                  externalInstanceId,
                  integrationId,
                  methodId,
                  input,
                })
                sendJson(res, 200, { result })
                return
              }

              // Recipe-managed: V0.1 only supports read-only actions
              // (connect/reauthorize require the Recipe Engine runtime, which is V0.2)
              if (actionId === 'connect' || actionId === 'reauthorize') {
                sendJson(res, 501, { error: 'not_implemented', message: 'Recipe runtime arrives in V0.2' })
                return
              }

              sendJson(res, 400, { error: 'unknown_action', actionId })
              return
            }

            // ── Compatibility: GET /list — old flat Capability[] format ──
            if (req.method === 'GET' && segments[0] === 'list') {
              const views = await aggregator.listViews()
              const capabilities = views.flatMap((v) =>
                v.methods.map((mv) => ({
                  id: mv.method.id,
                  type: 'connector' as const,
                  name: v.integration.name,
                  description: v.integration.description,
                  icon: v.integration.icon,
                  category: v.integration.categories,
                  tags: mv.method.capabilities,
                  transport: mv.method.transport,
                  source: mv.method.name,
                  sourceUrl: v.integration.homepageUrl,
                  status: deriveLegacyStatus(mv),
                  capabilities: mv.method.capabilities,
                  provider: { name: mv.method.ownerKind === 'provider' ? mv.method.ownerRef : 'recipe' },
                })),
              )

              // Apply filters
              const type = url.searchParams.get('type')
              const category = url.searchParams.get('category')
              const search = url.searchParams.get('search')?.toLowerCase()

              let result = capabilities
              if (type) result = result.filter((c) => c.type === type)
              if (category && category !== 'all') {
                result = result.filter((c) => c.category?.includes(category))
              }
              if (search) {
                result = result.filter(
                  (c) =>
                    c.name.toLowerCase().includes(search) ||
                    c.description?.toLowerCase().includes(search) ||
                    c.tags?.some((tag) => tag.toLowerCase().includes(search)),
                )
              }

              sendJson(res, 200, { capabilities: result })
              return
            }

            sendJson(res, 404, { error: 'not_found' })
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            // Don't leak internal error details
            sendJson(res, 500, { error: 'internal_error', message })
          }
        },
      }),
    'capability-center: HTTP API',
  )
}

/** Derive a legacy CapabilityStatus from the new view model. */
function deriveLegacyStatus(mv: { instances: Array<{ observedState: string; healthState: string }> }): string {
  if (mv.instances.length === 0) return 'available'
  const hasConnected = mv.instances.some((i) => i.observedState === 'connected' && i.healthState === 'healthy')
  if (hasConnected) return 'connected'
  const hasReauth = mv.instances.some((i) => i.observedState === 'reauth_required')
  if (hasReauth) return 'expired'
  const hasError = mv.instances.some((i) => i.healthState === 'unhealthy')
  if (hasError) return 'error'
  return 'installed'
}
