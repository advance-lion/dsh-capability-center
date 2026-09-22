/**
 * Capability Provider — the pluggable source of capabilities.
 *
 * Different providers supply different kinds of capabilities:
 * - OfficialProvider: first-party capabilities curated by the DSH team
 * - LocalProvider: capabilities discovered on the local machine
 * - PartnerProvider: agent partners from dsh-agent-partners
 * - CommunityProvider: community marketplace entries (future)
 *
 * The Catalog aggregates all registered providers into a unified list.
 */
import type { Capability } from './types'

export interface CapabilityProvider {
  /** Unique provider identifier. */
  id: string

  /** Human-readable name. */
  name: string

  /** List all capabilities this provider knows about. */
  list(): Promise<Capability[]>
}

/**
 * OfficialProvider — ships with the plugin, defines first-party capabilities.
 * In V0.1 this is the only provider; it returns the built-in catalog
 * (Feishu connector, GitHub MCP, DSH skills, etc.).
 */
export class OfficialProvider implements CapabilityProvider {
  id = 'official'
  name = '官方'

  private capabilities: Capability[] = []

  register(cap: Capability): void {
    this.capabilities.push(cap)
  }

  async list(): Promise<Capability[]> {
    return [...this.capabilities]
  }
}

/**
 * LocalProvider — discovers capabilities already installed on this machine.
 * Scans ctx.skills, MCP config, and installed CLI tools.
 */
export class LocalProvider implements CapabilityProvider {
  id = 'local'
  name = '本机'

  constructor(private capabilities: Capability[] = []) {}

  async list(): Promise<Capability[]> {
    return [...this.capabilities]
  }
}

/**
 * PartnerProvider — supplied by the dsh-agent-partners plugin.
 * Capability Center only calls list(); it does not know how partners start.
 */
export interface PartnerProvider extends CapabilityProvider {
  /** Partner providers may expose additional partner-specific metadata. */
  listPartners(): Promise<Capability[]>
}
