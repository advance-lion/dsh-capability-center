/**
 * SkillAdapter — bridges the unified Capability model to DSH's native
 * ctx.skills system.
 *
 * DSH already has a complete Skill runtime:
 *   Provider → ctx.skills → Registry → Catalog → skill Tool
 *
 * This adapter does NOT re-implement the Skill runtime. It only:
 * 1. Reads skill metadata from ctx.skills for display in Capability Center
 * 2. Translates enable/disable calls to ctx.skills operations
 */
import type { Capability } from '../capability/types'

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

/**
 * Concrete SkillAdapter that talks to ctx.skills.
 * The actual ctx.skills service is injected at plugin apply time.
 */
export class DefaultSkillAdapter implements SkillAdapter {
  constructor(private skillsService?: any) {}

  async discover(): Promise<Capability[]> {
    if (!this.skillsService) return []
    // TODO: call ctx.skills.list() and map to Capability[]
    return []
  }

  async enable(cap: Capability): Promise<void> {
    // TODO: ctx.skills.enable(cap.id)
  }

  async disable(cap: Capability): Promise<void> {
    // TODO: ctx.skills.disable(cap.id)
  }

  async install(cap: Capability): Promise<void> {
    // TODO: ctx.skills.install(cap)
  }

  async uninstall(cap: Capability): Promise<void> {
    // TODO: ctx.skills.uninstall(cap.id)
  }
}
