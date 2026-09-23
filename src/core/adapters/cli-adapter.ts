/**
 * CLI Adapter (V0.1) — data-driven, no hardcoded platform commands.
 *
 * The old version had 190 lines of hardcoded Feishu command mappings.
 * This version reads command templates from connector manifests.
 * The adapter is generic: it doesn't know what app it's connecting to.
 */

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
  const lower = rawStatus.toLowerCase()
  if (lower.includes('logged_in') || lower.includes('ready') || lower.includes('connected') || lower.includes('active')) return 'connected'
  if (lower.includes('needs_refresh') || lower.includes('expired') || lower.includes('reauth') || lower.includes('needs_auth')) return 'expired'
  if (lower.includes('logged_out') || lower.includes('disconnected') || lower.includes('offline')) return 'available'
  if (lower.includes('error') || lower.includes('failed')) return 'error'
  return 'available'
}

export class DefaultCLIAdapter implements CLIAdapter {
  private manifests: CliConnectorManifest[] = []

  constructor(private ctx?: Context) {}

  registerManifests(manifests: CliConnectorManifest[]): void {
    this.manifests = manifests
  }

  async discover(): Promise<Capability[]> {
    const results: Capability[] = []
    for (const manifest of this.manifests) {
      const detected = await this.detectBinary(manifest.binary)
      const status = detected.found ? await this.checkAuthStatus(manifest) : 'available'
      results.push({
        id: manifest.id, type: 'connector', name: manifest.name,
        description: manifest.description, icon: manifest.icon,
        category: manifest.category, tags: manifest.tags,
        transport: 'cli', source: manifest.name, sourceUrl: manifest.sourceUrl,
        status, capabilities: manifest.capabilities,
        runtime: { transport: 'cli', command: manifest.binary },
        install: { requirements: { commands: [manifest.binary] } },
        provider: { name: 'official' },
      })
    }
    return results
  }

  async install(cap: Capability): Promise<void> {
    const manifest = this.findManifest(cap.id)
    if (!manifest) throw new Error(`Unknown connector: ${cap.id}`)
    const shell = this.ctx?.get('shell') as any
    if (!shell) throw new Error('Shell service not available')
    const spec = await shell.resolve({ command: manifest.installCommand, timeoutMs: 120000, stdoutMaxBytes: 1048576 })
    await shell.run(spec)
  }

  async uninstall(cap: Capability): Promise<void> {
    const manifest = this.findManifest(cap.id)
    if (!manifest) return
    const shell = this.ctx?.get('shell') as any
    if (!shell) return
    const pkgName = manifest.installCommand.match(/install -g (\S+)/)?.[1]
    if (pkgName) {
      const spec = await shell.resolve({ command: `npm uninstall -g ${pkgName}`, timeoutMs: 60000, stdoutMaxBytes: 1048576 })
      await shell.run(spec)
    }
  }

  async connect(cap: Capability): Promise<void> {
    const manifest = this.findManifest(cap.id)
    if (!manifest) throw new Error(`Unknown connector: ${cap.id}`)
    throw new Error(`请在终端中运行: ${manifest.authLoginCommand}`)
  }

  async disconnect(cap: Capability): Promise<void> {
    const manifest = this.findManifest(cap.id)
    if (!manifest || !manifest.authLogoutCommand) return
    const shell = this.ctx?.get('shell') as any
    if (!shell) return
    const spec = await shell.resolve({ command: manifest.authLogoutCommand, timeoutMs: 15000, stdoutMaxBytes: 65536 })
    await shell.run(spec)
  }

  async health(cap: Capability): Promise<HealthStatus> {
    const manifest = this.findManifest(cap.id)
    if (!manifest) return { healthy: false, message: 'Unknown connector' }
    const detected = await this.detectBinary(manifest.binary)
    if (!detected.found) return { healthy: false, message: `${manifest.binary} not installed`, lastChecked: Date.now() }
    const status = await this.checkAuthStatus(manifest)
    if (status === 'connected') return { healthy: true, lastChecked: Date.now() }
    if (status === 'expired') return { healthy: false, message: 'Authentication expired', lastChecked: Date.now() }
    return { healthy: false, message: 'Not authenticated', lastChecked: Date.now() }
  }

  private findManifest(id: string): CliConnectorManifest | undefined {
    return this.manifests.find((m) => m.id === id)
  }

  private async detectBinary(binary: string): Promise<DetectionResult> {
    const shell = this.ctx?.get('shell') as any
    if (!shell?.resolve || !shell.run) return { found: false }
    const subprocess = this.ctx?.get('subprocess') as any
    if (subprocess?.resolveExecutable) {
      try {
        const path = await subprocess.resolveExecutable(binary)
        if (path) return { found: true, path }
      } catch { /* fall through */ }
    }
    const isWindows = process.platform === 'win32'
    const cmd = isWindows ? `where ${binary}` : `which ${binary}`
    try {
      const spec = await shell.resolve({ command: cmd, timeoutMs: 5000, stdoutMaxBytes: 4096 })
      const result = await shell.run(spec)
      if (result.exitCode === 0 && result.stdout?.text?.trim()) {
        return { found: true, path: result.stdout.text.trim().split('\n')[0] }
      }
    } catch { /* not found */ }
    return { found: false }
  }

  private async checkAuthStatus(manifest: CliConnectorManifest): Promise<Capability['status']> {
    const shell = this.ctx?.get('shell') as any
    if (!shell?.resolve || !shell.run) return 'available'
    try {
      const spec = await shell.resolve({ command: manifest.authStatusCommand, timeoutMs: 15000, stdoutMaxBytes: 524288 })
      const result = await shell.run(spec)
      const text = result.stdout?.text || ''
      let json: any = null
      try { json = JSON.parse(text) } catch { /* not JSON */ }
      if (json) {
        const status = json.status || json.auth_status || ''
        return normalizeStatus(status)
      }
      return normalizeStatus(text)
    } catch {
      return 'error'
    }
  }
}
