/**
 * CLIAdapter — bridges the unified Capability model to external CLI tools.
 *
 * This is a critical layer: many real-world services (Feishu, GitHub, etc.)
 * have mature CLIs but no MCP server. The CLIAdapter:
 * 1. Detects whether the CLI is installed (checks PATH)
 * 2. Installs the CLI if missing (npm install -g, brew install, etc.)
 * 3. Authenticates (OAuth, token, etc.)
 * 4. Executes semantic capabilities by translating to CLI commands
 *
 * The Agent sees `feishu.message.send`, not `lark message send`.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { platform } from 'node:os'
import type {
  Capability,
  DetectionResult,
  HealthStatus,
} from '../capability/types'

const execFileAsync = promisify(execFile)
const isWindows = platform() === 'win32'

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
 * Capability → CLI command mapping table.
 * Maps semantic capability IDs to CLI subcommands.
 *
 * The Agent sees `feishu.message.send`, not `lark message send`.
 * This table is the translation layer that makes the Connector a
 * semantic capability layer, not a CLI wrapper.
 */
const CAPABILITY_MAP: Record<string, { command: string; args: (input: any) => string[] }> = {
  // ── 消息 IM ──────────────────────────────────────────────
  'feishu.message.send': {
    command: 'im',
    args: (input) => ['send', '--user', input.user ?? '', '--text', input.text ?? ''],
  },
  'feishu.message.search': {
    command: 'im',
    args: (input) => ['search', '--query', input.query ?? ''],
  },
  'feishu.message.reply': {
    command: 'im',
    args: (input) => ['reply', '--message-id', input.messageId ?? '', '--text', input.text ?? ''],
  },
  'feishu.chat.create': {
    command: 'im',
    args: (input) => ['chat', 'create', '--name', input.name ?? ''],
  },
  'feishu.chat.list': {
    command: 'im',
    args: () => ['chat', 'list'],
  },
  'feishu.file.upload': {
    command: 'im',
    args: (input) => ['file', 'upload', '--path', input.filePath ?? ''],
  },
  'feishu.card.send': {
    command: 'im',
    args: (input) => ['card', 'send', '--user', input.user ?? '', '--card', input.cardJson ?? ''],
  },

  // ── 云文档 Doc ───────────────────────────────────────────
  'feishu.document.read': {
    command: 'doc',
    args: (input) => ['read', input.docId ?? ''],
  },
  'feishu.document.create': {
    command: 'doc',
    args: (input) => ['create', '--title', input.title ?? '', '--content', input.content ?? ''],
  },
  'feishu.document.edit': {
    command: 'doc',
    args: (input) => ['edit', input.docId ?? '', '--content', input.content ?? ''],
  },

  // ── 电子表格 Sheets ──────────────────────────────────────
  'feishu.sheet.read': {
    command: 'sheets',
    args: (input) => ['read', input.sheetId ?? '', '--range', input.range ?? ''],
  },
  'feishu.sheet.write': {
    command: 'sheets',
    args: (input) => ['write', input.sheetId ?? '', '--range', input.range ?? '', '--value', input.value ?? ''],
  },
  'feishu.sheet.create': {
    command: 'sheets',
    args: (input) => ['create', '--title', input.title ?? ''],
  },

  // ── 多维表格 Base ────────────────────────────────────────
  'feishu.base.read': {
    command: 'base',
    args: (input) => ['read', input.baseId ?? '', '--table', input.tableId ?? ''],
  },
  'feishu.base.write': {
    command: 'base',
    args: (input) => ['write', input.baseId ?? '', '--table', input.tableId ?? '', '--record', input.recordJson ?? ''],
  },

  // ── 日历 Calendar ────────────────────────────────────────
  'feishu.calendar.list': {
    command: 'calendar',
    args: () => ['list'],
  },
  'feishu.calendar.create': {
    command: 'calendar',
    args: (input) => ['create', '--title', input.title ?? '', '--start', input.start ?? '', '--end', input.end ?? ''],
  },
  'feishu.calendar.search': {
    command: 'calendar',
    args: (input) => ['search', '--query', input.query ?? ''],
  },

  // ── 任务 Task ────────────────────────────────────────────
  'feishu.task.create': {
    command: 'task',
    args: (input) => ['create', '--title', input.title ?? ''],
  },
  'feishu.task.list': {
    command: 'task',
    args: () => ['list'],
  },
  'feishu.task.update': {
    command: 'task',
    args: (input) => ['update', input.taskId ?? '', '--status', input.status ?? ''],
  },

  // ── 邮件 Mail ────────────────────────────────────────────
  'feishu.mail.send': {
    command: 'mail',
    args: (input) => ['send', '--to', input.to ?? '', '--subject', input.subject ?? '', '--body', input.body ?? ''],
  },
  'feishu.mail.read': {
    command: 'mail',
    args: (input) => ['read', input.mailId ?? ''],
  },
  'feishu.mail.search': {
    command: 'mail',
    args: (input) => ['search', '--query', input.query ?? ''],
  },

  // ── 通讯录 Contact ───────────────────────────────────────
  'feishu.contact.search': {
    command: 'contact',
    args: (input) => ['search', '--query', input.query ?? ''],
  },
  'feishu.contact.lookup': {
    command: 'contact',
    args: (input) => ['lookup', '--open-id', input.openId ?? ''],
  },

  // ── 云空间 Drive ─────────────────────────────────────────
  'feishu.drive.upload': {
    command: 'drive',
    args: (input) => ['upload', '--path', input.filePath ?? '', '--folder', input.folderId ?? ''],
  },
  'feishu.drive.download': {
    command: 'drive',
    args: (input) => ['download', input.fileId ?? '', '--to', input.savePath ?? ''],
  },
  'feishu.drive.list': {
    command: 'drive',
    args: () => ['list'],
  },

  // ── 知识库 Wiki ──────────────────────────────────────────
  'feishu.wiki.read': {
    command: 'wiki',
    args: (input) => ['read', input.nodeId ?? ''],
  },
  'feishu.wiki.search': {
    command: 'wiki',
    args: (input) => ['search', '--query', input.query ?? ''],
  },

  // ── 视频会议 VC ──────────────────────────────────────────
  'feishu.vc.list': {
    command: 'vc',
    args: () => ['list'],
  },
  'feishu.vc.search': {
    command: 'vc',
    args: (input) => ['search', '--query', input.query ?? ''],
  },

  // ── 审批 Approval ────────────────────────────────────────
  'feishu.approval.list': {
    command: 'approval',
    args: () => ['list'],
  },
  'feishu.approval.create': {
    command: 'approval',
    args: (input) => ['create', '--code', input.approvalCode ?? ''],
  },

  // ── 考勤 Attendance ─────────────────────────────────────
  'feishu.attendance.record': {
    command: 'attendance',
    args: (input) => ['record', '--user', input.user ?? '', '--date', input.date ?? ''],
  },

  // ── OKR ──────────────────────────────────────────────────
  'feishu.okr.list': {
    command: 'okr',
    args: () => ['list'],
  },
  'feishu.okr.update': {
    command: 'okr',
    args: (input) => ['update', input.okrId ?? '', '--progress', input.progress ?? ''],
  },

  // ── 妙记 Minutes ─────────────────────────────────────────
  'feishu.minutes.search': {
    command: 'minutes',
    args: (input) => ['search', '--query', input.query ?? ''],
  },
  'feishu.minutes.read': {
    command: 'minutes',
    args: (input) => ['read', input.minuteId ?? ''],
  },
}

