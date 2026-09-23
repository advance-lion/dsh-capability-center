/**
 * Status normalization utilities.
 *
 * Maps raw provider/recipe states to the four orthogonal dimensions:
 * desiredState, operationState, observedState, healthState.
 *
 * No platform names here — only generic state mapping.
 */

import type {
  ObservedState,
  HealthState,
  DesiredState,
} from './types'

/**
 * Normalize a raw provider status string to the canonical ObservedState.
 * Providers may use their own vocabulary; this function maps common terms.
 */
export function normalizeObservedState(
  raw: string | undefined,
  connected: boolean | undefined,
  receiveEnabled: boolean | undefined,
): ObservedState {
  if (!raw && connected === undefined) return 'unknown'

  const lower = String(raw || '').toLowerCase()

  // Provider unavailable
  if (lower.includes('unavailable') || lower.includes('provider_unavailable')) {
    return 'provider_unavailable'
  }

  // Explicitly connected or healthy
  if (connected === true || lower.includes('connected') || lower.includes('online') || lower.includes('active') || lower.includes('ready')) {
    return 'connected'
  }

  // Needs re-auth
  if (lower.includes('expired') || lower.includes('reauth') || lower.includes('needs_auth') || lower.includes('needs_refresh')) {
    return 'reauth_required'
  }

  // Revoked
  if (lower.includes('revoked') || lower.includes('denied') || lower.includes('forbidden')) {
    return 'revoked'
  }

  // Disconnected / offline / stopped
  if (connected === false || lower.includes('disconnected') || lower.includes('offline') || lower.includes('stopped') || lower.includes('paused')) {
    return 'disconnected'
  }

  // Not configured
  if (lower.includes('not_configured') || lower.includes('unconfigured') || lower.includes('empty')) {
    return 'not_configured'
  }

  return 'unknown'
}

/**
 * Derive health from observed state and optional diagnostics.
 */
export function deriveHealthState(
  observed: ObservedState,
  rawStatus?: string,
): HealthState {
  if (observed === 'provider_unavailable') return 'unknown'
  if (observed === 'connected') {
    const lower = String(rawStatus || '').toLowerCase()
    if (lower.includes('degraded') || lower.includes('warning') || lower.includes('partial')) {
      return 'degraded'
    }
    return 'healthy'
  }
  if (observed === 'reauth_required' || observed === 'revoked') return 'unhealthy'
  return 'unknown'
}

/**
 * Check whether an observation is fresh enough to support `connected`.
 */
export function isObservationFresh(
  observedAt: string | undefined,
  ttlMs: number,
): boolean {
  if (!observedAt) return false
  const observed = new Date(observedAt).getTime()
  if (Number.isNaN(observed)) return false
  return Date.now() - observed < ttlMs
}

/**
 * Default TTL for provider snapshots (5 minutes).
 */
export const DEFAULT_SNAPSHOT_TTL_MS = 5 * 60 * 1000

/**
 * Human-readable label for ObservedState.
 */
export const observedStateLabels: Record<ObservedState, string> = {
  unknown: '未知',
  not_configured: '未配置',
  connected: '已连接',
  disconnected: '已断开',
  reauth_required: '需要重新认证',
  revoked: '已撤销',
  provider_unavailable: 'Provider 不可用',
}

/**
 * Human-readable label for HealthState.
 */
export const healthStateLabels: Record<HealthState, string> = {
  unknown: '—',
  healthy: '健康',
  degraded: '降级',
  unhealthy: '异常',
}

/**
 * Human-readable label for DesiredState.
 */
export const desiredStateLabels: Record<DesiredState, string> = {
  connected: '保持连接',
  paused: '已暂停',
  removed: '已移除',
}

/**
 * CSS class suffix for ObservedState (for dot indicators).
 */
export function observedStateDotClass(observed: ObservedState): string {
  switch (observed) {
    case 'connected': return 'connected'
    case 'reauth_required': return 'needs_auth'
    case 'revoked': return 'revoked'
    case 'not_configured': return 'not_configured'
    case 'disconnected': return 'disconnected'
    case 'provider_unavailable': return 'unavailable'
    default: return 'unknown'
  }
}
