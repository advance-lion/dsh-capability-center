/**
 * CLIAdapter — bridges the unified Capability model to external CLI tools.
 *
 * This is a critical layer: many real-world services (Feishu, GitHub, etc.)
 * have mature CLIs but no MCP server. The CLIAdapter:
 * 1. Detects whether the CLI is installed
 * 2. Installs the CLI if missing
 * 3. Authenticates (OAuth, token, etc.)
 * 4. Executes semantic capabilities by translating to CLI commands
 *
 * The Agent sees `feishu.message.send`, not `lark message send`.
 */
import type {
  Capability,
  DetectionResult,
  HealthStatus,
} from '../capability/types'

export interface CLIAdapter {
  /** Detect whether the CLI tool is installed and its version. */
  detect(cap: Capability): Promise<DetectionResult>

  /** Install the CLI tool if missing. */
  install?(cap: Capability): Promise<void>

  /** Uninstall the CLI tool. */
  uninstall?(cap: Capability): Promise<void>

  /** Authenticate with the external service. */
  authenticate?(cap: Capability): Promise<void>

  /** Health check — verify the CLI is working and authenticated. */
  health(cap: Capability): Promise<HealthStatus>

  /** Connect — verify auth and mark as connected. */
  connect(cap: Capability): Promise<void>

  /** Disconnect — clear auth state. */
  disconnect(cap: Capability): Promise<void>

  /** Execute a semantic capability by translating to a CLI command. */
  execute(cap: Capability, capability: string, args: unknown): Promise<unknown>
}

/**
 * Concrete CLIAdapter that spawns CLI subprocesses.
 * Uses Node.js child_process under the hood (injected at apply time).
 */
export class DefaultCLIAdapter implements CLIAdapter {
  constructor(private exec?: (cmd: string, args: string[]) => Promise<string>) {}

  async detect(cap: Capability): Promise<DetectionResult> {
    const command = cap.runtime?.command
    if (!command) return { found: false }
    // TODO: check if command exists in PATH
    return { found: false }
  }

  async install(cap: Capability): Promise<void> {
    // TODO: run install steps from cap.install.steps
  }

  async authenticate(cap: Capability): Promise<void> {
    // TODO: run `lark auth login` or equivalent
  }

  async health(cap: Capability): Promise<HealthStatus> {
    const detection = await this.detect(cap)
    if (!detection.found) {
      return { healthy: false, message: `${cap.runtime?.command} not found` }
    }
    // TODO: run a health check command
    return { healthy: true, lastChecked: Date.now() }
  }

  async connect(cap: Capability): Promise<void> {
    const health = await this.health(cap)
    if (!health.healthy) throw new Error(health.message)
  }

  async disconnect(cap: Capability): Promise<void> {
    // TODO: clear auth state
  }

  async execute(
    cap: Capability,
    capability: string,
    args: unknown,
  ): Promise<unknown> {
    // TODO: translate semantic capability to CLI command
    // e.g. feishu.message.send → lark message send ...
    throw new Error('Not implemented')
  }
}
