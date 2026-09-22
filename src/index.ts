/**
 * DSH Capability Center — Host-side Cordis Plugin Entry
 *
 * This plugin runs in the DSH Node.js host process. It:
 * 1. Creates the CapabilityCatalog, CapabilityRegistry, and adapters
 * 2. Registers the OfficialProvider with built-in capabilities
 * 3. Registers HTTP routes under /api/capability-center/*
 * 4. Exposes host.call() RPC handlers for the Client half
 *
 * The Client half (src/client/index.ts) renders the UI in the browser.
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
import { Methods } from './protocol'

// ===== Built-in Official Capabilities =====
const builtinCapabilities: Capability[] = [
  {
    id: 'feishu',
    type: 'connector',
    name: '飞书',
    description: '连接飞书消息、文档与协作能力',
    icon: '🟦',
    category: ['办公', '协作', '精选'],
    tags: ['feishu', 'lark', '消息', '文档'],
    transport: 'cli',
    source: 'Lark CLI',
    sourcePath: 'connectors/lark/',
    sourceUrl: 'https://open.larksuite.com/document/mcp_open_tools/feishu-cli-let-ai-actually-do-your-work-in-feishu',
    status: 'available',
    capabilities: ['message.send', 'message.search', 'document.read'],
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
  {
    id: 'paper-research',
    type: 'skill',
    name: '论文调研',
    description: '系统性论文检索、阅读、比较和总结',
    icon: '📄',
    category: ['研究', '精选'],
    tags: ['paper', 'research', '论文'],
    source: 'DSH ctx.skills',
    sourcePath: 'ctx.skills → Skill Registry',
    sourceUrl: 'https://github.com/deepseek-ai/deepseek-harness',
    status: 'available',
    capabilities: ['文献检索', 'Related Work 分析', '技术路线比较'],
    provider: { name: 'official' },
  },
  {
    id: 'code-review',
    type: 'skill',
    name: '代码 Review',
    description: '自动化代码审查与质量分析',
    icon: '🔍',
    category: ['开发'],
    tags: ['code', 'review', '质量'],
    source: 'DSH ctx.skills',
    sourcePath: 'ctx.skills → Skill Registry',
    sourceUrl: 'https://github.com/deepseek-ai/deepseek-harness',
    status: 'available',
    capabilities: ['代码质量分析', '安全漏洞检测', '最佳实践建议'],
    provider: { name: 'official' },
  },
  {
    id: 'excel-analysis',
    type: 'skill',
    name: 'Excel 分析',
    description: 'Excel/CSV 数据分析与可视化',
    icon: '📊',
    category: ['数据'],
    tags: ['excel', 'data', '分析'],
    source: 'DSH ctx.skills',
    sourcePath: 'ctx.skills → Skill Registry',
    sourceUrl: 'https://github.com/deepseek-ai/deepseek-harness',
    status: 'available',
    capabilities: ['数据清洗', '统计分析', '图表生成'],
    provider: { name: 'official' },
  },
  {
    id: 'ppt-creation',
    type: 'skill',
    name: 'PPT 制作',
    description: '自动生成演示文稿与幻灯片',
    icon: '📑',
    category: ['内容创作'],
    tags: ['ppt', 'slides', '演示'],
    source: 'DSH ctx.skills',
    sourcePath: 'ctx.skills → Skill Registry',
    sourceUrl: 'https://github.com/deepseek-ai/deepseek-harness',
    status: 'available',
    capabilities: ['大纲生成', '幻灯片排版', '内容填充'],
    provider: { name: 'official' },
  },
  {
    id: 'github-issue',
    type: 'skill',
    name: 'GitHub Issue 分析',
    description: '自动分析 GitHub Issue 并生成报告',
    icon: '🐛',
    category: ['开发', '效率工具'],
    tags: ['github', 'issue', '分析'],
    source: 'DSH ctx.skills',
    sourcePath: 'ctx.skills → Skill Registry',
    sourceUrl: 'https://github.com/deepseek-ai/deepseek-harness',
    status: 'available',
    capabilities: ['Issue 分类', '优先级评估', '趋势分析'],
    provider: { name: 'official' },
  },
  {
    id: 'codex',
    type: 'partner',
    name: 'Codex',
    description: 'OpenAI Codex Agent — 编码与仓库分析',
    icon: '🤖',
    category: ['开发'],
    tags: ['codex', 'openai', 'agent'],
    source: 'dsh-agent-partners',
    sourcePath: '~/.dsh/plugins/dsh-agent-partners/',
    sourceUrl: 'https://github.com/openai/codex',
    status: 'available',
    capabilities: ['Coding', 'Repository Analysis', 'Terminal', 'Sub-agent'],
    provider: { name: 'official' },
  },
  {
    id: 'claude-code',
    type: 'partner',
    name: 'Claude Code',
    description: 'Anthropic Claude Code Agent',
    icon: '🧠',
    category: ['开发'],
    tags: ['claude', 'anthropic', 'agent'],
    source: 'dsh-agent-partners',
    sourcePath: '~/.dsh/plugins/dsh-agent-partners/',
    sourceUrl: 'https://github.com/anthropics/claude-code',
    status: 'available',
    capabilities: ['Coding', 'Code Analysis', 'Terminal'],
    provider: { name: 'official' },
  },
]

// ===== Plugin Definition =====
export const name = 'dsh-capability-center'
export const inject = ['dsh.webserver']

export function apply(ctx: Context) {
  // --- Create adapters ---
  const skillAdapter = new DefaultSkillAdapter(ctx.get('dsh.skills'))
  const mcpAdapter = new DefaultMCPAdapter(ctx.get('dsh.mcp'))
  const cliAdapter = new DefaultCLIAdapter()
  const imAdapter = new DefaultIMRecommendationAdapter()

  // --- Create catalog and register providers ---
  const catalog = new CapabilityCatalog()
  const officialProvider = new OfficialProvider()
  for (const cap of builtinCapabilities) {
    officialProvider.register(cap)
  }
  catalog.registerProvider(officialProvider)

  // Register IM recommendation
  imAdapter.getRecommendation().then((imCap) => {
    officialProvider.register(imCap)
  })

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

  // --- Register host.call() RPC handlers for the Client half ---
  const harness = ctx.get('dsh.harness')
  if (harness) {
    harness.handle(Methods.LIST, async () => {
      const capabilities = await registry.list()
      return { capabilities }
    })

    harness.handle(Methods.GET, async (args: any) => {
      const capability = await registry.get(args.id)
      return { capability }
    })

    harness.handle(Methods.INSTALL, async (args: any) => {
      await registry.install(args.id)
      return { ok: true }
    })

    harness.handle(Methods.UNINSTALL, async (args: any) => {
      await registry.uninstall(args.id)
      return { ok: true }
    })

    harness.handle(Methods.ENABLE, async (args: any) => {
      await registry.enable(args.id)
      return { ok: true }
    })

    harness.handle(Methods.DISABLE, async (args: any) => {
      await registry.disable(args.id)
      return { ok: true }
    })

    harness.handle(Methods.CONNECT, async (args: any) => {
      await registry.connect(args.id)
      return { ok: true }
    })

    harness.handle(Methods.DISCONNECT, async (args: any) => {
      await registry.disconnect(args.id)
      return { ok: true }
    })

    harness.handle(Methods.HEALTH, async (args: any) => {
      return await registry.health(args.id)
    })
  }

  ctx.logger('dsh-capability-center').info('Capability Center host plugin loaded')
}
