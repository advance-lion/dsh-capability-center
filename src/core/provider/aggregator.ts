/**
 * Connection Aggregator.
 *
 * Merges Catalog data (Integration + ConnectionMethod) with Runtime data
 * (ConnectionInstance) and Provider summaries into a single unified view
 * for the UI.
 *
 * The Aggregator is read-only: it never creates or modifies connections.
 * It only reads from the Catalog, Runtime store, and Provider registry,
 * then projects the merged result as IntegrationView[].
 */

import type {
  Integration,
  ConnectionMethod,
  ConnectionInstance,
  IntegrationView,
  MethodView,
  ActionDescriptor,
  ObservedState,
  ProviderConnectionSummary,
} from '../domain/types'
import type { ProviderRegistry } from './registry'
import { normalizeObservedState, deriveHealthState, isObservationFresh, DEFAULT_SNAPSHOT_TTL_MS } from '../domain/status'

export interface CatalogStore {
  listIntegrations(): Promise<Integration[]>
  listMethods(integrationId?: string): Promise<ConnectionMethod[]>
  getIntegration(id: string): Promise<Integration | undefined>
  getMethod(id: string): Promise<ConnectionMethod | undefined>
}

export interface RuntimeStore {
  listInstances(): Promise<ConnectionInstance[]>
  getInstancesByMethod(methodId: string): Promise<ConnectionInstance[]>
}

export class ConnectionAggregator {
  constructor(
    private catalog: CatalogStore,
    private runtime: RuntimeStore,
    private providers: ProviderRegistry,
  ) {}

  /**
   * Build the full unified view for the UI.
   * Merges catalog methods, runtime instances, and provider connections.
   */
  async listViews(): Promise<IntegrationView[]> {
    const integrations = await this.catalog.listIntegrations()
    const allMethods = await this.catalog.listMethods()
    const allInstances = await this.runtime.listInstances()

    // Group methods by integration
    const methodsByIntegration = new Map<string, ConnectionMethod[]>()
    for (const method of allMethods) {
      const list = methodsByIntegration.get(method.integrationId) || []
      list.push(method)
      methodsByIntegration.set(method.integrationId, list)
    }

    // Group instances by method
    const instancesByMethod = new Map<string, ConnectionInstance[]>()
    for (const inst of allInstances) {
      const list = instancesByMethod.get(inst.methodId) || []
      list.push(inst)
      instancesByMethod.set(inst.methodId, list)
    }

    // Collect provider connections for provider-managed methods
    const providerConnections = await this.collectProviderConnections()

    const views: IntegrationView[] = []

    for (const integration of integrations) {
      const methods = methodsByIntegration.get(integration.id) || []
      const methodViews: MethodView[] = []

      for (const method of methods) {
        const instances = instancesByMethod.get(method.id) || []
        const providerConns = providerConnections.get(method.id) || []

        // Merge provider connections into instances if not already present
        const mergedInstances = this.mergeProviderConnections(instances, providerConns, method)

        // Get actions for this method
        const actions = await this.getMethodActions(method, mergedInstances)

        methodViews.push({
          method,
          instances: mergedInstances,
          actions,
        })
      }

      // Compute aggregate stats
      let connected = 0
      let needsAttention = 0
      let totalInstances = 0

      for (const mv of methodViews) {
        for (const inst of mv.instances) {
          totalInstances++
          if (inst.observedState === 'connected' && inst.healthState === 'healthy') {
            connected++
          } else if (
            inst.observedState === 'reauth_required' ||
            inst.observedState === 'revoked' ||
            inst.observedState === 'disconnected' ||
            inst.healthState === 'unhealthy'
          ) {
            needsAttention++
          }
        }
      }

      views.push({
        integration,
        methods: methodViews,
        stats: { totalInstances, connected, needsAttention },
      })
    }

    return views
  }

  /**
   * Get a single integration view by id.
   */
  async getView(integrationId: string): Promise<IntegrationView | undefined> {
    const integration = await this.catalog.getIntegration(integrationId)
    if (!integration) return undefined

    const allViews = await this.listViews()
    return allViews.find((v) => v.integration.id === integrationId)
  }

