/** Shared JSON contracts for the same-origin HTTP API. */
export interface ListCapabilitiesRequest {
  type?: 'skill' | 'connector' | 'partner'
  category?: string
  search?: string
}

export interface ListCapabilitiesResponse {
  capabilities: import('./core/capability/types').Capability[]
}

export interface GetCapabilityResponse {
  capability: import('./core/capability/types').Capability | null
}

export interface MutationResponse {
  ok: true
}

export interface HealthResponse {
  healthy: boolean
  message?: string
}

export const CAPABILITY_API_ROOT = '/api/capability-center' as const
