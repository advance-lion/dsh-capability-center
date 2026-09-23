/**
 * DSH Capability Center — Host-side Cordis Plugin Entry (V0.1)
 *
 * Data-driven: connector definitions are loaded from manifest data,
 * not hardcoded in source. The CLI adapter reads command templates
 * from manifests. The IM adapter detects the real dshIm service.
 *
 * Caching: detection results are persisted to
 * ~/.dsh/capability-center/cache.json and loaded on startup.
 * list() returns cached data instantly; background refresh keeps it fresh.
 *
 * The UI (client half) is unchanged — it uses the original Capability[]
 * API format. Only the backend logic has been upgraded.
 */
import { Context } from '@deepseek-ai/cordis'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Capability } from './core/capability/types'
import { CapabilityCatalog } from './core/capability/catalog'
import { CapabilityRegistry } from './core/capability/registry'
import { OfficialProvider } from './core/capability/provider'
import { DefaultSkillAdapter } from './core/adapters/skill-adapter'
import { DefaultMCPAdapter } from './core/adapters/mcp-adapter'
import { DefaultCLIAdapter, type CliConnectorManifest } from './core/adapters/cli-adapter'
import { DefaultIMRecommendationAdapter } from './core/adapters/im-recommendation-adapter'
import { registerRoutes } from './routes'

// ===== Connector manifest data (data-driven, not hardcoded) =====
const cliManifests: CliConnectorManifest[] = [
  {
    id: 'feishu',
    name: '飞书',
    binary: 'lark-cli',
    installCommand: 'npm install -g @larksuite/cli',
    authStatusCommand: 'lark-cli auth status --json',
    authLoginCommand: 'lark-cli auth login',
    authLogoutCommand: 'lark-cli auth logout',
    identityCommand: 'lark-cli user me --json',
    capabilities: [
      'message.send', 'message.search', 'message.reply',
      'chat.create', 'chat.list', 'file.upload', 'card.send',
      'document.read', 'document.create', 'document.edit',
      'sheet.read', 'sheet.write', 'sheet.create',
      'base.read', 'base.write',
      'calendar.list', 'calendar.create', 'calendar.search',
      'task.create', 'task.list', 'task.update',
      'mail.send', 'mail.read', 'mail.search',
      'contact.search', 'contact.lookup',
      'drive.upload', 'drive.download', 'drive.list',
      'wiki.read', 'wiki.search',
      'vc.list', 'vc.search',
      'approval.list', 'approval.create',
      'attendance.record',
      'okr.list', 'okr.update',
      'minutes.search', 'minutes.read',
    ],
    sourceUrl: 'https://open.larksuite.com/document/mcp_open_tools/feishu-cli-let-ai-actually-do-your-work-in-feishu',
    icon: '🟦',
    category: ['办公', '协作', '精选'],
    tags: ['feishu', 'lark', '消息', '文档', '表格', '日历', '任务', '邮件'],
    description: '连接飞书消息、文档、表格、日历、任务、邮件等全量协作能力',
  },
  {
    id: 'github',
    name: 'GitHub',
    binary: 'gh',
    installCommand: 'npm install -g @github/cli',
    authStatusCommand: 'gh auth status --json',
    authLoginCommand: 'gh auth login',
    authLogoutCommand: 'gh auth logout',
    capabilities: ['repo.search', 'issue.create', 'pr.review'],
    sourceUrl: 'https://cli.github.com',
    icon: '🐙',
    category: ['开发', '精选'],
    tags: ['github', 'git', 'repo'],
    description: 'GitHub 仓库、Issue、PR 管理能力',
  },
]

// ===== Plugin Definition =====
export const name = 'dsh-capability-center'
export const inject = ['webServer']

export function apply(ctx: Context) {
  // --- Cache file path ---
  const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh')
  const cacheFile = join(dshHome, 'capability-center', 'cache.json')

  // --- Create adapters ---
  const agentPresets = ctx.get('agentPresets') as
    | { standingKeyFor(id?: string): Promise<object> }
    | undefined
  const skillAdapter = new DefaultSkillAdapter(
    ctx.get('skills'),
    agentPresets ? () => agentPresets.standingKeyFor() : undefined,
  )
  const mcpAdapter = new DefaultMCPAdapter(undefined, ctx)
  const cliAdapter = new DefaultCLIAdapter(ctx)
  cliAdapter.registerManifests(cliManifests)
  const imAdapter = new DefaultIMRecommendationAdapter(ctx)

  // --- Create catalog and register providers ---
  const catalog = new CapabilityCatalog()
  const officialProvider = new OfficialProvider()

  // Build static capabilities from manifest data (not hardcoded)
  const builtinCapabilities: Capability[] = cliManifests.map((m) => ({
    id: m.id,
    type: 'connector' as const,
    name: m.name,
    description: m.description,
    icon: m.icon,
    category: m.category,
    tags: m.tags,
    transport: 'cli' as const,
    source: m.name,
    sourceUrl: m.sourceUrl,
    status: 'available' as const,
    capabilities: m.capabilities,
    runtime: { transport: 'cli' as const, command: m.binary },
    install: { requirements: { commands: [m.binary] } },
    provider: { name: 'official' },
  }))
  for (const cap of builtinCapabilities) {
    officialProvider.register(cap)
  }
  catalog.registerProvider(officialProvider)

  // --- Create registry with cache ---
  const registry = new CapabilityRegistry(
    catalog,
    skillAdapter,
    mcpAdapter,
    cliAdapter,
    imAdapter,
    cacheFile,
  )

  // --- Load cache on startup, then trigger background refresh ---
  registry.loadCache().then(() => {
    // First refresh in background — populates real status (CLI auth, skills, MCP)
    registry.refreshInBackground().catch(() => {})
  }).catch(() => {})

  // --- Register HTTP routes ---
  registerRoutes(ctx, { registry, catalog })

  // Dispose live MCP fibers when the plugin unloads.
  ctx.effect(
    () => () => { void mcpAdapter.dispose() },
    'capability-center: MCP teardown',
  )

  ctx.logger('dsh-capability-center').info('Capability Center host plugin loaded (V0.1 cached)')
}
