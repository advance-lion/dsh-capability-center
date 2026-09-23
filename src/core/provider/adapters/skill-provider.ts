/**
 * Skill Provider — wraps the existing SkillAdapter as a CapabilityProvider.
 *
 * Skills are managed by DSH's own skill system. This provider discovers
 * them and presents them in the unified view. No platform names are
 * hardcoded — skills are discovered dynamically from the DSH skill registry.
 *
 * Level: discover only (L0). Enable/disable/install are handled by
 * DSH's native skill management UI, not by this provider.
 */

import type {
  CapabilityProvider,
  ProviderDescriptor,
  ProviderConnectionMethod,
  ProviderConnectionSummary,
  ActionDescriptor,
  ActionResult,
  ManagerNavigation,
} from '../../domain/types'
import type { DefaultSkillAdapter } from '../../adapters/skill-adapter'
import { classifySkill } from '../../adapters/skill-adapter'

export function createSkillProvider(skillAdapter: DefaultSkillAdapter): CapabilityProvider {
  const descriptor: ProviderDescriptor = {
    id: 'dsh-skills',
    name: 'DSH 技能',
    packageName: '@deepseek-ai/dsh-skill',
    version: 'builtin',
    managementMode: 'delegated',
    trust: 'bundled',
    levels: ['discover'],
  }

  return {
    async descriptor(): Promise<ProviderDescriptor> {
      return descriptor
    },

    async listMethods(): Promise<ProviderConnectionMethod[]> {
      // Skills are discovered dynamically — methods are generated from
      // the skill list at query time, not pre-registered.
      // For V0.1, we return a single "skill" method type.
      return [{
        id: 'dsh-skill',
        integrationId: 'dsh-skills',
        name: 'DSH 技能',
        identityType: 'none',
        transport: 'skill',
        capabilities: ['skill.invoke'],
        accountCardinality: 'single',
      }]
    },

    async listConnections(): Promise<ProviderConnectionSummary[]> {
      // L0: no connection aggregation for skills.
      // Skills are either installed or not — that's a catalog fact,
      // not a runtime connection.
      return []
    },

    async inspectConnection(): Promise<ProviderConnectionSummary | undefined> {
      return undefined
    },

    async listActions(): Promise<ActionDescriptor[]> {
      return [
        {
          id: 'open-skill-settings',
          label: '管理技能',
          risk: 'navigation',
          presentation: 'delegate',
          requiresConfirmation: false,
        },
      ]
    },

    async executeAction(request: {
      actionId: string
    }): Promise<ActionResult> {
      if (request.actionId === 'open-skill-settings') {
        return {
          state: 'completed',
          observedState: 'unknown',
          message: 'Navigate to skill settings',
        }
      }
      return {
        state: 'failed',
        error: {
          category: 'provider',
          code: 'unknown_action',
          message: `Unknown action: ${request.actionId}`,
          retryable: false,
        },
      }
    },

    async openManager(): Promise<ManagerNavigation> {
      return {
        type: 'settings-section',
        target: 'dsh-skills',
      }
    },
  }
}

/**
 * Discover skills and project them as Integration + ConnectionMethod pairs.
 * This is used by the Aggregator to merge skills into the unified view.
 */
export async function discoverSkillIntegrations(
  skillAdapter: DefaultSkillAdapter,
): Promise<Array<{
  integrationId: string
  integrationName: string
  integrationDescription?: string
  integrationIcon?: string
  integrationCategories: string[]
  methodId: string
  methodName: string
  capabilities: string[]
  source: string
  sourceUrl?: string
  installed: boolean
}>> {
  const capabilities = await skillAdapter.discover()
  return capabilities.map((cap) => ({
    integrationId: `skill:${cap.id}`,
    integrationName: cap.name,
    integrationDescription: cap.description,
    integrationIcon: cap.icon,
    integrationCategories: cap.category || ['其他'],
    methodId: `skill:${cap.id}`,
    methodName: '技能',
    capabilities: cap.capabilities || [],
    source: cap.source || 'DSH Skill',
    sourceUrl: cap.sourceUrl,
    installed: cap.status === 'installed' || cap.status === 'connected',
  }))
}
