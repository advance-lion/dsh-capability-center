/**
 * Capability Registry — answers "what do I have, and what state is it in?"
 *
 * The Registry is the runtime manager. It dispatches install / uninstall /
 * connect / disconnect / health calls to the appropriate adapter based on
 * the capability's type and transport.
 *
 * The Registry itself does NOT implement any runtime logic — it is purely a
 * dispatcher. Each adapter (SkillAdapter, MCPAdapter, CLIAdapter, etc.)
 * handles the actual work.
 */
import type {
  Capability,
  CapabilityStatus,
  HealthStatus,
} from './types'
import type { CapabilityCatalog } from './catalog'
import type { SkillAdapter } from '../adapters/skill-adapter'
import type { MCPAdapter } from '../adapters/mcp-adapter'
import type { CLIAdapter } from '../adapters/cli-adapter'
import type { IMRecommendationAdapter } from '../adapters/im-recommendation-adapter'

export class CapabilityRegistry {
  /** Local status map — the live state of each capability on this machine. */
  private statusMap = new Map<string, CapabilityStatus>()

  constructor(
    private catalog: CapabilityCatalog,
    private skillAdapter?: SkillAdapter,
    private mcpAdapter?: MCPAdapter,
    private cliAdapter?: CLIAdapter,
    private imAdapter?: IMRecommendationAdapter,
  ) {}

  /** List all capabilities with their current local status merged in. */
  async list(): Promise<Capability[]> {
    const caps = await this.catalog.list()
    return caps.map((c) => ({
      ...c,
      status: this.statusMap.get(c.id) ?? c.status,
    }))
  }

  /** Get a single capability with live status. */
  async get(id: string): Promise<Capability | null> {
    const cap = await this.catalog.get(id)
    if (!cap) return null
    return { ...cap, status: this.statusMap.get(id) ?? cap.status }
  }

  /** Install a capability. Dispatches to the right adapter. */
  async install(id: string): Promise<void> {
    const cap = await this.catalog.get(id)
    if (!cap) throw new Error(`Capability not found: ${id}`)

    switch (cap.type) {
      case 'skill':
        await this.skillAdapter?.install(cap)
        break
      case 'connector':
        if (cap.transport === 'mcp') {
          await this.mcpAdapter?.install(cap)
        } else if (cap.transport === 'cli') {
          await this.cliAdapter?.install?.(cap)
        }
        break
      case 'partner':
        // Partner installation is handled by dsh-agent-partners
        throw new Error('Partner installation is managed by dsh-agent-partners')
    }

    this.statusMap.set(id, 'installed')
  }

  /** Uninstall a capability. */
  async uninstall(id: string): Promise<void> {
    const cap = await this.catalog.get(id)
    if (!cap) return

    switch (cap.type) {
      case 'skill':
        await this.skillAdapter?.uninstall(cap)
        break
      case 'connector':
        if (cap.transport === 'mcp') {
          await this.mcpAdapter?.uninstall(cap)
        } else if (cap.transport === 'cli') {
          await this.cliAdapter?.uninstall?.(cap)
        }
        break
    }

    this.statusMap.delete(id)
  }

  /** Enable a capability (e.g. a disabled skill). */
  async enable(id: string): Promise<void> {
    const cap = await this.catalog.get(id)
    if (!cap) return

    if (cap.type === 'skill') {
      await this.skillAdapter?.enable(cap)
    }

    this.statusMap.set(id, 'installed')
  }

  /** Disable a capability. */
  async disable(id: string): Promise<void> {
    const cap = await this.catalog.get(id)
    if (!cap) return

    if (cap.type === 'skill') {
      await this.skillAdapter?.disable(cap)
    }

    this.statusMap.set(id, 'disabled')
  }

  /** Connect a connector (MCP or CLI). */
  async connect(id: string): Promise<void> {
    const cap = await this.catalog.get(id)
    if (!cap || cap.type !== 'connector') return

    if (cap.transport === 'mcp') {
      await this.mcpAdapter?.connect(cap)
    } else if (cap.transport === 'cli') {
      await this.cliAdapter?.connect(cap)
    }

    this.statusMap.set(id, 'connected')
  }

  /** Disconnect a connector. */
  async disconnect(id: string): Promise<void> {
    const cap = await this.catalog.get(id)
    if (!cap || cap.type !== 'connector') return

    if (cap.transport === 'mcp') {
      await this.mcpAdapter?.disconnect(cap)
    } else if (cap.transport === 'cli') {
      await this.cliAdapter?.disconnect(cap)
    }

    this.statusMap.set(id, 'installed')
  }

  /** Check the health of a capability. */
  async health(id: string): Promise<HealthStatus> {
    const cap = await this.catalog.get(id)
    if (!cap) return { healthy: false, message: 'Not found' }

    if (cap.type === 'connector') {
      if (cap.transport === 'mcp') {
        return (await this.mcpAdapter?.health(cap)) ?? { healthy: false }
      }
      if (cap.transport === 'cli') {
        return (await this.cliAdapter?.health(cap)) ?? { healthy: false }
      }
    }

    return { healthy: true }
  }
}
