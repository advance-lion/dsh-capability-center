/**
 * Transport-independent backend replacement boundary.
 * No UI, host services, filesystem, timers or authentication assumptions.
 * This is not wired into the production registry/routes yet.
 */
export interface BackendContext { readonly signal?: AbortSignal }
export type BackendResult =
  | { state: 'completed'; value?: unknown }
  | { state: 'waiting_user'; challenge?: unknown }
  | { state: 'failed'; error?: unknown }

export interface Backend {
  /** Unique immutable implementation/version identity, NOT an account ID. */
  id: string
  contractVersion: 1
  actions: readonly string[]
  /** Read-only readiness, not proof of external account authentication. */
  check(context: BackendContext): { ready: boolean; contractVersion: number } | Promise<{ ready: boolean; contractVersion: number }>
  execute(action: string, context: BackendContext): BackendResult | Promise<BackendResult>
  dispose(): void | Promise<void>
}

export class BoundaryError extends Error {
  constructor(public readonly code: string) { super(code); this.name = 'BoundaryError' }
}

interface Entry {
  readonly id: string
  readonly actions: ReadonlySet<string>
  readonly check: Backend['check']
  readonly execute: Backend['execute']
  readonly dispose: Backend['dispose']
  cleanup?: Promise<void>
}

export interface BoundarySnapshot {
  current: string | null
  previous: string | null
  phase: 'empty' | 'ready' | 'switching' | 'stopped'
  inFlight: number
  cleanupErrors: Array<{ backendId: string; code: 'cleanup_failed' }>
}

const fail = (code: string): never => { throw new BoundaryError(code) }

/**
 * Return cancellation promptly, but continue observing the underlying task.
 * Actual lease release belongs to the task's finally, NOT this race.
 */
function waitWithSignal<T>(work: Promise<T>, signal?: AbortSignal, committed: () => boolean = () => false): Promise<T> {
  if (!signal) return work
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', abort)
      callback()
    }
    const abort = () => {
      // Activation has a synchronous commit point; cancellation after commit
      // must not claim the selection was rolled back.
      if (!committed()) finish(() => reject(new BoundaryError('operation_cancelled')))
    }
    signal.addEventListener('abort', abort, { once: true })
    work.then(value => finish(() => resolve(value)), error => finish(() => reject(error)))
    if (signal.aborted) abort()
  })
}

export class BackendBoundary {
  private current?: Entry
  private previous?: Entry
  private switching = false
  private inFlight = 0
  private stopped = false
  private readonly owned = new Set<Entry>()
  private readonly usedIds = new Set<string>()
  private readonly cleanupErrors: BoundarySnapshot['cleanupErrors'] = []
  private closing?: Promise<void>
  private resolveClosing?: () => void
  private draining = false

  snapshot(): BoundarySnapshot {
    return {
      current: this.current?.id ?? null,
      previous: this.previous?.id ?? null,
      phase: this.stopped ? 'stopped' : this.switching ? 'switching' : this.current ? 'ready' : 'empty',
      inFlight: this.inFlight,
      cleanupErrors: this.cleanupErrors.map(error => ({ ...error })),
    }
  }

  private ensureRunning(signal?: AbortSignal): void {
    if (this.stopped) fail('boundary_stopped')
    if (signal?.aborted) fail('operation_cancelled')
  }

  private ensureIdle(signal?: AbortSignal): void {
    this.ensureRunning(signal)
    if (this.switching || this.inFlight !== 0) fail('boundary_busy')
  }

  private capture(candidate: Backend): Entry {
    if (!candidate || candidate.contractVersion !== 1 || typeof candidate.id !== 'string' || !candidate.id.trim() ||
        typeof candidate.check !== 'function' || typeof candidate.execute !== 'function' || typeof candidate.dispose !== 'function' ||
        !Array.isArray(candidate.actions) || candidate.actions.length === 0 ||
        !candidate.actions.every(action => typeof action === 'string' && /^[a-z][a-z0-9.-]*$/.test(action)) ||
        new Set(candidate.actions).size !== candidate.actions.length) fail('incompatible_backend')
    if (this.usedIds.has(candidate.id)) fail('duplicate_backend')
    // Capture callable identities and action/identity metadata. Backend-owned
    // internal mutable state remains the backend's responsibility.
    const entry: Entry = {
      id: candidate.id, actions: new Set(candidate.actions),
      check: candidate.check.bind(candidate), execute: candidate.execute.bind(candidate), dispose: candidate.dispose.bind(candidate),
    }
    this.usedIds.add(entry.id)
    this.owned.add(entry)
    return entry
  }