/**
 * Concrete CLIAdapter that spawns CLI subprocesses.
 * Uses Node.js child_process.execFile for safe, shell-injection-free execution.
 */
export class DefaultCLIAdapter implements CLIAdapter {
  /** Track connected (authenticated) connectors. */
  private connectedSet = new Set<string>()

  /**
   * @param execFn - Optional override for command execution (testing).
   * If not provided, uses child_process.execFile.
   */
  constructor(private execFn?: (cmd: string, args: string[]) => Promise<string>) {}

  /** Check if a command exists in PATH. */
  private async commandExists(command: string): Promise<boolean> {
    const checker = isWindows ? 'where' : 'which'
    try {
      await execFileAsync(checker, [command])
      return true
    } catch {
      return false
    }
  }

  async detect(cap: Capability): Promise<DetectionResult> {
    const command = cap.runtime?.command
    if (!command) return { found: false }

    const found = await this.commandExists(command)
    if (!found) return { found: false }

    // Try to get version.
    try {
      const { stdout } = await execFileAsync(command, ['--version'])
      const version = stdout.trim().split('\n')[0]
      return { found: true, version }
    } catch {
      // Command exists but --version failed — still found.
      return { found: true }
    }
  }

  async install(cap: Capability): Promise<void> {
    const command = cap.runtime?.command
    if (!command) throw new Error('No command specified')

    // Check if already installed.
    const detection = await this.detect(cap)
    if (detection.found) return

    // Install via npm (most DSH-related CLIs are npm packages).
    // This is a heuristic; specific connectors can override.
    const packageName = cap.install?.requirements?.packages?.[0]
      ?? `@larksuiteoapi/${command}`
    await execFileAsync('npm', ['install', '-g', packageName])
  }

