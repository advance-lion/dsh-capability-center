/**
 * Host ↔ Client protocol — the JSON method surface between the browser
 * (Client half) and the Node host process (Host half).
 *
 * Direction is always Client → Host. The Client calls host.call(method, args)
 * and receives a JSON-serializable result. Only lossless JSON crosses.
 */

/** List all capabilities with optional filter. */
export interface ListCapabilitiesRequest {
  type?: 'skill' | 'connector' | 'partner'
  category?: string
  search?: string
}

export interface ListCapabilitiesResponse {
  capabilities: import('./core/capability/types').Capability[]
}

/** Get a single capability by ID. */
export interface GetCapabilityRequest {
  id: string
}

export interface GetCapabilityResponse {
  capability: import('./core/capability/types').Capability | null
}

/** Install a capability. */
export interface InstallCapabilityRequest {
  id: string
}

/** Enable / disable a capability. */
export interface SetEnabledRequest {
  id: string
  enabled: boolean
}

/** Connect / disconnect a connector. */
export interface SetConnectedRequest {
  id: string
  connected: boolean
}

/** Health check. */
export interface HealthRequest {
  id: string
}

export interface HealthResponse {
  healthy: boolean
  message?: string
}

/** All RPC method names — kept in one place to avoid typos. */
export const Methods = {
  LIST: 'capability.list',
  GET: 'capability.get',
  INSTALL: 'capability.install',
  UNINSTALL: 'capability.uninstall',
  ENABLE: 'capability.enable',
  DISABLE: 'capability.disable',
  CONNECT: 'capability.connect',
  DISCONNECT: 'capability.disconnect',
  HEALTH: 'capability.health',
} as const

export type MethodName = (typeof Methods)[keyof typeof Methods]
