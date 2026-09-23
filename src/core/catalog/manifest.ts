/**
 * Connector Manifest format.
 *
 * Each connector ships a manifest.json that declares its integration,
 * connection methods, and recipe reference. The Catalog Store loads
 * these manifests at startup — no platform names are hardcoded in
 * the plugin source.
 *
 * Example manifest:
 * {
 *   "integration": { "id": "feishu", "name": "飞书", ... },
 *   "methods": [
 *     {
 *       "id": "feishu-cli-user",
 *       "name": "Lark CLI 用户认证",
 *       "transport": "cli",
 *       "identityType": "user",
 *       "ownerKind": "recipe",
 *       "ownerRef": "feishu-cli-user",
 *       "recipeFile": "feishu-cli-user.recipe.json",
 *       ...
 *     }
 *   ]
 * }
 */

import type {
  Integration,
  ConnectionMethod,
  SourceLevel,
  TransportType,
  IdentityType,
  OwnerKind,
  OfficialSource,
} from '../domain/types'

export interface ConnectorManifest {
  integration: ManifestIntegration
  methods: ManifestMethod[]
}

export interface ManifestIntegration {
  id: string
  name: string
  vendor?: string
  description?: string
  icon?: string
  homepageUrl?: string
  categories: string[]
  status: 'active' | 'deprecated' | 'blocked'
}

export interface ManifestMethod {
  id: string
  name: string
  transport: TransportType
  identityType: IdentityType
  ownerKind: OwnerKind
  /** recipe: recipe id. provider: provider id. */
  ownerRef: string
  sourceLevel: SourceLevel
  officialSources: OfficialSource[]
  capabilities: string[]
  recommendedPriority: number
  supportedPlatforms: string[]
  accountCardinality: 'single' | 'multiple'
  status: 'active' | 'deprecated'
  /** Path to recipe JSON file (relative to manifest). */
  recipeFile?: string
}

/**
 * Convert a manifest to domain Integration + ConnectionMethod[].
 */
export function manifestToDomain(manifest: ConnectorManifest): {
  integration: Integration
  methods: ConnectionMethod[]
} {
  const integration: Integration = {
    id: manifest.integration.id,
    name: manifest.integration.name,
    vendor: manifest.integration.vendor,
    description: manifest.integration.description,
    icon: manifest.integration.icon,
    homepageUrl: manifest.integration.homepageUrl,
    categories: manifest.integration.categories,
    status: manifest.integration.status,
  }

  const methods: ConnectionMethod[] = manifest.methods.map((m) => ({
    id: m.id,
    integrationId: manifest.integration.id,
    name: m.name,
    transport: m.transport,
    identityType: m.identityType,
    ownerKind: m.ownerKind,
    ownerRef: m.ownerRef,
    sourceLevel: m.sourceLevel,
    officialSources: m.officialSources,
    capabilities: m.capabilities,
    recommendedPriority: m.recommendedPriority,
    supportedPlatforms: m.supportedPlatforms,
    accountCardinality: m.accountCardinality,
    status: m.status,
  }))

  return { integration, methods }
}
