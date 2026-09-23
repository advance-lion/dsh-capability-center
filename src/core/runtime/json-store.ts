/**
 * JSON-based Runtime Store for V0.1.
 *
 * Persists ConnectionInstance records to a JSON file under DSH_HOME.
 * In V0.2 this will be replaced by SQLite with the same interface.
 *
 * State is derived, not stored: observedState and healthState are
 * always recomputed from the latest recipe run or provider snapshot.
 * The store only persists the raw facts: owner, credential ref,
 * safe metadata, and the last observation timestamp.
 */

import type { ConnectionInstance } from '../domain/types'
import type { RuntimeStore } from '../provider/aggregator'
import { normalizeObservedState, deriveHealthState } from '../domain/status'
import type { ProviderConnectionSummary } from '../domain/types'

interface PersistedInstance {
  id: string
  integrationId: string
  methodId: string
  ownerKind: 'recipe' | 'provider'
  ownerRef: string
  externalInstanceId?: string
  displayName: string
  desiredState: 'connected' | 'paused' | 'removed'
  rawStatus?: string
  connected?: boolean
  receiveEnabled?: boolean
  observedAt?: string
  ownerVersion?: string
  credentialRef?: string
  safeMetadata?: Record<string, string | number | boolean | null>
  activeCapabilities?: string[]
  lastVerifiedAt?: string
}

interface RuntimeFile {
  schemaVersion: 1
  instances: PersistedInstance[]
}

export class JsonRuntimeStore implements RuntimeStore {
  private instances = new Map<string, ConnectionInstance>()
  private filePath: string
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(dshHome: string) {
    this.filePath = `${dshHome}/capability-center/runtime.json`
  }

  /**
   * Load persisted instances from disk.
   */
  async load(): Promise<void> {
    try {
      const fs = await import('node:fs/promises')
      const content = await fs.readFile(this.filePath, 'utf-8')
      const data: RuntimeFile = JSON.parse(content)
      for (const p of data.instances || []) {
        this.instances.set(p.id, this.fromPersisted(p))
      }
    } catch {
      // File doesn't exist yet — start empty
    }
  }

  /**
   * Persist current instances to disk (atomic write).
   */
  private async save(): Promise<void> {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')

    const dir = path.dirname(this.filePath)
    try {
      await fs.mkdir(dir, { recursive: true })
    } catch {
      // Directory might already exist
    }

    const data: RuntimeFile = {
      schemaVersion: 1,
      instances: [...this.instances.values()].map((i) => this.toPersisted(i)),
    }

    const tmpPath = `${this.filePath}.tmp`
    await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), { mode: 0o600 })
    await fs.rename(tmpPath, this.filePath)
  }

  /**
   * Enqueue a save operation (serialized).
   */
  private enqueueSave(): void {
    this.writeQueue = this.writeQueue.then(() => this.save()).catch(() => {})
  }

  async listInstances(): Promise<ConnectionInstance[]> {
    return [...this.instances.values()]
  }

  async getInstancesByMethod(methodId: string): Promise<ConnectionInstance[]> {
    return [...this.instances.values()].filter((i) => i.methodId === methodId)
  }

  /**
   * Upsert a connection instance from a provider snapshot.
   */
  upsertFromProvider(summary: ProviderConnectionSummary, ownerRef: string): ConnectionInstance {
    const id = `provider:${ownerRef}:${summary.externalInstanceId}`
    const observed = summary.observedState
    const health = summary.healthState

    const instance: ConnectionInstance = {
      id,
      integrationId: summary.integrationId,
      methodId: summary.methodId,
      owner: {
        kind: 'provider',
        ref: ownerRef,
        externalInstanceId: summary.externalInstanceId,
      },
      displayName: summary.displayName,
      desiredState: 'connected',
      observedState: observed,
      healthState: health,
      rawStatus: summary.rawStatus,
      observedAt: summary.observedAt,
      safeMetadata: summary.safeMetadata,
      activeCapabilities: summary.activeCapabilities,
    }

    this.instances.set(id, instance)
    this.enqueueSave()
    return instance
  }

  /**
   * Upsert a connection instance from a recipe run result.
   */
  upsertFromRecipe(params: {
    integrationId: string
    methodId: string
    recipeVersionId: string
    displayName: string
    rawStatus?: string
    connected?: boolean
    observedState?: import('../domain/types').ObservedState
    safeMetadata?: Record<string, string | number | boolean | null>
    activeCapabilities?: string[]
    credentialRef?: string
  }): ConnectionInstance {
    const id = `recipe:${params.methodId}:${params.recipeVersionId}`
    const observed = params.observedState || normalizeObservedState(params.rawStatus, params.connected, undefined)
    const health = deriveHealthState(observed, params.rawStatus)

    const instance: ConnectionInstance = {
      id,
      integrationId: params.integrationId,
      methodId: params.methodId,
      owner: {
        kind: 'recipe',
        ref: params.recipeVersionId,
      },
      displayName: params.displayName,
      desiredState: 'connected',
      observedState: observed,
      healthState: health,
      rawStatus: params.rawStatus,
      observedAt: new Date().toISOString(),
      ownerVersion: params.recipeVersionId,
      credentialRef: params.credentialRef,
      safeMetadata: params.safeMetadata,
      activeCapabilities: params.activeCapabilities,
      lastVerifiedAt: new Date().toISOString(),
    }

    this.instances.set(id, instance)
    this.enqueueSave()
    return instance
  }

  /**
   * Remove an instance by id.
   */
  remove(id: string): void {
    this.instances.delete(id)
    this.enqueueSave()
  }

  // ── Conversion helpers ──────────────────────────────────

  private fromPersisted(p: PersistedInstance): ConnectionInstance {
    const observed = normalizeObservedState(p.rawStatus, p.connected, p.receiveEnabled)
    const health = deriveHealthState(observed, p.rawStatus)

    return {
      id: p.id,
      integrationId: p.integrationId,
      methodId: p.methodId,
      owner: {
        kind: p.ownerKind,
        ref: p.ownerRef,
        externalInstanceId: p.externalInstanceId,
      },
      displayName: p.displayName,
      desiredState: p.desiredState,
      observedState: observed,
      healthState: health,
      rawStatus: p.rawStatus,
      observedAt: p.observedAt,
      ownerVersion: p.ownerVersion,
      credentialRef: p.credentialRef,
      safeMetadata: p.safeMetadata,
      activeCapabilities: p.activeCapabilities,
      lastVerifiedAt: p.lastVerifiedAt,
    }
  }

  private toPersisted(i: ConnectionInstance): PersistedInstance {
    return {
      id: i.id,
      integrationId: i.integrationId,
      methodId: i.methodId,
      ownerKind: i.owner.kind,
      ownerRef: i.owner.ref,
      externalInstanceId: i.owner.externalInstanceId,
      displayName: i.displayName,
      desiredState: i.desiredState,
      rawStatus: i.rawStatus,
      observedAt: i.observedAt,
      ownerVersion: i.ownerVersion,
      credentialRef: i.credentialRef,
      safeMetadata: i.safeMetadata,
      activeCapabilities: i.activeCapabilities,
      lastVerifiedAt: i.lastVerifiedAt,
    }
  }
}
