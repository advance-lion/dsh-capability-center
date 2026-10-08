import type { RecipeDocument } from '../domain/types'
import feishuUser from '../../connectors/feishu/feishu-cli-user.recipe.json'
import githubUser from '../../connectors/github/github-cli-user.recipe.json'

export interface RecipeBinding {
  capabilityId: string
  integrationId: string
  methodId: string
  recipe: RecipeDocument
}

/** Review exact method identity before a stable UI capability ID can execute a recipe. */
export function bindRecipes(entries: readonly RecipeBinding[]): Map<string, RecipeDocument> {
  const bound = new Map<string, RecipeDocument>()
  for (const entry of entries) {
    if (!entry.capabilityId || bound.has(entry.capabilityId)) throw new Error('Duplicate or empty capability ID')
    const { recipe } = entry
    if (recipe.schemaVersion !== 1 || recipe.id !== entry.methodId ||
        recipe.methodId !== entry.methodId || recipe.integrationId !== entry.integrationId) {
      throw new Error('Recipe method identity mismatch')
    }
    if (!recipe.intents.connect?.steps?.length || !recipe.intents.verify?.steps?.length) {
      throw new Error('Connection and verification intents are required')
    }
    for (const name of ['connect', 'verify']) {
      const steps = recipe.intents[name].steps
      const last = steps[steps.length - 1]
      if (last.type !== 'assert.expression' || steps.some(step => step.when !== undefined)) {
        throw new Error('Recipe requires an unconditional final assertion')
      }
    }
    bound.set(entry.capabilityId, recipe)
  }
  return bound
}

/** lark-im is provider-managed, not an alias for feishu user CLI credentials. */
export function builtinRecipeBindings(): Map<string, RecipeDocument> {
  return bindRecipes([
    { capabilityId: 'feishu', integrationId: 'feishu', methodId: 'feishu-cli-user', recipe: feishuUser as RecipeDocument },
    { capabilityId: 'github', integrationId: 'github', methodId: 'github-cli-user', recipe: githubUser as RecipeDocument },
  ])
}
