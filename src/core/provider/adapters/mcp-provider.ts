/**
 * MCP Provider — wraps the existing MCPAdapter as a CapabilityProvider.
 *
 * MCP servers are configured in ~/.dsh/mcp.json and managed via Cordis
 * fibers. This provider discovers them, reports real connection state,
 * and exposes connect/disconnect/configure actions.
 *
 * Level: read + actions (L1-L2). The MCP adapter already has real
 * fiber-based connect/disconnect, so we can report actual state.
 */

import type {
  CapabilityProvider,
  ProviderDescriptor,
  ProviderConnectionMethod,
  ProviderConnectionSummary,
  ActionDescriptor,
  ActionResult,
  ManagerNavigation,
  ObservedState,
  HealthState,
} from '../../domain/types'
import type { DefaultMCPAdapter } from '../../adapters/mcp-adapter'
import { normalizeObservedState, deriveHealthState } from '../../domain/status'

export function createMcpProvider(mcpAdapter: DefaultMCPAdapter): CapabilityProvider {
  const descriptor: ProviderDescriptor = {
    id: 'dsh-mcp',
    name: 'DSH MCP 客户端',
    packageName: '@deepseek-ai/dsh-mcp-client',
    version: 'builtin',
    managementMode: 'delegated',
    trust: 'bundled',
    levels: ['discover', 'read', 'actions'],
  }

  return {
    async descriptor(): Promise<ProviderDescriptor> {
      return descriptor
    },

    async listMethods(): Promise<ProviderConnectionMethod[]> {
      // MCP servers are discovered dynamically from mcp.json.
      // Return a single method type; individual servers are
      // reported as connections.
      return [{
        id: 'dsh-mcp-server',
        integrationId: 'dsh-mcp',
        name: 'MCP 服务器',
        identityType: 'application',
        transport: 'mcp',
        capabilities: ['mcp.tools.call'],
        accountCardinality: 'multiple',
      }]
    },

    async listConnections(query?: {
      integrationId?: string
      methodId?: string
    }): Promise<ProviderConnectionSummary[]> {
      // Only return MCP connections when asked about the MCP method
      if (query?.integrationId && query.integrationId !== 'dsh-mcp') return []

      const capabilities = await mcpAdapter.discover()
      const summaries: ProviderConnectionSummary[] = []

      for (const cap of capabilities) {
        const health = await mcpAdapter.health(cap)
        const rawStatus = cap.status === 'connected' ? 'running'
          : cap.status === 'error' ? 'failed'
          : cap.status === 'disabled' ? 'stopped'
          : 'stopped'

        const observed = normalizeObservedState(
          rawStatus,
          cap.status === 'connected',
          undefined,
        )
        const healthState = deriveHealthState(observed, rawStatus)

        summaries.push({
          externalInstanceId: cap.id,
          methodId: 'dsh-mcp-server',
          integrationId: 'dsh-mcp',
          displayName: cap.name,
          observedState: observed,
          rawStatus,
          observedAt: new Date().toISOString(),
          healthState,
          safeMetadata: {
            transport: cap.runtime?.transport ?? null,
            command: cap.runtime?.command ?? null,
            endpoint: cap.runtime?.endpoint ?? null,
          },
        })
      }

      return summaries
    },

    async inspectConnection(externalInstanceId: string): Promise<ProviderConnectionSummary | undefined> {
      const connections = await this.listConnections()
      return connections.find((c) => c.externalInstanceId === externalInstanceId)
    },

    async listActions(target?: {
      externalInstanceId?: string
    }): Promise<ActionDescriptor[]> {
      const actions: ActionDescriptor[] = []

      // If targeting a specific server, check its state
      if (target?.externalInstanceId) {
        const connections = await this.listConnections()
        const conn = connections.find((c) => c.externalInstanceId === target.externalInstanceId)

        if (conn?.observedState === 'connected') {
          actions.push({
            id: 'disconnect',
            label: '断开连接',
            risk: 'write',
            presentation: 'inline',
            requiresConfirmation: false,
            availableWhen: ['connected'],
          })
        } else {
          actions.push({
            id: 'connect',
            label: '连接',
            risk: 'write',
            presentation: 'inline',
            requiresConfirmation: false,
            availableWhen: ['disconnected', 'not_configured', 'unknown'],
          })
        }
      }

      actions.push({
        id: 'configure',
        label: '配置 MCP 服务器',
        risk: 'navigation',
        presentation: 'delegate',
        requiresConfirmation: false,
      })

      return actions
    },

    async executeAction(request: {
      actionId: string
      externalInstanceId?: string
      input?: Record<string, unknown>
    }): Promise<ActionResult> {
      const { actionId, externalInstanceId } = request

      if (actionId === 'connect' && externalInstanceId) {
        try {
          // The MCP adapter expects a Capability-like object
          await mcpAdapter.connect({ id: externalInstanceId, runtime: { serverName: externalInstanceId } } as any)
          return {
            state: 'completed',
            observedState: 'connected',
            message: `MCP server ${externalInstanceId} connected`,
          }
        } catch (error) {
          return {
            state: 'failed',
            error: {
              category: 'network',
              code: 'connect_failed',
              message: error instanceof Error ? error.message : String(error),
              retryable: true,
            },
          }
        }
      }

      if (actionId === 'disconnect' && externalInstanceId) {
        try {
          await mcpAdapter.disconnect({ id: externalInstanceId, runtime: { serverName: externalInstanceId } } as any)
          return {
            state: 'completed',
            observedState: 'disconnected',
            message: `MCP server ${externalInstanceId} disconnected`,
          }
        } catch (error) {
          return {
            state: 'failed',
            error: {
              category: 'unknown',
              code: 'disconnect_failed',
              message: error instanceof Error ? error.message : String(error),
              retryable: false,
            },
          }
        }
      }

      if (actionId === 'configure') {
        return {
          state: 'completed',
          observedState: 'unknown',
          message: 'Navigate to MCP settings',
        }
      }

      return {
        state: 'failed',
        error: {
          category: 'provider',
          code: 'unknown_action',
          message: `Unknown action: ${actionId}`,
          retryable: false,
        },
      }
    },

    async openManager(): Promise<ManagerNavigation> {
      return {
        type: 'settings-section',
        target: 'dsh-mcp',
      }
    },
  }
}

/**
 * Discover MCP servers and project them as Integration + ConnectionMethod pairs.
 */
export async function discoverMcpIntegrations(
  mcpAdapter: DefaultMCPAdapter,
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
  transport: string
  command?: string
  endpoint?: string
  status: string
}>> {
  const capabilities = await mcpAdapter.discover()
  return capabilities.map((cap) => ({
    integrationId: `mcp:${cap.id}`,
    integrationName: cap.name,
    integrationDescription: cap.description,
    integrationIcon: cap.icon || '🔌',
    integrationCategories: cap.category || ['开发'],
    methodId: `mcp:${cap.id}`,
    methodName: 'MCP 服务器',
    capabilities: cap.capabilities || [],
    source: cap.source || 'DSH MCP Client',
    sourceUrl: cap.sourceUrl,
    transport: cap.transport || 'mcp',
    command: cap.runtime?.command,
    endpoint: cap.runtime?.endpoint,
    status: cap.status,
  }))
}
