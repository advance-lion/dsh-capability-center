/**
 * MCPAdapter — bridges the unified Capability model to DSH's native
 * MCP client (@deepseek-ai/dsh-mcp-client).
 *
 * MCP is just one transport for a Connector. This adapter:
 * 1. Reads MCP server configs from ~/.dsh/mcp.json (same format as dsh-skills-mcp-manager)
 * 2. Dynamically loads/unloads MCP client plugin fibers to connect/disconnect
 * 3. Reports health by checking fiber status
 *
 * The connection logic is adapted from dsh-skills-mcp-manager's McpManager,
 * which has already proven that DSH can manage real MCP connections via
 * ctx.plugin(mcpClient, config) fibers.
 */
import type { Context, Fiber } from '@deepseek-ai/cordis'
import * as mcpClient from '@deepseek-ai/dsh-mcp-client'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Capability, HealthStatus } from '../capability/types'

// ── MCP config types (compatible with dsh-skills-mcp-manager) ──────────────

export interface McpServerConfig {
  name: string
  transport: 'stdio' | 'streamable-http'
  enabled?: boolean
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  url?: string
  headers?: Record<string, string>
}

// ── Config file I/O ──────────────────────────────────────────────────────────

/** The ~/.dsh/mcp.json path (same as dsh-skills-mcp-manager). */
function mcpConfigPath(): string {
  const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh')
  return join(dshHome, 'mcp.json')
}

/** Read the persisted MCP servers document (never throws). */
function readMcpConfig(): { servers: McpServerConfig[] } {
  const target = mcpConfigPath()
  try {
    if (!existsSync(target)) return { servers: [] }
    const raw = readFileSync(target, 'utf8')
    if (!raw || raw.trim() === '') return { servers: [] }
    const data = JSON.parse(raw) as { servers?: unknown }
    return { servers: Array.isArray(data.servers) ? (data.servers as McpServerConfig[]) : [] }
  } catch {
    return { servers: [] }
  }
}

/** Persist the MCP servers document. */
function writeMcpConfig(data: { servers: McpServerConfig[] }): void {
  const target = mcpConfigPath()
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, JSON.stringify(data, null, 2), 'utf8')
}

// ── Config mapping ──────────────────────────────────────────────────────────

const TOOL_CALL_TIMEOUT_MS = 60_000
const RECONNECT = { enabled: true, initialDelayMs: 500, maxDelayMs: 30_000, maxAttempts: 10 }

/** Map a persisted server definition to the mcp-client plugin Config. */
function toMcpClientConfig(s: McpServerConfig): mcpClient.Config {
  const base = {
    serverName: s.name,
    toolCallTimeoutMs: TOOL_CALL_TIMEOUT_MS,
    failOnStartupError: true,
    reconnect: RECONNECT,
  }
  if (s.transport === 'stdio') {
    return {
      ...base,
      transport: 'stdio',
      command: s.command ?? '',
      args: s.args ?? [],
      env: s.env ?? {},
      cwd: s.cwd ?? '',
    } as mcpClient.Config
  }
  return {
    ...base,
    transport: 'streamable-http',
    url: s.url ?? '',
    headers: s.headers ?? {},
  } as mcpClient.Config
}

// ── Adapter interface ───────────────────────────────────────────────────────

export interface MCPAdapter {
  discover(): Promise<Capability[]>
  install(cap: Capability): Promise<void>
  uninstall(cap: Capability): Promise<void>
  connect(cap: Capability): Promise<void>
  disconnect(cap: Capability): Promise<void>
  health(cap: Capability): Promise<HealthStatus>
}

interface LiveServer {
  config: McpServerConfig
  fiber: Fiber
}

type FiberStatus = 'connecting' | 'running' | 'failed' | 'stopped'

// ── Concrete adapter ────────────────────────────────────────────────────────

/**
 * Concrete MCPAdapter that delegates to @deepseek-ai/dsh-mcp-client.
 * Uses Cordis plugin fibers for real connect/disconnect — same proven
 * approach as dsh-skills-mcp-manager's McpManager.
 */
export class DefaultMCPAdapter implements MCPAdapter {
  private readonly live = new Map<string, LiveServer>()
  private readonly statuses = new Map<string, { status: FiberStatus; error?: string }>()

  constructor(
    _mcpClient?: any,
    private ctx?: Context,
  ) {}

