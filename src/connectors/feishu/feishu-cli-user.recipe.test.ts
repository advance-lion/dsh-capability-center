import { describe, expect, it } from 'vitest'
import document from './feishu-cli-user.recipe.json'
import type { RecipeDocument } from '../../core/domain/types'
import { RecipeEngine } from '../../core/recipe/engine'
import { ExecutorRegistry } from '../../core/recipe/executor-registry'
import { registerBuiltinExecutors } from '../../core/recipe/builtin-executors'
import { terminalInteractiveExecutor } from '../../core/recipe/terminal-interactive-executor'

const recipe = document as RecipeDocument
const verifiedUser = { identity: 'user', verified: true, identities: { user: { status: 'logged_in', tokenStatus: 'valid', accessToken: 'synthetic-secret', openId: 'private-id' } } }
function harness(json: unknown, options: { found?: boolean; exitCode?: number; stdout?: string } = {}) {
  const commands: string[] = []
  const registry = new ExecutorRegistry(); registerBuiltinExecutors(registry); registry.register(terminalInteractiveExecutor)
  const engine = new RecipeEngine(registry, {
    subprocess: { resolveExecutable: async () => options.found === false ? null : 'synthetic/lark-cli' },
    shell: {
      resolve: (spec: { command: string }) => spec,
      async run(spec: { command: string }) {
        commands.push(spec.command)
        return { exitCode: options.exitCode ?? 0, stdout: { text: options.stdout ?? JSON.stringify(json) }, stderr: { text: '' } }
      },
    },
  })
  return { engine, commands }
}

describe.each(['connect', 'verify'])('Feishu %s recipe (real source, synthetic CLI)', (intent) => {
  it('accepts a verified user with a valid token and uses only the documented read-only command', async () => {
    const { engine, commands } = harness(verifiedUser)
    expect(await engine.executeIntent(recipe, intent)).toMatchObject({ state: 'completed' })
    expect(commands).toEqual(['lark-cli auth status --json --verify'])
  })
  it('never persists token/identifier or raw command output in recipe results', async () => {
    const { engine } = harness(verifiedUser)
    const result = await engine.executeIntent(recipe, intent)
    expect(JSON.stringify(result)).not.toMatch(/synthetic-secret|private-id|stdout|stderr/)
  })
  it.each([
    ['null', null], ['empty', {}], ['missing user', { identity: 'user', verified: true, identities: {} }],
    ['needs refresh', { ...verifiedUser, identities: { user: { status: 'needs_refresh', tokenStatus: 'valid' } } }],
    ['logged out', { ...verifiedUser, identities: { user: { status: 'logged_out', tokenStatus: 'missing' } } }],
    ['expired token', { ...verifiedUser, identities: { user: { status: 'logged_in', tokenStatus: 'expired' } } }],
    ['missing token validity', { ...verifiedUser, identities: { user: { status: 'logged_in' } } }],
    ['not verified', { ...verifiedUser, verified: false }],
    ['missing verified', { ...verifiedUser, verified: undefined }],
    ['wrong identity', { ...verifiedUser, identity: 'bot' }],
    // Actual local probe: bot + verified=true + expired user token; not user authentication.
    ['local observation shape', { identity: 'bot', verified: true, identities: { user: { tokenStatus: 'expired' } } }],
  ])('rejects %s instead of inventing a connected user', async (_label, value) => {
    const { engine } = harness(value)
    expect(await engine.executeIntent(recipe, intent)).toMatchObject({ state: 'failed', retryable: false })
  })
  it.each(['', 'not-json'])('rejects invalid stdout %#', async (stdout) => {
    const { engine } = harness(null, { stdout })
    expect(await engine.executeIntent(recipe, intent)).toMatchObject({ state: 'failed', error: { code: 'invalid_json' } })
  })
  it('rejects nonzero process exit even when the JSON claims authenticated', async () => {
    const { engine } = harness(verifiedUser, { exitCode: 5 })
    expect(await engine.executeIntent(recipe, intent)).toMatchObject({ state: 'failed' })
  })
})

describe('Feishu preconditions and user handoff', () => {
  it('a missing CLI stops connect before issuing any command', async () => {
    const { engine, commands } = harness(verifiedUser, { found: false })
    expect(await engine.executeIntent(recipe, 'connect')).toMatchObject({ state: 'failed', error: { code: 'assertion_failed' } })
    expect(commands).toEqual([])
  })
  it('reauthorization waits for a user; terminal acknowledgement alone cannot prove authentication', async () => {
    const { engine, commands } = harness({ ...verifiedUser, verified: false })
    const waiting = await engine.executeIntent(recipe, 'reauthorize')
    expect(waiting.state).toBe('waiting_user'); expect(commands).toEqual([])
    if (waiting.state !== 'waiting_user') throw new Error('Expected a handoff')
    // Synthetic round-trip only. This is NOT security validation of checkpoint ownership.
    const resumed = await engine.resumeIntent(recipe, 'reauthorize', waiting.checkpoint)
    expect(resumed).toMatchObject({ state: 'failed' })
    expect(commands).toEqual(['lark-cli auth status --json --verify'])
  })
  it('does not use conditional verification assertions or the unverified user-me command', () => {
    expect(JSON.stringify(recipe)).not.toContain('user me')
    for (const intent of Object.values(recipe.intents)) {
      for (const step of intent.steps) if (step.type === 'assert.expression') expect(step.when).toBeUndefined()
    }
  })
})
