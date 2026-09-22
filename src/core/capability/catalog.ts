/**
 * Capability Catalog — answers "what capabilities exist?"
 *
 * Aggregates all registered providers into a single, searchable, filterable
 * list. The Catalog is read-only: it never installs or connects anything.
 * That's the Registry's job.
 */
import type { Capability, CapabilityType } from './types'
import type { CapabilityProvider } from './provider'

export class CapabilityCatalog {
  private providers: CapabilityProvider[] = []

  registerProvider(provider: CapabilityProvider): void {
    this.providers.push(provider)
  }

  /** List all capabilities from all providers, optionally filtered. */
  async list(filter?: {
    type?: CapabilityType
    category?: string
    search?: string
  }): Promise<Capability[]> {
    const all: Capability[] = []
    for (const p of this.providers) {
      const caps = await p.list()
      all.push(...caps)
    }

    let result = all

    if (filter?.type) {
      result = result.filter((c) => c.type === filter.type)
    }

    if (filter?.category && filter.category !== 'all') {
      result = result.filter((c) => c.category?.includes(filter.category!))
    }

    if (filter?.search) {
      const q = filter.search.toLowerCase()
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.description?.toLowerCase().includes(q) ||
          c.tags?.some((t) => t.toLowerCase().includes(q)),
      )
    }

    return result
  }

  /** Get a single capability by ID. */
  async get(id: string): Promise<Capability | null> {
    for (const p of this.providers) {
      const caps = await p.list()
      const found = caps.find((c) => c.id === id)
      if (found) return found
    }
    return null
  }
}