  async activate(candidate: Backend, context: BackendContext = {}): Promise<BoundarySnapshot> {
    context = Object.freeze({ signal: context.signal })
    this.ensureIdle(context.signal)
    return this.switchTo(this.capture(candidate), context)
  }

  async rollback(context: BackendContext = {}): Promise<BoundarySnapshot> {
    context = Object.freeze({ signal: context.signal })
    this.ensureIdle(context.signal)
    if (!this.previous) fail('no_rollback_target')
    return this.switchTo(this.previous!, context)
  }

  private switchTo(entry: Entry, context: BackendContext): Promise<BoundarySnapshot> {
    this.switching = true
    let committed = false
    const work = (async () => {
      try {
        const check = await entry.check(context)
        this.ensureRunning(context.signal)
        if (!check || check.ready !== true || check.contractVersion !== 1) fail('candidate_not_ready')
        const retired = this.previous
        // Synchronous selection commit: no await between the two pointers.
        this.previous = this.current
        this.current = entry
        committed = true
        if (retired && retired !== entry) await this.cleanup(retired)
        if (this.stopped) fail('boundary_stopped')
      } catch (error) {
        // A failed new candidate is ours to clean. A failed rollback target is
        // retained, because it is still the explicit previous version.
        if (entry !== this.current && entry !== this.previous) await this.cleanup(entry)
        throw error
      } finally {
        this.switching = false
        this.finishCloseIfDrained()
      }
      return this.snapshot()
    })()
    return waitWithSignal(work, context.signal, () => committed)
  }

  async call(action: string, context: BackendContext = {}): Promise<BackendResult> {
    context = Object.freeze({ signal: context.signal })
    this.ensureRunning(context.signal)
    if (this.switching) fail('boundary_busy')
    if (!this.current) fail('backend_unavailable')
    const selected = this.current!
    if (!selected.actions.has(action)) fail('unsupported_action')
    this.inFlight++
    const work = (async () => {
      try {
        const result = await selected.execute(action, context)
        this.ensureRunning(context.signal)
        if (!result || typeof result !== 'object' || Array.isArray(result) ||
            !['completed', 'waiting_user', 'failed'].includes(result.state)) fail('invalid_backend_result')
        // Authentication verification belongs to the concrete backend. In
        // particular, waiting_user and failed never become completed here.
        return result
      } finally {
        this.inFlight--
        this.finishCloseIfDrained()
      }
    })()
    return waitWithSignal(work, context.signal)
  }

  private cleanup(entry: Entry): Promise<void> {
    if (!entry.cleanup) {
      entry.cleanup = (async () => {
        try { await entry.dispose() }
        catch { this.cleanupErrors.push({ backendId: entry.id, code: 'cleanup_failed' }) }
        finally { this.owned.delete(entry) }
      })()
    }
    return entry.cleanup
  }

  /**
   * Stop accepting work immediately. Wait for real in-flight work before
   * disposal; a non-cooperative hung backend can keep this promise pending.
   * No false claim of forceful cancellation or successful credential revoke.
   */
  dispose(): Promise<void> {
    if (!this.closing) this.closing = new Promise<void>(resolve => { this.resolveClosing = resolve })
    this.stopped = true
    this.finishCloseIfDrained()
    return this.closing
  }

  private finishCloseIfDrained(): void {
    if (!this.stopped || this.switching || this.inFlight !== 0 || this.draining) return
    this.draining = true
    this.current = undefined
    this.previous = undefined
    void (async () => {
      for (const entry of this.owned) await this.cleanup(entry)
      this.resolveClosing?.()
    })()
  }
}
