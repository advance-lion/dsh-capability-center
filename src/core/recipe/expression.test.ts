import { describe, it, expect } from 'vitest'
import { evaluateExpression, resolvePath, validateExpression } from './expression'

describe('Expression DSL — resolvePath', () => {
  it('resolves simple path', () => {
    expect(resolvePath({ a: 1 }, 'a')).toBe(1)
  })

  it('resolves nested path', () => {
    expect(resolvePath({ a: { b: { c: 42 } } }, 'a.b.c')).toBe(42)
  })

  it('returns undefined for missing path', () => {
    expect(resolvePath({ a: 1 }, 'b')).toBe(undefined)
  })

  it('returns undefined for null data', () => {
    expect(resolvePath(null as unknown as Record<string, unknown>, 'a')).toBe(undefined)
  })

  it('returns undefined when hitting non-object', () => {
    expect(resolvePath({ a: 'string' }, 'a.b')).toBe(undefined)
  })
})

describe('Expression DSL — evaluateExpression', () => {
  const context = {
    'step1': { found: true, version: '1.0.87' },
    'step2': { json: { status: 'logged_in', scopes: ['im', 'docs'] } },
  }

  it('evaluates equals true', () => {
    expect(evaluateExpression({ equals: { path: 'step1.found', value: true } }, context)).toBe(true)
  })

  it('evaluates equals false for mismatch', () => {
    expect(evaluateExpression({ equals: { path: 'step1.found', value: false } }, context)).toBe(false)
  })

  it('evaluates not', () => {
    expect(evaluateExpression({ not: { equals: { path: 'step1.found', value: false } } }, context)).toBe(true)
  })

  it('evaluates any (OR)', () => {
    expect(
      evaluateExpression(
        { any: [
          { equals: { path: 'step2.json.status', value: 'logged_out' } },
          { equals: { path: 'step2.json.status', value: 'logged_in' } },
        ] },
        context,
      ),
    ).toBe(true)
  })

  it('evaluates all (AND)', () => {
    expect(
      evaluateExpression(
        { all: [
          { equals: { path: 'step2.json.status', value: 'logged_in' } },
          { exists: { path: 'step1.version' } },
        ] },
        context,
      ),
    ).toBe(true)
  })

  it('evaluates all false when one fails', () => {
    expect(
      evaluateExpression(
        { all: [
          { equals: { path: 'step2.json.status', value: 'logged_in' } },
          { equals: { path: 'step1.version', value: '2.0' } },
        ] },
        context,
      ),
    ).toBe(false)
  })

  it('evaluates in', () => {
    expect(
      evaluateExpression(
        { in: { path: 'step2.json.status', values: ['logged_in', 'ready', 'needs_refresh'] } },
        context,
      ),
    ).toBe(true)
  })

  it('evaluates exists', () => {
    expect(evaluateExpression({ exists: { path: 'step1.version' } }, context)).toBe(true)
    expect(evaluateExpression({ exists: { path: 'step1.missing' } }, context)).toBe(false)
  })

  it('resolves flattened top-level keys', () => {
    // step1.found is also accessible as just "found" via flattening
    expect(evaluateExpression({ equals: { path: 'found', value: true } }, context)).toBe(true)
  })
})

describe('Expression DSL — validateExpression', () => {
  it('accepts valid expressions', () => {
    expect(() => validateExpression({ equals: { path: 'a', value: 1 } })).not.toThrow()
    expect(() => validateExpression({ not: { equals: { path: 'a', value: 1 } } })).not.toThrow()
    expect(() => validateExpression({ any: [{ exists: { path: 'a' } }] })).not.toThrow()
    expect(() => validateExpression({ all: [{ in: { path: 'a', values: [1] } }] })).not.toThrow()
  })

  it('rejects unsupported operations', () => {
    expect(() => validateExpression({ eval: { code: 'return true' } })).toThrow('Unsupported')
    expect(() => validateExpression({ function: { name: 'eval' } })).toThrow('Unsupported')
  })

  it('rejects non-object', () => {
    expect(() => validateExpression(null)).toThrow()
    expect(() => validateExpression('string')).toThrow()
  })

  it('rejects equals without path', () => {
    expect(() => validateExpression({ equals: { value: 1 } })).toThrow('path')
  })

  it('rejects in without values array', () => {
    expect(() => validateExpression({ in: { path: 'a', values: 'not-array' } })).toThrow('array')
  })
})
