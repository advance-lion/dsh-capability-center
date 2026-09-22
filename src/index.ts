/**
 * DSH Capability Center — Host-side Cordis Plugin Entry
 *
 * This plugin runs in the DSH Node.js host process. It:
 * 1. Creates the CapabilityCatalog, CapabilityRegistry, and adapters
 * 2. Registers the OfficialProvider with built-in capabilities
 * 3. Registers the same-origin HTTP API under /api/capability-center/*
 *
 * The Client half renders the sidebar entry and main panel in the browser.
 */
import { Context } from '@deepseek-ai/cordis'
import type { Capability } from './core/capability/types'
import { CapabilityCatalog } from './core/capability/catalog'
import { CapabilityRegistry } from './core/capability/registry'
import { OfficialProvider } from './core/capability/provider'
import { DefaultSkillAdapter } from './core/adapters/skill-adapter'
import { DefaultMCPAdapter } from './core/adapters/mcp-adapter'
import { DefaultCLIAdapter } from './core/adapters/cli-adapter'
import { DefaultIMRecommendationAdapter } from './core/adapters/im-recommendation-adapter'
import { registerRoutes } from './routes'

// ===== Built-in Official Capabilities =====
const builtinCapabilities: Capability[] = [
  {
    id: 'feishu',
    type: 'connector',
    name: '飞书',
    description: '连接飞书消息、文档、表格、日历、任务、邮件等全量协作能力',
    icon: '🟦',
    category: ['办公', '协作', '精选'],
    tags: ['feishu', 'lark', '消息', '文档', '表格', '日历', '任务', '邮件'],
    transport: 'cli',
    source: 'Lark CLI',
    sourcePath: 'connectors/lark/',
    sourceUrl: 'https://open.larksuite.com/document/mcp_open_tools/feishu-cli-let-ai-actually-do-your-work-in-feishu',
    status: 'available',
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
    runtime: { transport: 'cli', command: 'lark' },
    install: { requirements: { commands: ['lark'] } },
    provider: { name: 'official' },
  },
  {
    id: 'github',
    type: 'connector',
    name: 'GitHub',
    description: 'GitHub 仓库、Issue、PR 管理能力',
    icon: '🐙',
    category: ['开发', '精选'],
    tags: ['github', 'git', 'repo'],
    transport: 'mcp',
    source: 'DSH MCP Client',
    sourcePath: 'core/adapters/mcp-adapter.ts',
    sourceUrl: 'https://github.com/modelcontextprotocol/servers',
    status: 'available',
    capabilities: ['repo.search', 'issue.create', 'pr.review'],
    runtime: { transport: 'mcp', serverName: 'github-mcp' },
    provider: { name: 'official' },
  },
  {
    id: 'gmail',
    type: 'connector',
    name: 'Gmail',
    description: 'Gmail 邮件读取与发送',
    icon: '✉️',
    category: ['办公'],
    tags: ['gmail', 'email', 'mail'],
    transport: 'api',
    source: 'Gmail API',
    sourcePath: 'core/adapters/api-adapter.ts',
    sourceUrl: 'https://developers.google.com/gmail/api',
    status: 'available',
    capabilities: ['mail.send', 'mail.read', 'mail.search'],
    runtime: { transport: 'api', endpoint: 'https://gmail.googleapis.com' },
    provider: { name: 'official' },
  },
  {
    id: 'notion',
    type: 'connector',
    name: 'Notion',
    description: 'Notion 文档与数据库操作',
    icon: '📝',
    category: ['办公', '效率工具'],
    tags: ['notion', 'doc'],
    transport: 'api',
    source: 'Notion API',
    sourcePath: 'core/adapters/api-adapter.ts',
    sourceUrl: 'https://developers.notion.com/',
    status: 'available',
    capabilities: ['page.read', 'page.write', 'db.query'],
    runtime: { transport: 'api', endpoint: 'https://api.notion.com' },
    provider: { name: 'official' },
  },

]

// ===== Plugin Definition =====
export const name = 'dsh-capability-center'
export const inject = ['webServer']

export function apply(ctx: Context) {
  // --- Create adapters ---
  // SkillAdapter: query the default Agent preset's standing scope so discovery
  // includes global, user, bundled, and preset-contributed skills.
  const agentPresets = ctx.get('agentPresets') as
    | { standingKeyFor(id?: string): Promise<object> }
    | undefined
  const skillAdapter = new DefaultSkillAdapter(
    ctx.get('skills'),
    agentPresets ? () => agentPresets.standingKeyFor() : undefined,
  )
  // MCPAdapter: delegates to dsh-mcp-client plugin + reads ~/.dsh/mcp.json.
  // Uses Cordis fibers for real connect/disconnect (same as dsh-skills-mcp-manager).
  const mcpAdapter = new DefaultMCPAdapter(undefined, ctx)
  // CLIAdapter: spawns CLI subprocesses (lark, etc.) for detect/install/auth/execute.
  const cliAdapter = new DefaultCLIAdapter()
  // IMRecommendationAdapter: recommends dsh-im for IM capabilities.
  const imAdapter = new DefaultIMRecommendationAdapter(ctx)

  // --- Create catalog and register providers ---
  const catalog = new CapabilityCatalog()
  const officialProvider = new OfficialProvider()
  for (const cap of builtinCapabilities) {
    officialProvider.register(cap)
  }
  catalog.registerProvider(officialProvider)

  // IM is discovered live by CapabilityRegistry.list(), so installation state
  // stays current instead of being captured once during plugin startup.

  // --- Create registry ---
  const registry = new CapabilityRegistry(
    catalog,
    skillAdapter,
    mcpAdapter,
    cliAdapter,
    imAdapter,
  )

  // --- Register HTTP routes ---
  registerRoutes(ctx, { registry, catalog })

  // Dispose live MCP fibers when the plugin unloads.
  ctx.effect(
    () => () => { void mcpAdapter.dispose() },
    'capability-center: MCP teardown',
  )

  ctx.logger('dsh-capability-center').info('Capability Center host plugin loaded')
}
