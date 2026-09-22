/**
 * MCPAdapter — bridges the unified Capability model to DSH's native
 * MCP client (@deepseek-ai/dsh-mcp-client).
 *
 * MCP is just one transport for a Connector. This adapter:
 * 1. Reads MCP server config for display
 * 2. Translates connect/disconnect to MCP client operations
 * 3. Reports health by pinging the MCP server
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

  /** Health check — ping the MCP server. */
  health(cap: Capability): Promise<HealthStatus>
}

/**
 * Concrete MCPAdapter that delegates to @deepseek-ai/dsh-mcp-client.
 * The actual MCP client service is injected at plugin apply time.
 */
export class DefaultMCPAdapter implements MCPAdapter {
  constructor(private mcpClient?: any) {}

  async discover(): Promise<Capability[]> {
    if (!this.mcpClient) return []
    // TODO: read MCP config and map to Capability[]
    return []
  }

  async install(cap: Capability): Promise<void> {
    // TODO: mcpClient.addServer(cap.id, cap.runtime)
  }

  async uninstall(cap: Capability): Promise<void> {
    // TODO: mcpClient.removeServer(cap.id)
  }

  async connect(cap: Capability): Promise<void> {
    // TODO: mcpClient.connect(cap.id) — tools register on ctx.tools
  }

  async disconnect(cap: Capability): Promise<void> {
    // TODO: mcpClient.disconnect(cap.id)
  }

  async health(cap: Capability): Promise<HealthStatus> {
    // TODO: mcpClient.ping(cap.id)
    return { healthy: false, message: 'Not implemented' }
  }
}