  async uninstall(cap: Capability): Promise<void> {
    const command = cap.runtime?.command
    if (!command) return

    const packageName = cap.install?.requirements?.packages?.[0]
      ?? `@larksuiteoapi/${command}`
    await execFileAsync('npm', ['uninstall', '-g', packageName])
    this.connectedSet.delete(cap.id)
  }

  async authenticate(cap: Capability): Promise<void> {
    const command = cap.runtime?.command
    if (!command) throw new Error('No command specified')

    // Run `lark auth login` (or equivalent).
    // This is typically an interactive flow — the CLI opens a browser for OAuth.
    // We spawn it with stdio: 'inherit' so the user can interact.
    const { spawn } = await import('node:child_process')
    const child = spawn(command, ['auth', 'login'], {
      stdio: 'inherit',
      shell: isWindows,
    })

    await new Promise<void>((resolve, reject) => {
      child.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`Auth failed with exit code ${code}`))
      })
      child.on('error', reject)
    })
  }

  async health(cap: Capability): Promise<HealthStatus> {
    const command = cap.runtime?.command
    if (!command) return { healthy: false, message: 'No command specified' }

    // 1. Check if CLI is installed.
    const detection = await this.detect(cap)
    if (!detection.found) {
      return {
        healthy: false,
        message: `${command} not found in PATH`,
        lastChecked: Date.now(),
      }
    }

    // 2. Check auth status.
    try {
      const { stdout } = await execFileAsync(command, ['auth', 'status'])
      const authed = !stdout.toLowerCase().includes('not logged in')
        && !stdout.toLowerCase().includes('未登录')
      return {
        healthy: authed,
        message: authed ? undefined : 'Not authenticated',
        lastChecked: Date.now(),
      }
    } catch {
      return {
        healthy: false,
        message: 'Auth check failed',
        lastChecked: Date.now(),
      }
    }
  }

  async connect(cap: Capability): Promise<void> {
    const health = await this.health(cap)
    if (!health.healthy) {
      throw new Error(health.message ?? 'Health check failed')
    }
    this.connectedSet.add(cap.id)
  }

  async disconnect(cap: Capability): Promise<void> {
    const command = cap.runtime?.command
    if (command) {
      try {
        await execFileAsync(command, ['auth', 'logout'])
      } catch {
        // Ignore logout errors.
      }
    }
    this.connectedSet.delete(cap.id)
  }

  async execute(
    cap: Capability,
    capability: string,
    args: unknown,
  ): Promise<unknown> {
    const command = cap.runtime?.command
    if (!command) throw new Error('No command specified')

    // Look up the capability mapping.
    const mapping = CAPABILITY_MAP[capability]
    if (!mapping) {
      throw new Error(`Unknown capability: ${capability}`)
    }

    // Build the full CLI args.
    const cliArgs = mapping.args(args)

    // Execute the command.
    if (this.execFn) {
      const output = await this.execFn(command, [mapping.command, ...cliArgs])
      return JSON.parse(output)
    }

    const { stdout } = await execFileAsync(command, [
      mapping.command,
      ...cliArgs,
    ])
    try {
      return JSON.parse(stdout)
    } catch {
      return stdout.trim()
    }
  }
}
