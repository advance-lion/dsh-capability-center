/**
 * MCPAdapter — bridges the unified Capability model to DSH's native
 * MCP client (@deepseek-ai/dsh-mcp-client).
 *
 * MCP is just one transport for a Connector. This adapter:
 * 1. Reads MCP server configs from DSH settings for display
 * 2. Dynamically loads/unloads MCP client plugin instances to connect/disconnect
 * 3. Reports health by checking if the server's tools are registered on ctx.tools
 *
 * It does NOT re-implement the MCP runtime — it delegates to dsh-mcp-client.
 */
import type { Capability, HealthStatus } from '../capability/types'

export interface MCPAdapter {
  /** Discover configured MCP servers and convert to Capability objects. */
  discover(): Promise<Capability[]>

  /** Install (register) an MCP server config. */
  install(cap: Capability): Promise<void>

  /** Uninstall (remove) an MCP server config. */
  uninstall(cap: Capability): Promise<void>

  /** Connect to an MCP server — the server's tools register on ctx.tools. */
  connect(cap: Capability): Promise<void>

  /** Disconnect from an MCP server. */
  disconnect(cap: Capability): Promise<void>

  /** Health check — verify the MCP server is connected. */
  health(cap: Capability): Promise<HealthStatus>
}

/** Track active MCP plugin instances for connect/disconnect. */
interface MCPInstance {
  serverName: string
  dispose: () => void
}

/**
 * Concrete MCPAdapter that delegates to @deepseek-ai/dsh-mcp-client.
 * The Cordis context is injected at plugin apply time to manage plugin lifecycle.
 */
export class DefaultMCPAdapter implements MCPAdapter {
  /** Active MCP plugin instances keyed by serverName. */
  private instances = new Map<string, MCPInstance>()

  constructor(
    private mcpClient?: any,
    private ctx?: any,
  ) {}

  async discover(): Promise<Capability[]> {
    // Read MCP server configs from DSH settings.
    // The settings service stores MCP configs under dsh.mcp.servers.
    const settings = this.ctx?.get('dsh.settings')
    if (!settings) return []

    const mcpConfigs = (await settings.get('mcp.servers')) ?? []
    if (!Array.isArray(mcpConfigs)) return []

    return mcpConfigs.map((cfg: any): Capability => ({
      id: cfg.serverName ?? cfg.id ?? 'unknown',
      type: 'connector',
      name: cfg.serverName ?? cfg.name ?? 'MCP Server',
      description: cfg.description ?? `MCP Server: ${cfg.serverName ?? cfg.command}`,
      icon: '🔌',
      category: ['开发'],
      tags: ['mcp', cfg.serverName ?? ''],
      transport: 'mcp',
      source: 'DSH MCP Client',
      sourcePath: 'core/adapters/mcp-adapter.ts',
      sourceUrl: 'https://github.com/modelcontextprotocol/servers',
      status: this.instances.has(cfg.serverName) ? 'connected' : 'available',
      capabilities: [],
      runtime: {
        transport: 'mcp',
        serverName: cfg.serverName,
        command: cfg.command,
      },
      provider: { name: 'official' },
    }))
  }

  async install(cap: Capability): Promise<void> {
    // Register MCP server config in DSH settings.
    const settings = this.ctx?.get('dsh.settings')
    if (!settings) throw new Error('dsh.settings service not available')

    const configs = (await settings.get('mcp.servers')) ?? []
    configs.push({
      transport: 'stdio',
      serverName: cap.id,
      command: cap.runtime?.command ?? '',
      args: [],
      env: {},
      cwd: '',
      toolCallTimeoutMs: 30000,
      failOnStartupError: false,
    })
    await settings.set('mcp.servers', configs)
  }

  async uninstall(cap: Capability): Promise<void> {
    // Remove MCP server config from DSH settings.
    const settings = this.ctx?.get('dsh.settings')
    if (!settings) throw new Error('dsh.settings service not available')

    const configs = (await settings.get('mcp.servers')) ?? []
    const filtered = configs.filter(
      (c: any) => c.serverName !== cap.id,
    )
    await settings.set('mcp.servers', filtered)

    // Also disconnect if active.
    await this.disconnect(cap)
  }

  async connect(cap: Capability): Promise<void> {
    if (!this.mcpClient || !this.ctx) {
      throw new Error('MCP client or context not available')
    }

    const serverName = cap.runtime?.serverName ?? cap.id
    if (this.instances.has(serverName)) return // already connected

    // Read the config for this server.
    const settings = this.ctx.get('dsh.settings')
    const configs = (await settings?.get('mcp.servers')) ?? []
    const cfg = configs.find((c: any) => c.serverName === serverName)
    if (!cfg) throw new Error(`MCP server config not found: ${serverName}`)

    // Dynamically load the MCP client plugin with this config.
    const dispose = this.ctx.plugin(this.mcpClient, cfg)
    this.instances.set(serverName, { serverName, dispose })
  }

  async disconnect(cap: Capability): Promise<void> {
    const serverName = cap.runtime?.serverName ?? cap.id
    const instance = this.instances.get(serverName)
    if (!instance) return // not connected

    instance.dispose()
    this.instances.delete(serverName)
  }

  async health(cap: Capability): Promise<HealthStatus> {
    const serverName = cap.runtime?.serverName ?? cap.id
    const connected = this.instances.has(serverName)

    if (!connected) {
      return { healthy: false, message: 'Not connected', lastChecked: Date.now() }
    }

    // Check if tools are registered by looking for mcp__<serverName>__ prefix.
    const tools = this.ctx?.get('dsh.tools')
    if (tools?.list) {
      const allTools = tools.list()
      const hasTools = allTools.some(
        (t: any) => t.name?.startsWith(`mcp__${serverName}__`),
      )
      return {
        healthy: hasTools,
        message: hasTools ? undefined : 'Connected but no tools registered',
        lastChecked: Date.now(),
      }
    }

    return { healthy: true, lastChecked: Date.now() }
  }
}
