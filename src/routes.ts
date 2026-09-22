/**
 * HTTP routes — REST endpoints under /api/capability-center/*.
 *
 * These are used by the Client half (browser) to fetch and mutate capability
 * state. The routes delegate to the CapabilityRegistry.
 */
import type { CapabilityRegistry } from './core/capability/registry'
import type { CapabilityCatalog } from './core/capability/catalog'

export interface RouteContext {
  registry: CapabilityRegistry
  catalog: CapabilityCatalog
}

/** Register all capability-center routes on the DSH webserver. */
export function registerRoutes(ctx: any, routeContext: RouteContext): void {
  const { registry, catalog } = routeContext
  const router = ctx.get('dsh.webserver.router')
  if (!router) return

  // GET /api/capability-center/list?type=&category=&search=
  router.get('/api/capability-center/list', async (req: any) => {
    const { type, category, search } = req.query || {}
    const capabilities = await registry.list()
    let result = capabilities

    if (type) result = result.filter((c: any) => c.type === type)
    if (category && category !== 'all')
      result = result.filter((c: any) => c.category?.includes(category))
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(
        (c: any) =>
          c.name?.toLowerCase().includes(q) ||
          c.description?.toLowerCase().includes(q),
      )
    }

    return { capabilities: result }
  })

  // GET /api/capability-center/:id
  router.get('/api/capability-center/:id', async (req: any) => {
    const capability = await registry.get(req.params.id)
    return { capability }
  })

  // POST /api/capability-center/:id/install
  router.post('/api/capability-center/:id/install', async (req: any) => {
    await registry.install(req.params.id)
    return { ok: true }
  })

  // POST /api/capability-center/:id/uninstall
  router.post('/api/capability-center/:id/uninstall', async (req: any) => {
    await registry.uninstall(req.params.id)
    return { ok: true }
  })

  // POST /api/capability-center/:id/enable
  router.post('/api/capability-center/:id/enable', async (req: any) => {
    await registry.enable(req.params.id)
    return { ok: true }
  })

  // POST /api/capability-center/:id/disable
  router.post('/api/capability-center/:id/disable', async (req: any) => {
    await registry.disable(req.params.id)
    return { ok: true }
  })

  // POST /api/capability-center/:id/connect
  router.post('/api/capability-center/:id/connect', async (req: any) => {
    await registry.connect(req.params.id)
    return { ok: true }
  })

  // POST /api/capability-center/:id/disconnect
  router.post('/api/capability-center/:id/disconnect', async (req: any) => {
    await registry.disconnect(req.params.id)
    return { ok: true }
  })

  // GET /api/capability-center/:id/health
  router.get('/api/capability-center/:id/health', async (req: any) => {
    const health = await registry.health(req.params.id)
    return health
  })
}
