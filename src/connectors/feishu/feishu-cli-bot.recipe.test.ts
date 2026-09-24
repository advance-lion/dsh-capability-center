import { describe, expect, it } from 'vitest'
import document from './feishu-cli-bot.recipe.json'
import userDocument from './feishu-cli-user.recipe.json'
import type { RecipeDocument } from '../../core/domain/types'
import { RecipeEngine } from '../../core/recipe/engine'
import { ExecutorRegistry } from '../../core/recipe/executor-registry'
import { registerBuiltinExecutors } from '../../core/recipe/builtin-executors'
const bot = document as RecipeDocument, user = userDocument as RecipeDocument
const syntheticVerifiedBot = { identity: 'bot', verified: true, appId: 'private-app', identities: { bot: { verified: true, appSecret: 'synthetic-secret' }, user: { status: 'missing', tokenStatus: 'expired' } } }
function harness(json: unknown, exitCode = 0) {
  const commands: string[] = [], registry = new ExecutorRegistry()
  registerBuiltinExecutors(registry)
  const engine = new RecipeEngine(registry, { shell: {
    resolve: (spec: { command: string }) => spec,
    async run(spec: { command: string }) { commands.push(spec.command); return { exitCode, stdout: { text: JSON.stringify(json) }, stderr: { text: '' } } },
  } })
  return { commands, engine }
}

describe('Feishu bot identity is independent from user identity', () => {
  it('uses a separate method under the same integration, without a user-login intent', () => {
    expect(bot.integrationId).toBe(user.integrationId)
    expect(bot.methodId).not.toBe(user.methodId)
    expect(Object.keys(bot.intents)).toEqual(['connect', 'verify'])
    expect(JSON.stringify(bot)).not.toContain('auth login')
  })
  it.each(['connect', 'verify'])('accepts explicit verified bot proof for %s without requiring a user token', async intent => {
    const h = harness(syntheticVerifiedBot)
    const result = await h.engine.executeIntent(bot, intent)
    expect(result.state).toBe('completed')
    expect(h.commands).toEqual(['lark-cli auth status --json --verify'])
    expect(JSON.stringify(result)).not.toMatch(/private-app|synthetic-secret|expired/)
  })
  it('bot success is not substituted for user success', async () => {
    const h = harness(syntheticVerifiedBot)
    expect((await h.engine.executeIntent(bot, 'verify')).state).toBe('completed')
    expect((await h.engine.executeIntent(user, 'verify')).state).toBe('failed')
  })
  it.each([
    null, {},
    { ...syntheticVerifiedBot, identity: 'none' },
    { ...syntheticVerifiedBot, identity: 'user' },
    { ...syntheticVerifiedBot, verified: false },
    { ...syntheticVerifiedBot, verified: undefined },
    { ...syntheticVerifiedBot, identities: {} },
    { ...syntheticVerifiedBot, identities: { bot: { verified: false } } },
    { ...syntheticVerifiedBot, identities: { bot: { verified: 'true' } } },
    // Real round-10 observation shape, replayed without credentials.
    { identity: 'none', identities: { bot: { status: 'verify_failed', verified: false }, user: { status: 'missing', tokenStatus: 'expired' } } },
  ])('rejects absent, conflicting or failed proof %#', async json => {
    expect(await harness(json).engine.executeIntent(bot, 'verify')).toMatchObject({ state: 'failed', retryable: false })
  })
  it('known nonzero exit cannot be rescued by a successful-looking payload', async () => {
    expect(await harness(syntheticVerifiedBot, 5).engine.executeIntent(bot, 'verify')).toMatchObject({ state: 'failed' })
  })
})
