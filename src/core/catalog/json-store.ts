/**
 * JSON-based Catalog Store for V0.1.
 *
 * Loads connector manifests from the connectors/ directory at startup.
 * In V0.2 this will be replaced by a SQLite-backed implementation with
 * the same interface — the Repository abstraction ensures a clean swap.
 *
 * The store is read-only: manifests are authored as static files and
 * loaded at startup. Runtime mutations (candidates, learned overrides)
 * will be persisted separately in V0.2.
 */

import type { Integration, ConnectionMethod } from '../domain/types'
import type { CatalogStore } from '../provider/aggregator'
import { manifestToDomain, type ConnectorManifest } from './manifest'

export class JsonCatalogStore implements CatalogStore {
  private integrations = new Map<string, Integration>()
  private methods = new Map<string, ConnectionMethod>()
  private methodsByIntegration = new Map<string, ConnectionMethod[]>()

  /**
   * Load manifests from an array of parsed JSON objects.
   * In production, the Host entry reads files from connectors/ and
   * passes them here.
   */
  loadManifests(manifests: ConnectorManifest[]): void {
    for (const manifest of manifests) {
      const { integration, methods } = manifestToDomain(manifest)
      this.integrations.set(integration.id, integration)
      this.methodsByIntegration.set(integration.id, methods)
      for (const method of methods) {
        this.methods.set(method.id, method)
      }
    }
  }

  async listIntegrations(): Promise<Integration[]> {
    return [...this.integrations.values()]
  }

  async listMethods(integrationId?: string): Promise<ConnectionMethod[]> {
    if (integrationId) {
      return this.methodsByIntegration.get(integrationId) || []
    }
    return [...this.methods.values()]
  }

  async getIntegration(id: string): Promise<Integration | undefined> {
    return this.integrations.get(id)
  }

  async getMethod(id: string): Promise<ConnectionMethod | undefined> {
    return this.methods.get(id)
  }
}
