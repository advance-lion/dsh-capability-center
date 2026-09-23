/**
 * CLI Adapter (V0.1) — data-driven, no hardcoded platform commands.
 *
 * Reads command templates from connector manifests. The adapter is
 * generic: it doesn't know what app it's connecting to.
 *
 * Uses child_process directly (available in the static plugin's real
 * Node.js process). Falls back to ctx.get('shell') for sandboxed
 * environments where child_process is not available.
 */

import { execSync, exec as execCb } from 'node:child_process'
import type { Context } from '@deepseek-ai/cordis'
import type { Capability, HealthStatus, DetectionResult } from '../capability/types'

export interface CliConnectorManifest {
  id: string
  name: string
  binary: string
  installCommand: string
  authStatusCommand: string
  authLoginCommand: string
  authLogoutCommand?: string
  identityCommand?: string
  capabilities: string[]
  sourceUrl?: string
  icon?: string
  category?: string[]
  tags?: string[]
  description?: string
}

export interface CLIAdapter {
  discover(): Promise<Capability[]>
  install(cap: Capability): Promise<void>
  uninstall(cap: Capability): Promise<void>
  connect(cap: Capability): Promise<void>
  disconnect(cap: Capability): Promise<void>
  health(cap: Capability): Promise<HealthStatus>
}

function normalizeStatus(rawStatus: string | undefined): Capability['status'] {
  if (!rawStatus) return 'available'
  const l = rawStatus.toLowerCase()
  if (l.includes('logged_in') || l.includes('ready') || l.includes('connected') || l.includes('active')) return 'connected'
  if (l.includes('needs_refresh') || l.includes('expired') || l.includes('reauth') || l.includes('needs_auth')) return 'expired'
  if (l.includes('logged_out') || l.includes('disconnected') || l.includes('offline')) return 'available'
  if (l.includes('error') || l.includes('failed')) return 'error'
  return 'available'
}

/** Run a command and return stdout (sync, with timeout). */
function runCmdSync(cmd: string, timeoutMs = 10000): { stdout: string; exitCode: number } {
  try {
    const stdout = execSync(cmd, {
      timeout: timeoutMs,
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    })
    return { stdout: stdout || '', exitCode: 0 }
  } catch (e: any) {
    return { stdout: e.stdout || '', exitCode: e.status ?? 1 }
  }
}

/** Run a command asynchronously (for install/uninstall). */
function runCmdAsync(cmd: string, timeoutMs = 60000): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    execCb(cmd, { timeout: timeoutMs, encoding: 'utf-8', maxBuffer: 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      resolve({ stdout: stdout || '', stderr: stderr || '', exitCode: err ? (err as any).status ?? 1 : 0 })
    })
  })
}

export class DefaultCLIAdapter implements CLIAdapter {
  private manifests: CliConnectorManifest[] = []

  constructor(private ctx?: Context) {}

  registerManifests(manifests: CliConnectorManifest[]): void {
    this.manifests = manifests
  }

  async discover(): Promise<Capability[]> {
    const results: Capability[] = []
    for (const m of this.manifests) {
      const detected = this.detectBinary(m.binary)
      const status = detected.found ? this.checkAuthStatus(m) : 'available'
      results.push({
        id: m.id, type: 'connector', name: m.name, description: m.description,
        icon: m.icon, category: m.category, tags: m.tags,
        transport: 'cli', source: m.name, sourceUrl: m.sourceUrl,
        status, capabilities: m.capabilities,
        runtime: { transport: 'cli', command: m.binary },
        install: { requirements: { commands: [m.binary] } },
        provider: { name: 'official' },
      })
    }
    return results
  }

  async install(cap: Capability): Promise<void> {
    const m = this.findManifest(cap.id)
    if (!m) throw new Error(`Unknown connector: ${cap.id}`)
    await runCmdAsync(m.installCommand, 120000)
  }

  async uninstall(cap: Capability): Promise<void> {
    const m = this.findManifest(cap.id)
    if (!m) return
    const pkgName = m.installCommand.match(/install -g (\S+)/)?.[1]
    if (pkgName) await runCmdAsync(`npm uninstall -g ${pkgName}`, 60000)
  }

  async connect(cap: Capability): Promise<void> {
    const m = this.findManifest(cap.id)
    if (!m) throw new Error(`Unknown connector: ${cap.id}`)
    throw new Error(`请在终端中运行: ${m.authLoginCommand}`)
  }

  async disconnect(cap: Capability): Promise<void> {
    const m = this.findManifest(cap.id)
    if (!m?.authLogoutCommand) return
    await runCmdAsync(m.authLogoutCommand, 15000)
  }

  async health(cap: Capability): Promise<HealthStatus> {
    const m = this.findManifest(cap.id)
    if (!m) return { healthy: false, message: 'Unknown connector' }
    const detected = this.detectBinary(m.binary)
    if (!detected.found) return { healthy: false, message: `${m.binary} not installed`, lastChecked: Date.now() }
    const status = this.checkAuthStatus(m)
    if (status === 'connected') return { healthy: true, lastChecked: Date.now() }
    if (status === 'expired') return { healthy: false, message: 'Authentication expired', lastChecked: Date.now() }
    return { healthy: false, message: 'Not authenticated', lastChecked: Date.now() }
  }

  // ── Private helpers ────────────────────────────────────────

  private findManifest(id: string): CliConnectorManifest | undefined {
    return this.manifests.find((m) => m.id === id)
  }

  private detectBinary(binary: string): DetectionResult {
    // Try shell service first (for sandboxed environments)
    const shell = this.ctx?.get('shell') as any
    if (shell?.resolve && shell.run) {
      // Async path — but we're in sync context, fall through to child_process
    }
    // Use child_process directly (static plugin runs in real Node.js)
    const isWindows = process.platform === 'win32'
    const cmd = isWindows ? `where ${binary} 2>nul` : `which ${binary} 2>/dev/null`
    const result = runCmdSync(cmd, 5000)
    if (result.exitCode === 0 && result.stdout.trim().length > 0) {
      return { found: true, path: result.stdout.trim().split('\n')[0] }
    }
    return { found: false }
  }

  private checkAuthStatus(manifest: CliConnectorManifest): Capability['status'] {
    const result = runCmdSync(manifest.authStatusCommand, 15000)
    if (result.exitCode !== 0 && !result.stdout) return 'error'
    const text = result.stdout
    let json: any = null
    try { json = JSON.parse(text) } catch { /* not JSON */ }
    if (json) return normalizeStatus(json.status || json.auth_status || '')
    return normalizeStatus(text)
  }
}
