import { describe, it, expect } from 'vitest'
import document from './github-cli-user.recipe.json'
import type { RecipeDocument } from '../../core/domain/types'
import { RecipeEngine } from '../../core/recipe/engine'
import { ExecutorRegistry } from '../../core/recipe/executor-registry'
import { registerBuiltinExecutors } from '../../core/recipe/builtin-executors'
const recipe = document as RecipeDocument
function run(json: unknown, exitCode = 0) {
  const commands: string[] = []
  const executors = new ExecutorRegistry(); registerBuiltinExecutors(executors)
  const engine = new RecipeEngine(executors, { shell: {
    resolve: (spec: { command: string }) => spec,
    async run(spec: { command: string }) {
      commands.push(spec.command)
      return { exitCode, stdout: { text: JSON.stringify(json) }, stderr: { text: '' } }
    },
  } })
  return { commands, execute: (intent = 'verify') => engine.executeIntent(recipe, intent) }
}
describe('GitHub CLI user recipe, synthetic authenticated API', () => {
  it.each(['connect', 'verify'])('%s reuses existing authentication via an explicit public-host GET', async intent => {
    const h = run({ id: 123, type: 'User', login: 'private-name', email: 'private-email', token: 'synthetic-secret' })
    const result = await h.execute(intent)
    expect(result.state).toBe('completed')
    expect(h.commands).toEqual(['gh api --hostname github.com --method GET user'])
    expect(JSON.stringify(result)).not.toMatch(/private-name|private-email|synthetic-secret/)
  })
  it.each([null, {}, { id: 123 }, { type: 'User' }, { type: 'Bot', id: 123 }, { type: 'User', id: null }, { type: 'User', id: false }, { type: 'User', id: 0 }, { type: 'User', id: '' }, { type: 'User', id: { secret: 'no' } }])('rejects missing/invalid user proof %#', async json => {
    expect(await run(json).execute()).toMatchObject({ state: 'failed' })
  })
  it.each([1, 4, 22])('does not infer authentication on exit code %s', async code => {
    expect(await run({ id: 123, type: 'User' }, code).execute()).toMatchObject({ state: 'failed' })
  })
  it('contains no login, credential mutation or conditional final assertion', () => {
    expect(Object.keys(recipe.intents)).toEqual(['connect', 'verify'])
    for (const intent of Object.values(recipe.intents)) {
      expect(intent.steps.at(-1)?.type).toBe('assert.expression')
      expect(intent.steps.at(-1)?.when).toBeUndefined()
    }
  })
})
