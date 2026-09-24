import { describe, expect, it } from 'vitest'
import { BackendBoundary, type Backend, type BackendResult } from './backend-boundary'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function backend(id: string, hooks: Partial<Pick<Backend, 'check' | 'execute' | 'dispose'>> = {}) {
  const stats = { checks: 0, calls: 0, disposes: 0 }
  const value: Backend & { stats: typeof stats } = {
    id, contractVersion: 1, actions: ['probe', 'connect', 'verify'], stats,
    async check(context) { stats.checks++; return hooks.check ? hooks.check(context) : { ready: true, contractVersion: 1 } },
    async execute(action, context) { stats.calls++; return hooks.execute ? hooks.execute(action, context) : { state: 'completed', value: id } },
    async dispose() { stats.disposes++; await hooks.dispose?.() },
  }
  return value
}

const ready = { ready: true, contractVersion: 1 }

describe('BackendBoundary acceptance (synthetic, no live connectors)', () => {
  it('rejects requests without a backend and rollback without a target', async () => {
    const b = new BackendBoundary()
    await expect(b.call('connect')).rejects.toMatchObject({ code: 'backend_unavailable' })
    await expect(b.rollback()).rejects.toMatchObject({ code: 'no_rollback_target' })
    await b.dispose()
  })

  it('validates the complete contract before calling candidate code', async () => {
    const b = new BackendBoundary(), candidate = backend('bad')
    for (const broken of [
      { ...candidate, contractVersion: 2 }, { ...candidate, id: '' },
      { ...candidate, actions: [] }, { ...candidate, actions: ['connect', 'connect'] },
      { ...candidate, execute: undefined }, { ...candidate, dispose: undefined },
    ]) {
      await expect(b.activate(broken as unknown as Backend)).rejects.toMatchObject({ code: 'incompatible_backend' })
    }
    expect(candidate.stats).toEqual({ checks: 0, calls: 0, disposes: 0 })
    await b.dispose()
  })

  it('checks readiness before activation and dispatches to the selected backend', async () => {
    const b = new BackendBoundary(), candidate = backend('one')
    await b.activate(candidate)
    expect(candidate.stats.checks).toBe(1)
    expect(b.snapshot().current).toBe('one')
    await expect(b.call('probe')).resolves.toEqual({ state: 'completed', value: 'one' })
    await b.dispose()
  })

  it.each([false, true])('failed readiness (throw=%s) retains the old backend and cleans the rejected candidate', async (throws) => {
    const b = new BackendBoundary(), old = backend('old')
    await b.activate(old)
    const bad = backend('bad', { check() { if (throws) throw new Error('probe fault'); return { ready: false, contractVersion: 1 } } })
    await expect(b.activate(bad)).rejects.toBeDefined()
    expect(b.snapshot().current).toBe('old')
    expect(b.snapshot().phase).toBe('ready')
    expect(bad.stats.disposes).toBe(1)
    await expect(b.call('probe')).resolves.toEqual({ state: 'completed', value: 'old' })
    await b.dispose()
    expect(bad.stats.disposes).toBe(1)
  })

  it('rejects a mismatching readiness contract', async () => {
    const b = new BackendBoundary()
    await expect(b.activate(backend('bad', { check: () => ({ ready: true, contractVersion: 2 }) }))).rejects.toMatchObject({ code: 'candidate_not_ready' })
    expect(b.snapshot().current).toBeNull()
    await b.dispose()
  })

  it('rejects activation while a real request remains in flight', async () => {
    const gate = deferred<BackendResult>(), b = new BackendBoundary()
    await b.activate(backend('old', { execute: () => gate.promise }))
    const request = b.call('connect'), next = backend('next')
    await expect(b.activate(next)).rejects.toMatchObject({ code: 'boundary_busy' })
    expect(next.stats.checks).toBe(0)
    gate.resolve({ state: 'completed', value: 'old' })
    await expect(request).resolves.toMatchObject({ value: 'old' })
    expect(b.snapshot().inFlight).toBe(0)
    await b.dispose()
  })

  it('rejects concurrent activation and new requests during readiness checking', async () => {
    const gate = deferred<typeof ready>(), b = new BackendBoundary()
    await b.activate(backend('old'))
    const change = b.activate(backend('next', { check: () => gate.promise }))
    await expect(b.activate(backend('other'))).rejects.toMatchObject({ code: 'boundary_busy' })
    await expect(b.call('connect')).rejects.toMatchObject({ code: 'boundary_busy' })
    gate.resolve(ready); await change
    expect(b.snapshot().current).toBe('next')
    await b.dispose()
  })

  it('releases request accounting after execution throws', async () => {
    const b = new BackendBoundary()
    await b.activate(backend('bad', { execute() { throw new Error('operation fault') } }))
    await expect(b.call('connect')).rejects.toThrow('operation fault')
    expect(b.snapshot().inFlight).toBe(0)
    await b.activate(backend('next'))
    await b.dispose()
  })

  it.each(['waiting_user', 'failed'] as const)('preserves %s instead of converting it into success', async (state) => {
    const b = new BackendBoundary(), result: BackendResult = state === 'waiting_user'
      ? { state, challenge: { message: 'synthetic login request' } }
      : { state, error: { code: 'synthetic_expired' } }
    await b.activate(backend('one', { execute: () => result }))
    await expect(b.call('connect')).resolves.toEqual(result)
    await b.dispose()
  })

  it.each([null, {}, { ok: true }, { state: 'unknown' }])('rejects malformed backend result %#', async (result) => {
    const b = new BackendBoundary()
    await b.activate(backend('bad', { execute: () => result as BackendResult }))
    await expect(b.call('verify')).rejects.toMatchObject({ code: 'invalid_backend_result' })
    expect(b.snapshot().inFlight).toBe(0)
    await b.dispose()
  })

  it('rejects undeclared and inherited-name actions without calling the backend', async () => {
    const b = new BackendBoundary(), candidate = backend('one')
    await b.activate(candidate)
    for (const action of ['revoke', 'toString', '__proto__']) {
      await expect(b.call(action)).rejects.toMatchObject({ code: 'unsupported_action' })
    }
    expect(candidate.stats.calls).toBe(0)
    await b.dispose()
  })

  it('explicitly verifies the previous version again on rollback', async () => {
    const b = new BackendBoundary(), old = backend('old')
    await b.activate(old); await b.activate(backend('next')); await b.rollback()
    expect(old.stats.checks).toBe(2)
    expect(b.snapshot().current).toBe('old')
    expect(b.snapshot().previous).toBe('next')
    await b.dispose()
  })

  it('a failed rollback retains the current version and the rollback target', async () => {
    let healthy = true
    const b = new BackendBoundary(), old = backend('old', { check: () => ({ ready: healthy, contractVersion: 1 }) })
    await b.activate(old); await b.activate(backend('next')); healthy = false
    await expect(b.rollback()).rejects.toMatchObject({ code: 'candidate_not_ready' })
    expect(b.snapshot().current).toBe('next')
    expect(old.stats.disposes).toBe(0)
    healthy = true; await b.rollback(); await b.dispose()
  })

  it('rejects duplicate version identities and cannot reuse retired identities', async () => {
    const b = new BackendBoundary()
    await b.activate(backend('one'))
    await expect(b.activate(backend('one'))).rejects.toMatchObject({ code: 'duplicate_backend' })
    await b.activate(backend('two')); await b.activate(backend('three'))
    await expect(b.activate(backend('one'))).rejects.toMatchObject({ code: 'duplicate_backend' })
    await b.dispose()
  })

  it('retires old versions rather than retaining every version indefinitely', async () => {
    const b = new BackendBoundary(), one = backend('one'), two = backend('two'), three = backend('three')
    await b.activate(one); await b.activate(two); await b.activate(three)
    expect(one.stats.disposes).toBe(1)
    expect(two.stats.disposes).toBe(0)
    expect(b.snapshot()).toMatchObject({ current: 'three', previous: 'two' })
    await b.dispose()
    expect([one, two, three].map(c => c.stats.disposes)).toEqual([1, 1, 1])
  })

  it('captures candidate methods/actions/id so later caller mutation does not replace code', async () => {
    const b = new BackendBoundary(), original = backend('one')
    await b.activate(original)
    original.id = 'mutated'; original.execute = async () => ({ state: 'failed' }); original.actions = ['revoke']
    await expect(b.call('probe')).resolves.toEqual({ state: 'completed', value: 'one' })
    expect(b.snapshot().current).toBe('one')
    await b.dispose()
  })

  it('snapshot arrays are independent, not mutable internal state', async () => {
    const b = new BackendBoundary()
    const snapshot = b.snapshot(); snapshot.cleanupErrors.push({ backendId: 'fake', code: 'cleanup_failed' })
    expect(b.snapshot().cleanupErrors).toEqual([])
    await b.dispose()
  })

  it('dispose is idempotent, awaits async cleanup, and rejects new work immediately', async () => {
    const gate = deferred<void>(), b = new BackendBoundary(), candidate = backend('one', { dispose: () => gate.promise })
    await b.activate(candidate)
    let closed = false
    const first = b.dispose().then(() => { closed = true }), second = b.dispose()
    await expect(b.call('connect')).rejects.toMatchObject({ code: 'boundary_stopped' })
    await expect(b.activate(backend('next'))).rejects.toMatchObject({ code: 'boundary_stopped' })
    expect(closed).toBe(false)
    gate.resolve(); await first; await second
    expect(candidate.stats.disposes).toBe(1)
  })

  it('one cleanup failure does not skip other cleanups or leak raw error contents', async () => {
    const b = new BackendBoundary(), one = backend('one', { dispose() { throw new Error('sensitive-synthetic-value') } }), two = backend('two')
    await b.activate(one); await b.activate(two); await b.dispose()
    expect([one.stats.disposes, two.stats.disposes]).toEqual([1, 1])
    expect(b.snapshot().cleanupErrors).toEqual([{ backendId: 'one', code: 'cleanup_failed' }])
    expect(JSON.stringify(b.snapshot())).not.toContain('sensitive-synthetic-value')
  })

  it('a cleanup failure during retirement does not report a successful switch as failed', async () => {
    const b = new BackendBoundary()
    await b.activate(backend('one', { dispose() { throw new Error('cleanup fault') } }))
    await b.activate(backend('two')); await b.activate(backend('three'))
    expect(b.snapshot().current).toBe('three')
    expect(b.snapshot().cleanupErrors).toHaveLength(1)
    await b.dispose()
  })

  it('late results during stop cannot succeed and the owner is cleaned after real drain', async () => {
    const gate = deferred<BackendResult>(), b = new BackendBoundary(), candidate = backend('one', { execute: () => gate.promise })
    await b.activate(candidate)
    const request = b.call('connect'), closing = b.dispose()
    expect(candidate.stats.disposes).toBe(0)
    gate.resolve({ state: 'completed' })
    await expect(request).rejects.toMatchObject({ code: 'boundary_stopped' })
    await closing
    expect(candidate.stats.disposes).toBe(1)
  })

  it('stop during readiness automatically cleans the late candidate without a manual finish hook', async () => {
    const gate = deferred<typeof ready>(), b = new BackendBoundary(), candidate = backend('late', { check: () => gate.promise })
    const activation = b.activate(candidate), closing = b.dispose()
    gate.resolve(ready)
    await expect(activation).rejects.toMatchObject({ code: 'boundary_stopped' })
    await closing
    expect(b.snapshot().current).toBeNull()
    expect(candidate.stats.disposes).toBe(1)
  })

  it('pre-cancelled work does not invoke a backend or readiness check', async () => {
    const signal = AbortSignal.abort(), b = new BackendBoundary(), candidate = backend('one')
    await expect(b.activate(candidate, { signal })).rejects.toMatchObject({ code: 'operation_cancelled' })
    expect(candidate.stats.checks).toBe(0)
    await b.activate(candidate)
    await expect(b.call('connect', { signal })).rejects.toMatchObject({ code: 'operation_cancelled' })
    expect(candidate.stats.calls).toBe(0)
    await b.dispose()
  })

  it('cancelled in-flight work keeps its lease until the actual backend settles', async () => {
    const gate = deferred<BackendResult>(), controller = new AbortController(), b = new BackendBoundary()
    await b.activate(backend('one', { execute: () => gate.promise }))
    const request = b.call('connect', { signal: controller.signal }); controller.abort()
    await expect(request).rejects.toMatchObject({ code: 'operation_cancelled' })
    expect(b.snapshot().inFlight).toBe(1)
    await expect(b.activate(backend('two'))).rejects.toMatchObject({ code: 'boundary_busy' })
    gate.resolve({ state: 'completed' })
    await b.dispose()
    expect(b.snapshot().inFlight).toBe(0)
  })

  it('caller mutation of context cannot detach cancellation and permit a late commit', async () => {
    const gate = deferred<typeof ready>(), controller = new AbortController(), b = new BackendBoundary()
    await b.activate(backend('old'))
    const context: { signal?: AbortSignal } = { signal: controller.signal }
    const activation = b.activate(backend('next', { check: () => gate.promise }), context)
    context.signal = undefined
    controller.abort()
    await expect(activation).rejects.toMatchObject({ code: 'operation_cancelled' })
    gate.resolve(ready)
    // Flush this in-memory chain through one event-loop turn; no polling or live I/O.
    await new Promise<void>(resolve => setImmediate(resolve))
    try {
      expect(b.snapshot().current).toBe('old')
      await expect(b.call('probe')).resolves.toEqual({ state: 'completed', value: 'old' })
    } finally { await b.dispose() }
  })

  it('cancellation after the selection commit does not pretend the completed switch was rolled back', async () => {
    const started = deferred<void>(), cleanup = deferred<void>(), controller = new AbortController(), b = new BackendBoundary()
    await b.activate(backend('one', { dispose() { started.resolve(); return cleanup.promise } }))
    await b.activate(backend('two'))
    const activation = b.activate(backend('three'), { signal: controller.signal })
    await started.promise
    expect(b.snapshot().current).toBe('three')
    controller.abort(); cleanup.resolve()
    await expect(activation).resolves.toMatchObject({ current: 'three' })
    await b.dispose()
  })

  it('cancelled readiness cannot commit later and retains the gate until it settles', async () => {
    const gate = deferred<typeof ready>(), controller = new AbortController(), b = new BackendBoundary()
    await b.activate(backend('old'))
    const candidate = backend('next', { check: () => gate.promise })
    const activation = b.activate(candidate, { signal: controller.signal }); controller.abort()
    await expect(activation).rejects.toMatchObject({ code: 'operation_cancelled' })
    expect(b.snapshot()).toMatchObject({ phase: 'switching', current: 'old' })
    await expect(b.call('connect')).rejects.toMatchObject({ code: 'boundary_busy' })
    gate.resolve(ready)
    await b.dispose()
    expect(candidate.stats.disposes).toBe(1)
  })
})
