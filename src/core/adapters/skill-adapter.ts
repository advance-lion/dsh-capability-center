/**
 * SkillAdapter — bridges the unified Capability model to DSH's native
 * ctx.skills system.
 *
 * DSH already has a complete Skill runtime:
 *   Provider → ctx.skills → Registry → Catalog → skill Tool
 *
 * This adapter does NOT re-implement the Skill runtime. It only:
 * 1. Reads skill metadata from ctx.skills.list() for display in Capability Center
 * 2. Maps SkillSummary → Capability
 * 3. Translates enable/disable to local state tracking (DSH skills are
 *    provider-discovered; there is no runtime enable/disable toggle, but
 *    we track user preference locally)
 */
import type { Capability } from '../capability/types'
import type { SkillSummary } from '@deepseek-ai/dsh-skill'

export interface SkillAdapter {
  /** Discover skills from ctx.skills and convert to Capability objects. */
  discover(): Promise<Capability[]>

  /** Enable a skill in ctx.skills. */
  enable(cap: Capability): Promise<void>

  /** Disable a skill in ctx.skills. */
  disable(cap: Capability): Promise<void>

  /** Install a skill (e.g. from a remote provider). */
  install(cap: Capability): Promise<void>

  /** Uninstall a skill. */
  uninstall(cap: Capability): Promise<void>
}

/** Map a DSH SkillSummary to a Capability object. */
function skillToCapability(skill: SkillSummary): Capability {
  return {
    id: skill.name,
    type: 'skill',
    name: skill.name,
    description: skill.description,
    icon: '📄',
    category: ['研究'],
    tags: [skill.name],
    source: 'DSH ctx.skills',
    sourcePath: 'ctx.skills → Skill Registry',
    sourceUrl: 'https://github.com/deepseek-ai/deepseek-harness',
    status: skill.invocation.modelInvocable ? 'installed' : 'disabled',
    capabilities: skill.whenToUse ? [skill.whenToUse] : [],
    provider: { name: skill.provider },
  }
}

/**
 * Concrete SkillAdapter that talks to ctx.skills.
 * The actual ctx.skills service (SkillRegistry) is injected at plugin apply time.
 */
export class DefaultSkillAdapter implements SkillAdapter {
  /** Locally disabled skills — DSH has no runtime disable, so we track it. */
  private disabledSet = new Set<string>()

  constructor(private skillsService?: any) {}

  async discover(): Promise<Capability[]> {
    if (!this.skillsService?.list) return []

    const summaries: SkillSummary[] = await this.skillsService.list()
    return summaries.map((s) => {
      const cap = skillToCapability(s)
      // Override status if locally disabled
      if (this.disabledSet.has(s.name)) {
        cap.status = 'disabled'
      }
      return cap
    })
  }

  async enable(cap: Capability): Promise<void> {
    // DSH skills are provider-discovered; "enable" just clears local disable.
    this.disabledSet.delete(cap.id)
  }

  async disable(cap: Capability): Promise<void> {
    // DSH skills are provider-discovered; "disable" is a local preference.
    this.disabledSet.add(cap.id)
  }

  async install(cap: Capability): Promise<void> {
    // Runtime skill registration via ctx.skills.register()
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
    // DSH has no unregister API for provider-discovered skills.
    // For runtime-registered skills, the disposer returned by register() handles cleanup.
    // We just clear local state.
    this.disabledSet.delete(cap.id)
  }
}