  // ── Private helpers ─────────────────────────────────────

  private async collectProviderConnections(): Promise<Map<string, ProviderConnectionSummary[]>> {
    const result = new Map<string, ProviderConnectionSummary[]>()
    const providerList = await this.providers.listAll()

    for (const { provider, descriptor } of providerList) {
      if (!descriptor.levels.includes('read')) continue // L0 providers can't list connections

      try {
        const connections = await provider.listConnections()
        for (const conn of connections) {
          const list = result.get(conn.methodId) || []
          list.push(conn)
          result.set(conn.methodId, list)
        }
      } catch {
        // Provider unavailable — skip
      }
    }

    return result
  }

  private mergeProviderConnections(
    instances: ConnectionInstance[],
    providerConns: ProviderConnectionSummary[],
    method: ConnectionMethod,
  ): ConnectionInstance[] {
    if (providerConns.length === 0) return instances

    const merged: ConnectionInstance[] = [...instances]

    for (const pc of providerConns) {
      // Check if we already have this instance
      const existing = merged.find(
        (i) => i.owner.kind === 'provider' && i.owner.externalInstanceId === pc.externalInstanceId,
      )

      if (existing) {
        // Update in-place with fresh provider data
        const fresh = isObservationFresh(pc.observedAt, DEFAULT_SNAPSHOT_TTL_MS)
        Object.assign(existing, {
          observedState: pc.observedState,
          healthState: pc.healthState,
          rawStatus: pc.rawStatus,
          observedAt: pc.observedAt,
          safeMetadata: pc.safeMetadata,
          activeCapabilities: pc.activeCapabilities,
        })
      } else {
        // Create a new instance view from provider summary
        merged.push({
          id: `provider:${method.ownerRef}:${pc.externalInstanceId}`,
          integrationId: pc.integrationId,
          methodId: pc.methodId,
          owner: {
            kind: 'provider',
            ref: method.ownerRef,
            externalInstanceId: pc.externalInstanceId,
          },
          displayName: pc.displayName,
          desiredState: 'connected',
          observedState: pc.observedState,
          healthState: pc.healthState,
          rawStatus: pc.rawStatus,
          observedAt: pc.observedAt,
          safeMetadata: pc.safeMetadata,
          activeCapabilities: pc.activeCapabilities,
        })
      }
    }

    return merged
  }

  private async getMethodActions(
    method: ConnectionMethod,
    instances: ConnectionInstance[],
  ): Promise<ActionDescriptor[]> {
    if (method.ownerKind === 'provider') {
      const provider = this.providers.get(method.ownerRef)
      if (provider) {
        try {
          return await provider.listActions({
            integrationId: method.integrationId,
            methodId: method.id,
          })
        } catch {
          return []
        }
      }
      return []
    }

    // Recipe-managed: derive actions from instance states
    const actions: ActionDescriptor[] = []

    const hasConnected = instances.some((i) => i.observedState === 'connected')
    const hasReauth = instances.some((i) => i.observedState === 'reauth_required')
    const hasNotConfigured = instances.length === 0 || instances.some((i) => i.observedState === 'not_configured')

    if (hasNotConfigured || instances.length === 0) {
      actions.push({
        id: 'connect',
        label: '连接',
        risk: 'write',
        presentation: 'inline',
        requiresConfirmation: false,
        availableWhen: ['not_configured', 'unknown', 'disconnected'],
      })
    }

    if (hasReauth) {
      actions.push({
        id: 'reauthorize',
        label: '重新认证',
        risk: 'write',
        presentation: 'inline',
        requiresConfirmation: false,
        availableWhen: ['reauth_required', 'revoked'],
      })
    }

    if (hasConnected) {
      actions.push({
        id: 'verify',
        label: '验证连接',
        risk: 'read',
        presentation: 'inline',
        requiresConfirmation: false,
        availableWhen: ['connected'],
      })
    }

    return actions
  }
}
