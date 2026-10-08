import { describe, expect, it } from 'vitest'
import type { RecipeDocument } from '../domain/types'
import { bindRecipes, builtinRecipeBindings } from './recipe-bindings'
import github from '../../connectors/github/github-cli-user.recipe.json'

const entry = () => ({ capabilityId: 'github', integrationId: 'github', methodId: 'github-cli-user', recipe: structuredClone(github) as RecipeDocument })

describe('reviewed connector binding', () => {
  it('keeps the existing two CLI cards bound to distinct user identities', () => {
    const bindings = builtinRecipeBindings()
    expect([...bindings.keys()]).toEqual(['feishu', 'github'])
    expect(bindings.get('feishu')?.methodId).toBe('feishu-cli-user')
    expect(bindings.get('github')?.methodId).toBe('github-cli-user')
    expect(bindings.has('lark-im')).toBe(false)
  })
  it('rejects forged or duplicate method bindings', () => {
    const mismatched = entry(); mismatched.methodId = 'feishu-cli-user'
    expect(() => bindRecipes([mismatched])).toThrow('Recipe method identity mismatch')
    expect(() => bindRecipes([entry(), entry()])).toThrow('Duplicate')
  })
  it('rejects missing or conditional terminal authentication checks', () => {
    const noAssert = entry(); noAssert.recipe.intents.verify.steps.pop()
    expect(() => bindRecipes([noAssert])).toThrow('unconditional final assertion')
    const conditional = entry(); conditional.recipe.intents.connect.steps[1].when = { exists: { path: 'maybe' } }
    expect(() => bindRecipes([conditional])).toThrow('unconditional final assertion')
  })
})
