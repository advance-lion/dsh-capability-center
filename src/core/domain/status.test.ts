import { describe, it, expect } from 'vitest'
import {
  normalizeObservedState,
  deriveHealthState,
  isObservationFresh,
  observedStateDotClass,
} from './status'

describe('Status — normalizeObservedState', () => {
  it('returns unknown for empty input', () => {
    expect(normalizeObservedState(undefined, undefined, undefined)).toBe('unknown')
  })

  it('returns connected for connected=true', () => {
    expect(normalizeObservedState(undefined, true, undefined)).toBe('connected')
  })

  it('returns connected for raw "ready"', () => {
    expect(normalizeObservedState('ready', undefined, undefined)).toBe('connected')
  })

  it('returns reauth_required for "needs_refresh"', () => {
    expect(normalizeObservedState('needs_refresh', undefined, undefined)).toBe('reauth_required')
  })

  it('returns reauth_required for "expired"', () => {
    expect(normalizeObservedState('expired', undefined, undefined)).toBe('reauth_required')
  })

  it('returns revoked for "revoked"', () => {
    expect(normalizeObservedState('revoked', undefined, undefined)).toBe('revoked')
  })

  it('returns disconnected for connected=false', () => {
    expect(normalizeObservedState(undefined, false, undefined)).toBe('disconnected')
  })

  it('returns disconnected for "offline"', () => {
    expect(normalizeObservedState('offline', undefined, undefined)).toBe('disconnected')
  })

  it('returns not_configured for "unconfigured"', () => {
    expect(normalizeObservedState('unconfigured', undefined, undefined)).toBe('not_configured')
  })

  it('returns provider_unavailable', () => {
    expect(normalizeObservedState('provider_unavailable', undefined, undefined)).toBe('provider_unavailable')
  })
})

describe('Status — deriveHealthState', () => {
  it('returns healthy for connected', () => {
    expect(deriveHealthState('connected')).toBe('healthy')
  })

  it('returns degraded for connected with warning', () => {
    expect(deriveHealthState('connected', 'degraded')).toBe('degraded')
  })

  it('returns unhealthy for reauth_required', () => {
    expect(deriveHealthState('reauth_required')).toBe('unhealthy')
  })

  it('returns unhealthy for revoked', () => {
    expect(deriveHealthState('revoked')).toBe('unhealthy')
  })

  it('returns unknown for not_configured', () => {
    expect(deriveHealthState('not_configured')).toBe('unknown')
  })

  it('returns unknown for provider_unavailable', () => {
    expect(deriveHealthState('provider_unavailable')).toBe('unknown')
  })
})

describe('Status — isObservationFresh', () => {
  it('returns false for undefined', () => {
    expect(isObservationFresh(undefined, 5000)).toBe(false)
  })

  it('returns true for recent observation', () => {
    const recent = new Date(Date.now() - 1000).toISOString()
    expect(isObservationFresh(recent, 5000)).toBe(true)
  })

  it('returns false for stale observation', () => {
    const stale = new Date(Date.now() - 10000).toISOString()
    expect(isObservationFresh(stale, 5000)).toBe(false)
  })

  it('returns false for invalid date', () => {
    expect(isObservationFresh('not-a-date', 5000)).toBe(false)
  })
})

describe('Status — observedStateDotClass', () => {
  it('returns correct CSS class for each state', () => {
    expect(observedStateDotClass('connected')).toBe('connected')
    expect(observedStateDotClass('reauth_required')).toBe('needs_auth')
    expect(observedStateDotClass('revoked')).toBe('revoked')
    expect(observedStateDotClass('not_configured')).toBe('not_configured')
    expect(observedStateDotClass('disconnected')).toBe('disconnected')
    expect(observedStateDotClass('provider_unavailable')).toBe('unavailable')
    expect(observedStateDotClass('unknown')).toBe('unknown')
  })
})
