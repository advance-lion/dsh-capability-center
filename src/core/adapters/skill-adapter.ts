/**
 * SkillAdapter — projects DSH's layered Skill registry into Capability cards.
 *
 * Skills are scoped: a Host-root `skills.list()` only sees global providers.
 * Capability Center resolves the default Agent preset's standing scope and
 * passes it to `list({ scope })`, which merges global and preset layers.
 */
import type { SkillSummary } from '@deepseek-ai/dsh-skill'
import type { Capability } from '../capability/types'

export interface SkillAdapter {
  discover(): Promise<Capability[]>
  enable(cap: Capability): Promise<void>
  disable(cap: Capability): Promise<void>
  install(cap: Capability): Promise<void>
  uninstall(cap: Capability): Promise<void>
}

type ScopeResolver = () => Promise<object | undefined>

const LARK_SOURCE_URL =
  'https://open.larksuite.com/document/mcp_open_tools/feishu-cli-let-ai-actually-do-your-work-in-feishu'
const DSH_SOURCE_URL = 'https://github.com/deepseek-ai/deepseek-harness'

/** Infer a stable user-facing category from canonical Skill metadata. */
export function classifySkill(skill: SkillSummary): string[] {
  const text = [skill.name, skill.description, skill.whenToUse, skill.provider, skill.source]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  const categories: string[] = []
  const add = (category: string) => {
    if (!categories.includes(category)) categories.push(category)
  }

  if (/lark|feishu|飞书|mail|email|calendar|contact|task|doc|wiki|office/.test(text)) add('办公')
  if (/code|coding|github|git|plugin|cordis|dsh|developer|architecture|frontend|backend|api/.test(text)) add('开发')
  if (/research|paper|论文|调研|academic|literature|search/.test(text)) add('研究')
  if (/sheet|excel|csv|data|analysis|analytics|chart|统计|数据/.test(text)) add('数据')
  if (/image|design|slide|ppt|video|audio|content|creative|markdown|画板|创作/.test(text)) add('内容创作')
  if (/workflow|automation|productivity|utility|tool|效率|自动化/.test(text)) add('效率工具')
  if (/featured|recommended|精选/.test(text)) add('精选')

  if (categories.length === 0) add('其他')
  return categories
}

function skillIcon(skill: SkillSummary, categories: string[]): string {
  const name = skill.name.toLowerCase()
  if (name.startsWith('lark-') || /feishu|飞书/.test(name)) return '🟦'
  if (categories.includes('内容创作')) return '🎨'
  if (categories.includes('数据')) return '📊'
  if (categories.includes('研究')) return '📄'
  if (categories.includes('开发')) return '🧩'
  return '⚡'
}

function sourcePath(skill: SkillSummary): string {
  const base = skill.resourceBase
  if (base?.kind === 'directory') return base.path
  if (base?.kind === 'url') return base.url
  if (base?.kind === 'opaque') return base.description
  return `ctx.skills · ${skill.source}`
}

function sourceUrl(skill: SkillSummary): string {
  if (skill.resourceBase?.kind === 'url') return skill.resourceBase.url
  if (skill.name.toLowerCase().startsWith('lark-')) return LARK_SOURCE_URL
  return DSH_SOURCE_URL
}

function skillToCapability(skill: SkillSummary): Capability {
  const category = classifySkill(skill)
  return {
    id: skill.name,
    type: 'skill',
    name: skill.name,
    description: skill.description || skill.whenToUse || 'DSH Skill',
    icon: skillIcon(skill, category),
    category,
    tags: [skill.name, skill.provider, skill.source, ...category],
    source: `${skill.provider} · ${skill.source}`,
    sourcePath: sourcePath(skill),
    sourceUrl: sourceUrl(skill),
    status: skill.invocation.userInvocable ? 'installed' : 'disabled',
    capabilities: skill.whenToUse ? [skill.whenToUse] : [],
    provider: { name: skill.provider },
  }
}

export class DefaultSkillAdapter implements SkillAdapter {
  private disabledSet = new Set<string>()

  constructor(
    private skillsService?: any,
    private resolveScope?: ScopeResolver,
  ) {}

  async discover(): Promise<Capability[]> {
    if (!this.skillsService?.list) return []

    let scope: object | undefined
    try {
      scope = await this.resolveScope?.()
    } catch {
      // Fall back to the global layer if the configured preset cannot mount.
    }

    const summaries: SkillSummary[] = await this.skillsService.list(
      scope ? { scope } : {},
    )
    const seen = new Set<string>()
    const result: Capability[] = []
    for (const summary of summaries) {
      if (!summary?.name || seen.has(summary.name)) continue
      seen.add(summary.name)
      const cap = skillToCapability(summary)
      if (this.disabledSet.has(summary.name)) cap.status = 'disabled'
      result.push(cap)
    }
    return result
  }

  async enable(cap: Capability): Promise<void> {
    this.disabledSet.delete(cap.id)
  }

  async disable(cap: Capability): Promise<void> {
    this.disabledSet.add(cap.id)
  }

  async install(cap: Capability): Promise<void> {
    if (!this.skillsService?.register) {
      throw new Error('ctx.skills.register is not available')
    }
    this.skillsService.register({
      name: cap.id,
      description: cap.description ?? '',
      content: `# ${cap.name}\n\n${cap.description ?? ''}`,
    })
  }

  async uninstall(cap: Capability): Promise<void> {
    this.disabledSet.delete(cap.id)
  }
}
