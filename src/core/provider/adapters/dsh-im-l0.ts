/**
 * dsh-im L0 Provider Adapter.
 *
 * L0 = discover only: detect the real `dshIm` Host service, read its
 * package version, and provide a navigation entry to dsh-im's settings.
 *
 * Does NOT read internal RPC, does NOT aggregate account state,
 * does NOT pretend connections exist. Per ADR-013, L1+ requires
 * a published Provider Contract v1 from dsh-im.
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

export interface DshImL0Context {
  /** DSH Host context for service detection. */
  host: unknown
  /** Package version of @xmanrui/dsh-im, if installed. */
  packageVersion?: string
}

export function createDshImL0Provider(ctx: DshImL0Context): CapabilityProvider {
  const { host, packageVersion } = ctx

  // Detect the real dshIm service at construction time
  const hostObj = host as Record<string, unknown>
  const dshImService = hostObj['dshIm']
  const isInstalled = dshImService !== undefined || packageVersion !== undefined

  const descriptor: ProviderDescriptor = {
    id: 'dsh-im',
    name: 'dsh-im IM 机器人',
    packageName: '@xmanrui/dsh-im',
    version: packageVersion || 'unknown',
    managementMode: 'delegated',
    trust: 'installed-plugin',
    homepage: 'https://github.com/xmanrui/dsh-im',
    levels: ['discover'],
  }

  // The single method dsh-im exposes at L0
  const methods: ProviderConnectionMethod[] = [
    {
      id: 'dsh-im-bot',
      integrationId: 'dsh-im',
      name: 'IM 机器人托管',
      identityType: 'application',
      transport: 'bot',
      capabilities: ['message.send', 'message.receive', 'bot.manage'],
      accountCardinality: 'multiple',
    },
  ]

  // L0 actions: only navigation to dsh-im settings
  const actions: ActionDescriptor[] = [
    {
      id: 'open-dsh-im-settings',
      label: '管理 IM 机器人',
      risk: 'navigation',
      presentation: 'delegate',
      requiresConfirmation: false,
    },
  ]

  return {
    async descriptor(): Promise<ProviderDescriptor> {
      return descriptor
    },

    async listMethods(): Promise<ProviderConnectionMethod[]> {
      return isInstalled ? methods : []
    },

    async listConnections(): Promise<ProviderConnectionSummary[]> {
      // L0: no connection aggregation. Return empty.
      // L1 will require Provider Contract v1.
      return []
    },

    async inspectConnection(): Promise<ProviderConnectionSummary | undefined> {
      // L0: cannot inspect individual connections.
      return undefined
    },

    async listActions(): Promise<ActionDescriptor[]> {
      return isInstalled ? actions : []
    },

    async executeAction(request: {
      actionId: string
    }): Promise<ActionResult> {
      if (request.actionId === 'open-dsh-im-settings') {
        return {
          state: 'completed',
          observedState: 'unknown',
          message: 'Navigate to dsh-im settings',
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
        target: 'xmanrui-dsh-im',
      }
    },
  }
}
