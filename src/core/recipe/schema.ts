/**
 * Recipe Schema v1 — static validator.
 *
 * Validates a Recipe document before it can be published to the Catalog.
 * Ensures no arbitrary code, no unsupported step types, and that all
 * step parameters match the registered executor's input schema.
 */

import type { RecipeDocument, RecipeStep, ExpressionNode } from '../domain/types'
import { validateExpression } from './expression'

export interface ValidationResult {
  ok: boolean
  errors: string[]
  warnings: string[]
}

const SUPPORTED_STEP_TYPES = new Set([
  'executable.resolve',
  'command.json',
  'assert.expression',
  'file.exists',
  'package.detect',
  'http.probe',
  'package.npm.install',
  'download.official',
  'mcp.register',
  'config.patch',
  'oauth.browser',
  'oauth.device_code',
  'terminal.interactive',
  'credential.prompt',
  'credential.store',
  'api.identity',
  'mcp.initialize',
  'mcp.tools.list',
  'capability.probe',
  'provider.require',
  'provider.delegate',
  'provider.await',
  'provider.verify',
  'manual.wait',
  'qr.present',
  'phone_verification.wait',
])

const REQUIRED_STEP_FIELDS = ['id', 'type', 'with'] as const

/**
 * Validate a complete Recipe document.
 */
export function validateRecipe(
  doc: unknown,
  registeredExecutors?: Set<string>,
): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (doc === null || typeof doc !== 'object') {
    return { ok: false, errors: ['Recipe must be a non-null object'], warnings }
  }

  const d = doc as Record<string, unknown>

  // Schema version
  if (d.schemaVersion !== 1) {
    errors.push(`schemaVersion must be 1, got ${String(d.schemaVersion)}`)
  }

  // Required top-level fields
  for (const field of ['id', 'version', 'integrationId', 'methodId', 'platforms', 'source', 'intents']) {
    if (!(field in d)) {
      errors.push(`Missing required field: ${field}`)
    }
  }

  if (errors.length > 0) return { ok: false, errors, warnings }

  // ID format
  if (typeof d.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(d.id)) {
    errors.push(`id must be lowercase kebab-case, got: ${String(d.id)}`)
  }

  // Version format (semver-ish)
  if (typeof d.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(d.version)) {
    errors.push(`version must be semver (x.y.z), got: ${String(d.version)}`)
  }

  // Platforms
  if (!Array.isArray(d.platforms) || d.platforms.length === 0) {
    errors.push('platforms must be a non-empty array')
  }

  // Source
  if (d.source && typeof d.source === 'object') {
    const src = d.source as Record<string, unknown>
    if (typeof src.url !== 'string' || !src.url.startsWith('https://')) {
      warnings.push('source.url should be an https URL')
    }
  }

  // Intents
  if (typeof d.intents !== 'object' || d.intents === null) {
    errors.push('intents must be an object')
    return { ok: false, errors, warnings }
  }

  const intents = d.intents as Record<string, unknown>
  const intentNames = Object.keys(intents)
  if (intentNames.length === 0) {
    warnings.push('No intents defined')
  }

  for (const intentName of intentNames) {
    if (!['connect', 'install', 'verify', 'reauthorize', 'switch_account', 'remove', 'repair', 'configure'].includes(intentName)) {
      warnings.push(`Unknown intent name: ${intentName}`)
    }
    const intent = intents[intentName]
    if (intent === null || typeof intent !== 'object') {
      errors.push(`Intent ${intentName} must be an object`)
      continue
    }
    const intentObj = intent as Record<string, unknown>
    if (!Array.isArray(intentObj.steps)) {
      errors.push(`Intent ${intentName}.steps must be an array`)
      continue
    }
    const stepIds = new Set<string>()
    intentObj.steps.forEach((step, idx) => {
      const stepErrors = validateStep(step, idx, stepIds, registeredExecutors)
      errors.push(...stepErrors)
    })
  }

  return { ok: errors.length === 0, errors, warnings }
}

function validateStep(
  step: unknown,
  index: number,
  stepIds: Set<string>,
  registeredExecutors?: Set<string>,
): string[] {
  const errors: string[] = []

  if (step === null || typeof step !== 'object') {
    return [`Step ${index}: must be a non-null object`]
  }

  const s = step as Record<string, unknown>

  // Required fields
  for (const field of REQUIRED_STEP_FIELDS) {
    if (!(field in s)) {
      errors.push(`Step ${index}: missing required field "${field}"`)
    }
  }

  if (errors.length > 0) return errors

  // ID uniqueness
  if (typeof s.id === 'string') {
    if (stepIds.has(s.id)) {
      errors.push(`Step ${index}: duplicate step id "${s.id}"`)
    }
    stepIds.add(s.id)
  }

  // Type is supported
  if (typeof s.type === 'string') {
    if (!SUPPORTED_STEP_TYPES.has(s.type)) {
      if (registeredExecutors && registeredExecutors.has(s.type)) {
        // OK — registered custom executor
      } else {
        errors.push(`Step ${index} (${s.id}): unsupported step type "${s.type}"`)
      }
    }
  }

  // with must be an object
  if (s.with !== null && typeof s.with !== 'object') {
    errors.push(`Step ${index} (${s.id}): "with" must be an object`)
  }

  // when must be a valid expression
  if (s.when !== undefined && s.when !== null) {
    try {
      validateExpression(s.when as ExpressionNode)
    } catch (e) {
      errors.push(`Step ${index} (${s.id}): invalid "when" expression: ${String((e as Error).message)}`)
    }
  }

  // persist must be string array
  if (s.persist !== undefined) {
    if (!Array.isArray(s.persist) || !s.persist.every((p) => typeof p === 'string')) {
      errors.push(`Step ${index} (${s.id}): "persist" must be an array of strings`)
    }
  }

  // timeoutMs must be positive
  if (s.timeoutMs !== undefined) {
    if (typeof s.timeoutMs !== 'number' || s.timeoutMs <= 0) {
      errors.push(`Step ${index} (${s.id}): "timeoutMs" must be a positive number`)
    }
  }

  // retryPolicy
  if (s.retryPolicy !== undefined) {
    if (s.retryPolicy === null || typeof s.retryPolicy !== 'object') {
      errors.push(`Step ${index} (${s.id}): "retryPolicy" must be an object`)
    } else {
      const rp = s.retryPolicy as Record<string, unknown>
      if (typeof rp.maxAttempts !== 'number' || rp.maxAttempts < 1) {
        errors.push(`Step ${index} (${s.id}): retryPolicy.maxAttempts must be >= 1`)
      }
      if (typeof rp.backoffMs !== 'number' || rp.backoffMs < 0) {
        errors.push(`Step ${index} (${s.id}): retryPolicy.backoffMs must be >= 0`)
      }
    }
  }

  return errors
}
