/**
 * Capability Center V0.1 Domain Types
 *
 * Replaces the flat `Capability` object with a layered model:
 *   Integration → ConnectionMethod → ConnectionInstance
 *
 * This separation follows the same pattern as Composio's
 * Toolkit → AuthConfig → ConnectedAccount, and dsh-im's
 * Channel → Account model.
 *
 * No platform names are hardcoded here. All platform-specific
 * behavior lives in Recipe steps or Provider adapters.
 */

// ── Integration: "what is this app?" ───────────────────────

export interface Integration {
  id: string
  name: string
  vendor?: string
  description?: string
  icon?: string
  homepageUrl?: string
  categories: string[]
  status: 'active' | 'deprecated' | 'blocked'
}

// ── ConnectionMethod: "how do I connect to it?" ────────────

export type TransportType = 'cli' | 'mcp' | 'api' | 'browser' | 'bot' | 'skill'
export type IdentityType = 'user' | 'application' | 'device' | 'none'
export type OwnerKind = 'recipe' | 'provider'
export type SourceLevel =
  | 'official-open-source'
  | 'official-closed-source'
  | 'official-reprint'
  | 'community'
  | 'learned-local'

export interface OfficialSource {
  title: string
  url: string
  sourceType?: string
  verifiedAt?: string
  reviewDueAt?: string
}

export interface ConnectionMethod {
  id: string
  integrationId: string
  name: string
  transport: TransportType
  identityType: IdentityType
  ownerKind: OwnerKind
  /** For recipe-managed: the recipe id. For provider-managed: the provider id. */
  ownerRef: string
  sourceLevel: SourceLevel
  officialSources: OfficialSource[]
  capabilities: string[]
  recommendedPriority: number
  supportedPlatforms: string[]
  accountCardinality: 'single' | 'multiple'
  status: 'active' | 'deprecated'
}

// ── ConnectionInstance: "who is connected right now?" ──────

export type DesiredState = 'connected' | 'paused' | 'removed'
export type OperationState =
  | 'idle'
  | 'planning'
  | 'awaiting_approval'
  | 'preparing'
  | 'awaiting_user'
  | 'authenticating'
  | 'verifying'
  | 'retrying'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type ObservedState =
  | 'unknown'
  | 'not_configured'
  | 'connected'
  | 'disconnected'
  | 'reauth_required'
  | 'revoked'
  | 'provider_unavailable'

export type HealthState = 'unknown' | 'healthy' | 'degraded' | 'unhealthy'

export interface ConnectionOwner {
  kind: OwnerKind
  /** recipe: recipeVersionId. provider: providerId. */
  ref: string
  /** provider-only: opaque external instance id from the provider. */
  externalInstanceId?: string
}

export interface ConnectionInstance {
  id: string
  integrationId: string
  methodId: string
  owner: ConnectionOwner
  displayName: string
  desiredState: DesiredState
  observedState: ObservedState
  healthState: HealthState
  /** Raw status from the owner, for diagnostics. */
  rawStatus?: string
  /** When the observation was made. Stale observations cannot support `connected`. */
  observedAt?: string
  /** Provider version or recipe version that produced the last observation. */
  ownerVersion?: string
  credentialRef?: string
  /** Non-sensitive metadata for display. */
  safeMetadata?: Record<string, string | number | boolean | null>
  /** Capabilities currently available (may be a subset of method capabilities). */
  activeCapabilities?: string[]
  lastVerifiedAt?: string
}

// ── Aggregated View: what the UI renders ───────────────────

export interface IntegrationView {
  integration: Integration
  methods: MethodView[]
  /** Aggregate counts for the card. */
  stats: {
    totalInstances: number
    connected: number
    needsAttention: number
  }
}

export interface MethodView {
  method: ConnectionMethod
  instances: ConnectionInstance[]
  /** Available actions for this method, declared by recipe or provider. */
  actions: ActionDescriptor[]
}

export type ActionRisk = 'read' | 'write' | 'destructive' | 'navigation'
export type ActionPresentation = 'inline' | 'delegate' | 'external'

export interface ActionDescriptor {
  id: string
  label: string
  risk: ActionRisk
  presentation: ActionPresentation
  requiresConfirmation: boolean
  /** Only available when instance is in these observed states. */
  availableWhen?: ObservedState[]
}

// ── Provider SPI ───────────────────────────────────────────

export interface ProviderDescriptor {
  id: string
  name: string
  packageName?: string
  version: string
  managementMode: 'delegated'
  trust: 'bundled' | 'installed-plugin' | 'external'
  homepage?: string
  levels: Array<'discover' | 'read' | 'actions' | 'ui'>
}

export interface ProviderConnectionMethod {
  id: string
  integrationId: string
  name: string
  identityType: IdentityType
  transport: TransportType
  capabilities: string[]
  accountCardinality: 'single' | 'multiple'
}

export interface ProviderConnectionSummary {
  externalInstanceId: string
  methodId: string
  integrationId: string
  displayName: string
  observedState: ObservedState
  rawStatus?: string
  observedAt: string
  healthState: HealthState
  receiveEnabled?: boolean
  safeMetadata?: Record<string, string | number | boolean | null>
  activeCapabilities?: string[]
}

