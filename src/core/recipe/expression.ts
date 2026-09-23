/**
 * Restricted expression DSL evaluator.
 *
 * Non-Turing-complete: no loops, no recursion, no function calls.
 * Only reads from step outputs via dot-path access.
 *
 * Supported operations: equals, not, any, all, in, exists.
 */

import type { ExpressionNode } from '../domain/types'

/**
 * Resolve a dot-path like "identities.bot.status" against a data object.
 * Returns undefined for any missing segment.
 */
export function resolvePath(
  data: Record<string, unknown> | undefined,
  path: string,
): unknown {
  if (!data || !path) return undefined
  const segments = path.split('.')
  let current: unknown = data
  for (const seg of segments) {
    if (current === null || current === undefined) return undefined
    if (typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[seg]
  }
  return current
}

/**
 * Evaluate an expression node against accumulated step outputs.
 * Each step's output is keyed by step id in the `context` object.
 */
export function evaluateExpression(
  node: ExpressionNode,
  context: Record<string, Record<string, unknown>>,
): boolean {
  // Collect all step outputs into a single namespace for path resolution.
  // Paths like "steps.inspect-auth.output.ready" are resolved as:
  // context['inspect-auth']?.['ready'] — but we also support
  // "identities.bot.status" which resolves against the merged output.
  const merged: Record<string, unknown> = {}
  for (const [stepId, output] of Object.entries(context)) {
    merged[stepId] = output
    // Also flatten top-level keys for convenience
    for (const [k, v] of Object.entries(output)) {
      if (!(k in merged)) merged[k] = v
    }
  }

  return evaluateNode(node, merged)
}

function evaluateNode(
  node: ExpressionNode,
  data: Record<string, unknown>,
): boolean {
  if ('equals' in node) {
    const actual = resolvePath(data, node.equals.path)
    return deepEqual(actual, node.equals.value)
  }

  if ('not' in node) {
    return !evaluateNode(node.not, data)
  }

  if ('any' in node) {
    return node.any.some((child) => evaluateNode(child, data))
  }

  if ('all' in node) {
    return node.all.every((child) => evaluateNode(child, data))
  }

  if ('in' in node) {
    const actual = resolvePath(data, node.in.path)
    return node.in.values.some((v) => deepEqual(actual, v))
  }

  if ('exists' in node) {
    const actual = resolvePath(data, node.exists.path)
    return actual !== undefined && actual !== null
  }

  return false
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null) return false
  if (typeof a !== typeof b) return false
  if (typeof a === 'object') {
    try {
      return JSON.stringify(a) === JSON.stringify(b)
    } catch {
      return false
    }
  }
  return false
}

/**
 * Validate that an expression node only uses supported operations.
 * Throws on unsupported structures.
 */
export function validateExpression(node: unknown): asserts node is ExpressionNode {
  if (node === null || typeof node !== 'object') {
    throw new Error('Expression must be a non-null object')
  }
  const n = node as Record<string, unknown>
  const keys = Object.keys(n)

  for (const key of keys) {
    switch (key) {
      case 'equals':
        validateEquals(n[key])
        break
      case 'not':
        validateExpression(n[key])
        break
      case 'any':
      case 'all':
        if (!Array.isArray(n[key])) throw new Error(`${key} must be an array`)
        for (const child of n[key]) validateExpression(child)
        break
      case 'in':
        validateIn(n[key])
        break
      case 'exists':
        validateExists(n[key])
        break
      default:
        throw new Error(`Unsupported expression operation: ${key}`)
    }
  }
}

function validateEquals(v: unknown): void {
  if (v === null || typeof v !== 'object') throw new Error('equals must be an object')
  const e = v as Record<string, unknown>
  if (typeof e.path !== 'string') throw new Error('equals.path must be a string')
  if (!('value' in e)) throw new Error('equals requires a value field')
}

function validateIn(v: unknown): void {
  if (v === null || typeof v !== 'object') throw new Error('in must be an object')
  const e = v as Record<string, unknown>
  if (typeof e.path !== 'string') throw new Error('in.path must be a string')
  if (!Array.isArray(e.values)) throw new Error('in.values must be an array')
}

function validateExists(v: unknown): void {
  if (v === null || typeof v !== 'object') throw new Error('exists must be an object')
  const e = v as Record<string, unknown>
  if (typeof e.path !== 'string') throw new Error('exists.path must be a string')
}
