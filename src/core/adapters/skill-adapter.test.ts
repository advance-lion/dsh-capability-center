import { describe, expect, it } from 'vitest'
import type { SkillSummary } from '@deepseek-ai/dsh-skill'
import { classifySkill, DefaultSkillAdapter } from './skill-adapter'

function summary(name: string, description: string): SkillSummary {
  return {
    name,
    description,
    invocation: { modelInvocable: true, userInvocable: true },
    source: 'bundled',
    provider: 'test',
  }
}

describe('classifySkill', () => {
  it('classifies Lark skills as office capabilities', () => {
    expect(classifySkill(summary('lark-calendar', 'Manage calendar events'))).toContain('办公')
  })

  it('supports multiple inferred categories', () => {
    const categories = classifySkill(summary('github-data-analysis', 'Analyze repository data'))
    expect(categories).toContain('开发')
    expect(categories).toContain('数据')
  })

  it('uses Other as the safe fallback', () => {
    expect(classifySkill(summary('quartz', 'Unclassified capability'))).toEqual(['其他'])
  })
})

describe('DefaultSkillAdapter', () => {
  it('queries the preset standing scope and removes duplicate names', async () => {
    const scope = {}
    const list = async (options: unknown) => {
      expect(options).toEqual({ scope })
      return [summary('demo', 'first'), summary('demo', 'duplicate')]
    }
    const adapter = new DefaultSkillAdapter({ list }, async () => scope)
    const capabilities = await adapter.discover()
    expect(capabilities).toHaveLength(1)
    expect(capabilities[0]?.id).toBe('demo')
  })
})