export interface CapabilityProvider {
  descriptor(): Promise<ProviderDescriptor>
  listMethods(): Promise<ProviderConnectionMethod[]>
  listConnections(query?: {
    integrationId?: string
    methodId?: string
  }): Promise<ProviderConnectionSummary[]>
  inspectConnection(
    externalInstanceId: string,
  ): Promise<ProviderConnectionSummary | undefined>
  listActions(target?: {
    integrationId?: string
    methodId?: string
    externalInstanceId?: string
  }): Promise<ActionDescriptor[]>
  executeAction?(request: {
    actionId: string
    externalInstanceId?: string
    integrationId?: string
    methodId?: string
    input?: Record<string, unknown>
  }): Promise<ActionResult>
  openManager?(target?: {
    integrationId?: string
    methodId?: string
    externalInstanceId?: string
  }): Promise<ManagerNavigation>
  subscribe?(listener: (event: ProviderChangeEvent) => void): () => void
}

export type ActionResult =
  | { state: 'completed'; observedState?: ObservedState; message?: string; safeMetadata?: Record<string, string | number | boolean | null> }
  | { state: 'async'; operationHandle: string; pollIntervalMs: number }
  | { state: 'waiting_user'; challenge: UserChallenge }
  | { state: 'failed'; error: StructuredError }

export interface ManagerNavigation {
  type: 'settings-section' | 'panel' | 'external-url'
  target: string
  params?: Record<string, string>
}

export interface ProviderChangeEvent {
  type: 'connection.created' | 'connection.updated' | 'connection.removed'
  providerId: string
  externalInstanceId: string
  integrationId?: string
  methodId?: string
}

// ── Recipe Types ───────────────────────────────────────────

export interface RecipeDocument {
  schemaVersion: 1
  id: string
  version: string
  integrationId: string
  methodId: string
  platforms: string[]
  source: {
    level: SourceLevel
    url: string
  }
  intents: Record<string, RecipeIntent>
}

export interface RecipeIntent {
  steps: RecipeStep[]
}

export interface RecipeStep {
  id: string
  type: string
  when?: ExpressionNode
  with: Record<string, unknown>
  /** Fields to persist from the step output. */
  persist?: string[]
  /** Mark this step as requiring user interaction. */
  userAction?: string
  timeoutMs?: number
  retryPolicy?: { maxAttempts: number; backoffMs: number }
}

// ── Expression DSL (non-Turing-complete) ───────────────────

export type ExpressionNode =
  | { equals: { path: string; value: unknown } }
  | { not: ExpressionNode }
  | { any: ExpressionNode[] }
  | { all: ExpressionNode[] }
  | { in: { path: string; values: unknown[] } }
  | { exists: { path: string } }

// ── User Challenge ─────────────────────────────────────────

export type UserChallenge =
  | { type: 'browser'; url: string; message: string }
  | { type: 'device_code'; verificationUrl: string; displayCode: string; expiresAt: string }
  | { type: 'qr'; renderRef: string; expiresAt: string }
  | { type: 'terminal'; terminalRunRef: string; message: string }
  | { type: 'credential'; credentialKind: string; fields: CredentialField[] }
  | { type: 'phone'; message: string }
  | { type: 'manual'; instructions: string; officialUrl?: string }

export interface CredentialField {
  key: string
  label: string
  secret: boolean
  required: boolean
  placeholder?: string
}

// ── Step Execution ─────────────────────────────────────────

export type StepOutcome =
  | { state: 'completed'; output: Record<string, unknown>; evidence?: EvidenceInput[] }
  | { state: 'waiting_user'; challenge: UserChallenge; checkpoint: unknown }
  | { state: 'retryable_failure'; error: StructuredError; retryAfterMs?: number }
  | { state: 'terminal_failure'; error: StructuredError }

export interface EvidenceInput {
  type: 'identity' | 'auth' | 'scope' | 'health' | 'capability-probe'
  result: 'passed' | 'failed' | 'unknown'
  payload: Record<string, string | number | boolean | null | string[]>
  expiresAt?: string
}

export interface StructuredError {
  category:
    | 'not_installed'
    | 'auth'
    | 'permission'
    | 'network'
    | 'timeout'
    | 'rate_limit'
    | 'provider'
    | 'invalid_response'
    | 'conflict'
    | 'cancelled'
    | 'unknown'
  code: string
  message: string
  retryable: boolean
  remediation?: Array<{ label: string; actionId: string }>
  safeDetails?: Record<string, unknown>
}

// ── Step Executor Interface ────────────────────────────────

export interface StepExecutor {
  type: string
  risk: 'read' | 'write' | 'destructive'
  requiresUser: boolean
  execute(
    ctx: StepContext,
    input: Record<string, unknown>,
  ): Promise<StepOutcome>
  resume?(ctx: StepContext, checkpoint: unknown): Promise<StepOutcome>
}

export interface StepContext {
  /** DSH Host context for accessing services. */
  host: unknown
  /** Outputs of previous steps, keyed by step id. */
  stepOutputs: Record<string, Record<string, unknown>>
  /** AbortSignal for cancellation. */
  signal?: AbortSignal
  /** Recipe run id for logging. */
  runId: string
}
