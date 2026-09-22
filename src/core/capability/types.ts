/**
 * DSH Capability Center — Core Type Definitions
 *
 * The unified capability model that abstracts Skills, Connectors, and Partners
 * into a single product-layer concept. Users never need to know whether a
 * capability is backed by an MCP server, a CLI tool, or a Skill instruction.
 */

/** Top-level capability type visible to the user. */
export type CapabilityType = 'skill' | 'connector' | 'partner'

/** Connector transport — how the connector talks to the external system. */
export type ConnectorTransport = 'mcp' | 'cli' | 'api' | 'browser'

/** Lifecycle status of a capability instance on this machine. */
export type CapabilityStatus =
  | 'available'   // discoverable but not yet installed
  | 'installed'   // installed but not actively connected
  | 'connected'   // connected and healthy
  | 'disabled'    // explicitly disabled by the user
  | 'expired'     // credentials expired, re-auth needed
  | 'error'       // runtime error

/** Health check result for a connector. */
export interface HealthStatus {
  healthy: boolean
  message?: string
  lastChecked?: number
}

/** Detection result for a CLI-based connector. */
export interface DetectionResult {
  found: boolean
  version?: string
  path?: string
}

/** Runtime definition — how the capability is executed under the hood. */
export interface RuntimeDefinition {
  transport?: ConnectorTransport
  command?: string
  serverName?: string
  endpoint?: string
}

/** Install definition — what's needed to install this capability. */
export interface InstallDefinition {
  requirements?: {
    commands?: string[]
    packages?: string[]
  }
  steps?: string[]
}

/**
 * The unified capability object.
 * This is what the UI renders and what the Agent reasons about.
 */
export interface Capability {
  /** Stable unique identifier, e.g. "feishu", "github", "paper-research". */
  id: string

  /** Top-level type — determines which adapter handles it. */
  type: CapabilityType

  /** Human-readable name. */
  name: string

  /** Short description shown on the card. */
  description?: string

  /** Emoji or icon identifier. */
  icon?: string

  /** User-facing categories for filtering, e.g. ["办公", "协作"]. */
  category?: string[]

  /** Free-form tags for search. */
  tags?: string[]

  /** Provider metadata — who publishes this capability. */
  provider?: {
    name: string
    url?: string
  }

  /**
   * Source link — the official site or repository where this capability
   * originates. The Agent can check this URL to discover updates.
   * e.g. Lark CLI → https://open.larksuite.com/document/...
   */
  sourceUrl?: string

  /** Current lifecycle status on this machine. */
  status: CapabilityStatus

  /** Semantic capability IDs this capability exposes, e.g. ["message.send"]. */
  capabilities?: string[]

  /** Runtime configuration — how the adapter executes it. */
  runtime?: RuntimeDefinition

  /** Installation requirements and steps. */
  install?: InstallDefinition

  /** For connectors: the transport type. */
  transport?: ConnectorTransport

  /** For connectors: the source/adapter name, e.g. "Lark CLI", "DSH MCP Client". */
  source?: string

  /** Local path or接入点 where the adapter lives. */
  sourcePath?: string
}

/**
 * A capability request issued by the Agent when it discovers it needs a
 * capability that is not yet installed or connected.
 */
export interface CapabilityRequest {
  capabilityId: string
  action: string
  reason?: string
  requiredPermissions?: string[]
  sessionId?: string
}

/** Credential reference — the Agent never sees the raw token. */
export interface CredentialRef {
  connector: string
  credentialRef: string // e.g. "credential://feishu/default"
}
