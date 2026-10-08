import { describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CapabilityRegistry, RecipeFailedError } from './registry'
import { builtinRecipeBindings } from './recipe-bindings'
import { RecipeEngine } from '../recipe/engine'
import { ExecutorRegistry } from '../recipe/executor-registry'
import { registerBuiltinExecutors } from '../recipe/builtin-executors'
import type { Capability, HealthStatus } from './types'
import type { CapabilityCatalog } from './catalog'
import type { CLIAdapter } from '../adapters/cli-adapter'

const cards: Capability[] = [
  { id: 'feishu', name: '飞书', type: 'connector', transport: 'cli', status: 'available' },
  { id: 'github', name: 'GitHub', type: 'connector', transport: 'cli', status: 'available' },
]
const github = { id: 273, type: 'User', login: 'synthetic-user', token: 'synthetic-token' }
const bot = { identity: 'bot', verified: true, identities: { user: { status: 'missing', tokenStatus: 'expired' } } }
function create(read: (command: string) => { exitCode: number; json: unknown }) {
  const calls: string[] = [], registry = new ExecutorRegistry()
  registerBuiltinExecutors(registry)
  const engine = new RecipeEngine(registry, {
    subprocess: { resolveExecutable: async () => 'synthetic/lark-cli' },
    shell: {
      resolve: async (spec: { command: string }) => spec,
      run: async (spec: { command: string }) => {
        calls.push(spec.command)
        const response = read(spec.command)
        return { exitCode: response.exitCode, stdout: { text: JSON.stringify(response.json) }, stderr: { text: '' } }
      },
    },
  })
  const catalog = { list: async () => cards, get: async (id: string) => cards.find(c => c.id === id) ?? null } as CapabilityCatalog
  const cliAdapter = { discover: async () => cards.map(c => ({ ...c, status: 'connected' as const })), health: async () => ({ healthy: true }) } as unknown as CLIAdapter
  const center = new CapabilityRegistry(catalog, undefined, undefined, cliAdapter, undefined, undefined, engine, builtinRecipeBindings())
  return { center, calls }
}

describe('real Registry recipe routes, no adapter identity shortcut', () => {
  it('connect and verify GitHub by GET /user and redact account details in health', async () => {
    const { center, calls } = create(command => ({ exitCode: 0, json: command.startsWith('gh ') ? github : bot }))
    await center.connect('github')
    const health = await center.verify('github')
    expect(health).toMatchObject({ healthy: true })
    expect(JSON.stringify(health)).not.toMatch(/273|synthetic-user|synthetic-token/)
    expect(calls).toEqual(['gh api --hostname github.com --method GET user', 'gh api --hostname github.com --method GET user'])
  })
  it('refuses false positive CLI discovery for bot identity and preserves GitHub success', async () => {
    const { center } = create(command => ({ exitCode: 0, json: command.startsWith('gh ') ? github : bot }))
    await center.refreshInBackground()
    const list = await center.list()
    expect(list.find(c => c.id === 'feishu')?.status).toBe('error')
    expect(list.find(c => c.id === 'github')?.status).toBe('connected')
    expect((await center.verify('feishu')).healthy).toBe(false)
  })
  it('does not accept nonzero command exit or invalid identity despite CLI adapter health', async () => {
    const { center } = create(command => ({ exitCode: command.startsWith('gh ') ? 1 : 0, json: github }))
    const health: HealthStatus = await center.health('github')
    expect(health.healthy).toBe(false)
    await expect(center.connect('github')).rejects.toMatchObject({ code: 'command_failed' })
  })
  it('does not recurse or fall back to a healthy CLI adapter when the recipe engine is missing', async () => {
    const catalog = { list: async () => cards, get: async (id: string) => cards.find(c => c.id === id) ?? null } as CapabilityCatalog
    const center = new CapabilityRegistry(catalog, undefined, undefined, undefined, undefined, undefined, undefined, builtinRecipeBindings())
    expect((await center.verify('github')).healthy).toBe(false)
    await expect(center.connect('github')).rejects.toMatchObject({ code: 'recipe_engine_unavailable' })
  })
  it('does not resurrect cached connector identities or IM installation after restart', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'capability-connector-test-'))
    try {
      const cache = join(directory, 'cache.json')
      await mkdir(directory, { recursive: true })
      await writeFile(cache, JSON.stringify({ schemaVersion: 1, lastRefresh: Date.now(),
        statusMap: { github: 'connected', feishu: 'connected', 'lark-im': 'connected' },
        discovered: [...cards.map(c => ({ ...c, status: 'connected' })),
          { id: 'lark-im', type: 'connector', name: 'IM', status: 'connected' }],
      }))
      const catalog = { list: async () => cards, get: async (id: string) => cards.find(c => c.id === id) ?? null } as CapabilityCatalog
      const center = new CapabilityRegistry(catalog, undefined, undefined, undefined, undefined, cache, undefined, builtinRecipeBindings())
      await center.loadCache()
      const listed = await center.list()
      expect(listed.find(c => c.id === 'github')?.status).toBe('available')
      expect(listed.find(c => c.id === 'feishu')?.status).toBe('available')
      expect(listed.some(c => c.id === 'lark-im')).toBe(false)
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
  it('never invokes legacy logout or unsafe reauthorization through a read-only binding', async () => {
    const { center, calls } = create(() => ({ exitCode: 0, json: github }))
    await expect(center.disconnect('github')).rejects.toMatchObject({ code: 'disconnect_unsupported' })
    await expect(center.reauthorize('feishu')).rejects.toMatchObject({ code: 'reauthorize_unsupported' })
    expect(calls).toEqual([])
  })
  it('rejects a completed recipe without final assertion rather than declaring connected', async () => {
    const { center } = create(() => ({ exitCode: 0, json: github }))
    const bindings = builtinRecipeBindings()
    const gh = bindings.get('github')!
    bindings.set('github', { ...gh, intents: { ...gh.intents, connect: { steps: gh.intents.connect.steps.slice(0, 1) } } })
    const alternate = new CapabilityRegistry({ list: async () => cards, get: async (id: string) => cards.find(c => c.id === id) ?? null } as CapabilityCatalog, undefined, undefined, undefined, undefined, undefined, { executeIntent: async () => ({ state: 'completed', stepOutputs: {} }) } as unknown as RecipeEngine, bindings)
    await expect(alternate.connect('github')).rejects.toBeInstanceOf(RecipeFailedError)
    expect((await center.verify('github')).healthy).toBe(true)
  })
})
