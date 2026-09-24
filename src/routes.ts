/** HTTP routes exposed to the browser half. */
import type { CapabilityCatalog } from './core/capability/catalog'
import type { CapabilityRegistry } from './core/capability/registry'
import { RecipeWaitingError, RecipeFailedError } from './core/capability/registry'
import { importLedger, type LedgerEntry } from './core/catalog/ledger-importer'

export interface RouteContext {
  registry: CapabilityRegistry
  catalog: CapabilityCatalog
}

function sendJson(res: any, status: number, data: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(data))
}

/** Read request body as string. */
function readBody(req: any): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk: Buffer) => {
      data += chunk.toString('utf-8')
      if (data.length > 1024 * 1024) reject(new Error('Body too large'))
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

/** Register the /api/capability-center route family. */
export function registerRoutes(ctx: any, routeContext: RouteContext): void {
  const { registry } = routeContext
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
            // V0.5: Import ledger entries
            if (req.method === 'POST' && segments[0] === 'import-ledger') {
              const body = await readBody(req)
              const entries = JSON.parse(body) as LedgerEntry[]
              if (!Array.isArray(entries)) {
                sendJson(res, 400, { error: 'Expected JSON array of ledger entries' })
                return
              }
              const imported = importLedger(entries)
              sendJson(res, 200, {
                imported: imported.length,
                connectors: imported.map((c) => ({
                  id: c.manifest.id,
                  name: c.manifest.name,
                  recipeId: c.recipe.id,
                })),
              })
              return
            }

            if (req.method === 'GET' && segments[0] === 'list') {
              const type = url.searchParams.get('type')
              const category = url.searchParams.get('category')
              const search = url.searchParams.get('search')?.toLowerCase()
              let result = await registry.list()
              if (type) result = result.filter((cap) => cap.type === type)
              if (category && category !== 'all') {
                result = result.filter((cap) => cap.category?.includes(category))
              }
              if (search) {
                result = result.filter((cap) =>
                  cap.name.toLowerCase().includes(search) ||
                  cap.description?.toLowerCase().includes(search) ||
                  cap.tags?.some((tag) => tag.toLowerCase().includes(search)),
                )
              }
              sendJson(res, 200, { capabilities: result })
              return
            }

            const id = decodeURIComponent(segments[0] ?? '')
            const action = segments[1]
            if (!id) {
              sendJson(res, 404, { error: 'not found' })
              return
            }

            if (req.method === 'GET' && !action) {
              sendJson(res, 200, { capability: await registry.get(id) })
              return
            }
            if (req.method === 'GET' && action === 'health') {
              sendJson(res, 200, await registry.health(id))
              return
            }
            if (req.method === 'GET' && action === 'verify') {
              sendJson(res, 200, await registry.verify(id))
              return
            }
            // V0.4: List connection instances for an integration
            if (req.method === 'GET' && action === 'instances') {
              sendJson(res, 200, { instances: await registry.listInstances(id) })
              return
            }

            const mutations: Record<string, (id: string) => Promise<void>> = {
              install: (value) => registry.install(value),
              uninstall: (value) => registry.uninstall(value),
              enable: (value) => registry.enable(value),
              disable: (value) => registry.disable(value),
              connect: (value) => registry.connect(value),
              disconnect: (value) => registry.disconnect(value),
              reauthorize: (value) => registry.reauthorize(value),
              // V0.4: Instance management
              pause: (value) => registry.pauseInstance(value),
              resume: (value) => registry.resumeInstance(value),
              revoke: (value) => registry.revokeInstance(value),
            }
            if (req.method === 'POST' && action && mutations[action]) {
              await mutations[action](id)
              sendJson(res, 200, { ok: true })
              return
            }

            sendJson(res, 404, { error: 'not found' })
          } catch (error) {
            // RecipeWaitingError: recipe needs user interaction
            if (error instanceof RecipeWaitingError) {
              sendJson(res, 202, {
                ok: false,
                waiting: true,
                challenge: error.challenge,
                recipeId: error.recipeId,
                intent: error.intent,
                checkpoint: error.checkpoint,
              })
              return
            }
            // RecipeFailedError: recipe execution failed
            if (error instanceof RecipeFailedError) {
              sendJson(res, 500, {
                error: error.message,
                code: error.code,
                retryable: error.retryable,
              })
              return
            }
            sendJson(res, 500, {
              error: error instanceof Error ? error.message : String(error),
            })
          }
        },
      }),
    'capability-center: HTTP API',
  )
}