  async discover(): Promise<Capability[]> {
    const { servers } = readMcpConfig()
    return servers.map((s): Capability => {
      const st = this.statuses.get(s.name)
      const enabled = s.enabled !== false
      const status: Capability['status'] = !enabled
        ? 'disabled'
        : st?.status === 'running'
          ? 'connected'
          : st?.status === 'failed'
            ? 'error'
            : 'available'
      return {
        id: s.name,
        type: 'connector',
        name: s.name,
        description: s.transport === 'stdio'
          ? `MCP Server: ${s.command} ${(s.args ?? []).join(' ')}`
          : `MCP Server: ${s.url}`,
        icon: '🔌',
        category: ['开发'],
        tags: ['mcp', s.name],
        transport: 'mcp',
        source: 'DSH MCP Client',
        sourcePath: 'core/adapters/mcp-adapter.ts',
        sourceUrl: 'https://github.com/modelcontextprotocol/servers',
        status,
        capabilities: [],
        runtime: {
          transport: 'mcp',
          serverName: s.name,
          command: s.command,
          endpoint: s.url,
        },
        provider: { name: 'official' },
      }
    })
  }

  async install(cap: Capability): Promise<void> {
    const { servers } = readMcpConfig()
    const newServer: McpServerConfig = {
      name: cap.id,
      transport: 'stdio',
      enabled: true,
      command: cap.runtime?.command ?? '',
      args: [],
      env: {},
      cwd: '',
    }
    servers.push(newServer)
    writeMcpConfig({ servers })
  }

  async uninstall(cap: Capability): Promise<void> {
    const { servers } = readMcpConfig()
    const filtered = servers.filter((s) => s.name !== cap.id)
    writeMcpConfig({ servers: filtered })
    await this.disconnect(cap)
  }

  async connect(cap: Capability): Promise<void> {
    if (!this.ctx) throw new Error('Cordis context not available')

    const serverName = cap.runtime?.serverName ?? cap.id
    if (this.live.has(serverName)) return // already connected

    const { servers } = readMcpConfig()
    const cfg = servers.find((s) => s.name === serverName)
    if (!cfg) throw new Error(`MCP server config not found: ${serverName}`)

    this.statuses.set(serverName, { status: 'connecting' })

    let fiber: Fiber & PromiseLike<Fiber>
    try {
      fiber = this.ctx.plugin(mcpClient, toMcpClientConfig(cfg))
    } catch (e) {
      this.statuses.set(serverName, { status: 'failed', error: String((e as Error)?.message ?? e) })
      throw e
    }

    this.live.set(serverName, { config: cfg, fiber })

    // Track async resolution.
    fiber.then(
      () => { this.statuses.set(serverName, { status: 'running' }) },
      (e) => {
        this.live.delete(serverName)
        this.statuses.set(serverName, { status: 'failed', error: String((e as Error)?.message ?? e) })
      },
    )
  }

  async disconnect(cap: Capability): Promise<void> {
    const serverName = cap.runtime?.serverName ?? cap.id
    const entry = this.live.get(serverName)
    if (!entry) return

    this.live.delete(serverName)
    this.statuses.set(serverName, { status: 'stopped' })
    try { await entry.fiber.dispose() } catch { /* already gone */ }
  }

  async health(cap: Capability): Promise<HealthStatus> {
    const serverName = cap.runtime?.serverName ?? cap.id
    const st = this.statuses.get(serverName)

    if (!st || st.status === 'stopped') {
      return { healthy: false, message: 'Not connected', lastChecked: Date.now() }
    }
    if (st.status === 'connecting') {
      return { healthy: false, message: 'Connecting…', lastChecked: Date.now() }
    }
    if (st.status === 'failed') {
      return { healthy: false, message: st.error ?? 'Connection failed', lastChecked: Date.now() }
    }
    if (st.status === 'running') {
      return { healthy: true, lastChecked: Date.now() }
    }
    return { healthy: false, message: 'Unknown status', lastChecked: Date.now() }
  }

  /** Stop and dispose every live connection (plugin teardown). */
  async dispose(): Promise<void> {
    for (const [name, entry] of [...this.live]) {
      this.live.delete(name)
      this.statuses.set(name, { status: 'stopped' })
      try { await entry.fiber.dispose() } catch { /* already gone */ }
    }
  }
}
