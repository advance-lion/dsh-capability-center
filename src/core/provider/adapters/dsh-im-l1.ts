/**
 * dsh-im L1 Provider Adapter.
 *
 * L1 = discover + read: detect the `dshIm` Host service, call
 * `listBots()` to get real bot connections, and project them as
 * ProviderConnectionSummary entries.
 *
 * L2 (actions: send message) will come in V0.4 when we add
 * per-connection action routing.
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
import { normalizeObservedState, deriveHealthState } from '../../domain/status'

export interface DshImL1Context {
  host: unknown
  packageVersion?: string
}

/** Shape of the dshIm Host service (public API). */
interface DshImService {
  listBots?(): Promise<any[]>
  listTargets?(): Promise<any[]>
  send?(msg: any): Promise<any>
}

export function createDshImL1Provider(ctx: DshImL1Context): CapabilityProvider {
  const { host, packageVersion } = ctx
  const hostObj = host as Record<string, unknown>
  const dshImService = hostObj['dshIm'] as DshImService | undefined
  const isInstalled = dshImService !== undefined || packageVersion !== undefined

  const descriptor: ProviderDescriptor = {
    id: 'dsh-im',
    name: 'dsh-im IM 机器人',
    packageName: '@xmanrui/dsh-im',
    version: packageVersion || 'unknown',
    managementMode: 'delegated',
    trust: 'installed-plugin',
    homepage: 'https://github.com/xmanrui/dsh-im',
    levels: ['discover', 'read'],
  }

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
      if (!isInstalled || !dshImService?.listBots) return []

      try {
        const bots = await dshImService.listBots()
        if (!Array.isArray(bots)) return []

        return bots.map((bot: any) => {
          const rawStatus = bot.status || bot.state || 'unknown'
          const observed = normalizeObservedState(
            rawStatus,
            bot.available === true || rawStatus === 'ready',
            undefined,
          )
          const healthState = deriveHealthState(observed, rawStatus)

          return {
            externalInstanceId: bot.id || bot.botId || bot.name || 'unknown',
            methodId: 'dsh-im-bot',
            integrationId: 'dsh-im',
            displayName: bot.name || bot.appName || '飞书 Bot',
            observedState: observed,
            rawStatus,
            observedAt: new Date().toISOString(),
            healthState,
            safeMetadata: {
              appId: bot.appId || null,
              brand: bot.brand || null,
              available: bot.available ?? null,
            },
            activeCapabilities: observed === 'connected'
              ? ['message.send', 'message.receive']
              : [],
          }
        })
      } catch {
        return []
      }
    },

    async inspectConnection(externalInstanceId: string): Promise<ProviderConnectionSummary | undefined> {
      const connections = await this.listConnections()
      return connections.find((c) => c.externalInstanceId === externalInstanceId)
    },

    async listActions(): Promise<ActionDescriptor[]> {
      return isInstalled ? actions : []
    },

    async executeAction(request: { actionId: string }): Promise<ActionResult> {
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
      return { type: 'settings-section', target: 'xmanrui-dsh-im' }
    },
  }
}
