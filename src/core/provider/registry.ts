/**
 * Provider Registry.
 *
 * Manages CapabilityProvider instances. Providers register themselves
 * at startup; the Aggregator queries all registered providers to
 * build the unified view.
 *
 * No platform names are hardcoded — providers are discovered and
 * registered dynamically. The registry only knows the Provider SPI.
 */

import type { CapabilityProvider, ProviderDescriptor } from '../domain/types'

export class ProviderRegistry {
  private providers = new Map<string, CapabilityProvider>()
  private descriptors = new Map<string, ProviderDescriptor>()

  async register(provider: CapabilityProvider): Promise<void> {
    const desc = await provider.descriptor()
    if (this.providers.has(desc.id)) {
      throw new Error(`Provider already registered: ${desc.id}`)
    }
    this.providers.set(desc.id, provider)
    this.descriptors.set(desc.id, desc)
  }

  get(providerId: string): CapabilityProvider | undefined {
    return this.providers.get(providerId)
  }

  getDescriptor(providerId: string): ProviderDescriptor | undefined {
    return this.descriptors.get(providerId)
  }

  list(): string[] {
    return [...this.providers.keys()]
  }

  listDescriptors(): ProviderDescriptor[] {
    return [...this.descriptors.values()]
  }

  async listAll(): Promise<Array<{ provider: CapabilityProvider; descriptor: ProviderDescriptor }>> {
    const result: Array<{ provider: CapabilityProvider; descriptor: ProviderDescriptor }> = []
    for (const [id, provider] of this.providers) {
      const descriptor = this.descriptors.get(id)!
      result.push({ provider, descriptor })
    }
    return result
  }
}
