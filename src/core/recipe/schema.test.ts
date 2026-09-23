import { describe, it, expect } from 'vitest'
import { validateRecipe } from './schema'

describe('Recipe Schema Validator', () => {
  const validRecipe = {
    schemaVersion: 1,
    id: 'feishu-cli-user',
    version: '1.0.0',
    integrationId: 'feishu',
    methodId: 'feishu-cli-user',
    platforms: ['win32', 'darwin'],
    source: { level: 'official-open-source', url: 'https://example.com' },
    intents: {
      connect: {
        steps: [
          {
            id: 'detect-cli',
            type: 'executable.resolve',
            with: { command: 'lark-cli' },
          },
          {
            id: 'auth-status',
            type: 'command.json',
            when: { exists: { path: 'detect-cli.found' } },
            with: { command: 'lark-cli auth status --json' },
          },
          {
            id: 'assert-authed',
            type: 'assert.expression',
            when: { exists: { path: 'auth-status.json' } },
            with: {
              expression: {
                any: [
                  { equals: { path: 'auth-status.json.status', value: 'logged_in' } },
                  { equals: { path: 'auth-status.json.status', value: 'ready' } },
                ],
              },
              message: 'Not authenticated',
            },
          },
        ],
      },
    },
  }

  it('accepts a valid recipe', () => {
    const result = validateRecipe(validRecipe)
    expect(result.ok).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('rejects wrong schemaVersion', () => {
    const result = validateRecipe({ ...validRecipe, schemaVersion: 2 })
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toContain('schemaVersion')
  })

  it('rejects invalid id format', () => {
    const result = validateRecipe({ ...validRecipe, id: 'Feishu_CLI' })
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('kebab-case'))).toBe(true)
  })

  it('rejects invalid version format', () => {
    const result = validateRecipe({ ...validRecipe, version: '1.0' })
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('semver'))).toBe(true)
  })

  it('rejects unsupported step type', () => {
    const bad = {
      ...validRecipe,
      intents: {
        connect: {
          steps: [
            { id: 'bad', type: 'eval.javascript', with: {} },
          ],
        },
      },
    }
    const result = validateRecipe(bad)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('unsupported step type'))).toBe(true)
  })

  it('rejects duplicate step ids', () => {
    const bad = {
      ...validRecipe,
      intents: {
        connect: {
          steps: [
            { id: 'dup', type: 'executable.resolve', with: { command: 'x' } },
            { id: 'dup', type: 'command.json', with: { command: 'x' } },
          ],
        },
      },
    }
    const result = validateRecipe(bad)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('duplicate'))).toBe(true)
  })

  it('rejects invalid expression in when', () => {
    const bad = {
      ...validRecipe,
      intents: {
        connect: {
          steps: [
            {
              id: 's1',
              type: 'command.json',
              when: { eval: { code: 'return true' } },
              with: { command: 'x' },
            },
          ],
        },
      },
    }
    const result = validateRecipe(bad)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('expression'))).toBe(true)
  })

  it('rejects missing required fields', () => {
    const result = validateRecipe({ schemaVersion: 1 })
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('id'))).toBe(true)
    expect(result.errors.some((e) => e.includes('version'))).toBe(true)
  })

  it('warns on non-https source URL', () => {
    const bad = {
      ...validRecipe,
      source: { level: 'official-open-source', url: 'http://example.com' },
    }
    const result = validateRecipe(bad)
    expect(result.warnings.some((w) => w.includes('https'))).toBe(true)
  })

  it('accepts custom executor types when registered', () => {
    const bad = {
      ...validRecipe,
      intents: {
        connect: {
          steps: [
            { id: 's1', type: 'custom.executor', with: {} },
          ],
        },
      },
    }
    const withoutExecutor = validateRecipe(bad)
    expect(withoutExecutor.ok).toBe(false)

    const withExecutor = validateRecipe(bad, new Set(['custom.executor']))
    expect(withExecutor.ok).toBe(true)
  })
})
