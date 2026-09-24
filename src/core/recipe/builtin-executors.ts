/** Generic executors. Platform-specific commands and conditions belong in reviewed recipes. */
import type { StepExecutor, EvidenceInput } from '../domain/types'
import { evaluateExpression, validateExpression } from './expression'
import { completed, terminalFailure, ExecutorRegistry } from './executor-registry'

export const executableResolveExecutor: StepExecutor = {
  type: 'executable.resolve', risk: 'read', requiresUser: false,
  async execute(ctx, input) {
    const signal = ctx.signal
    if (signal?.aborted) return terminalFailure('operation_cancelled', 'Operation cancelled')
    const command = input.command
    if (typeof command !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._+-]*$/.test(command)) {
      return terminalFailure('invalid_input', 'Executable name must not contain paths or shell syntax')
    }
    const host = ctx.host as { subprocess?: { resolveExecutable: (command: string, signal?: AbortSignal) => Promise<string | null> } } | undefined
    if (!host?.subprocess?.resolveExecutable) return terminalFailure('no_executable_service', 'Host does not provide executable lookup')
    try {
      const path = await host.subprocess.resolveExecutable(command, signal)
      if (signal?.aborted) return terminalFailure('operation_cancelled', 'Operation cancelled')
      return completed(path ? { found: true, path } : { found: false })
    } catch {
      return terminalFailure(signal?.aborted ? 'operation_cancelled' : 'executable_lookup_failed', 'Executable lookup did not complete')
    }
  },
}

const unsafeKeys = new Set(['__proto__', 'prototype', 'constructor'])
function selectionOf(value: unknown): Array<[string, string[]]> | undefined {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_selection')
  const entries = Object.entries(value)
  if (!entries.length || entries.length > 64) throw new Error('invalid_selection')
  return entries.map(([key, path]) => {
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key) || unsafeKeys.has(key) || typeof path !== 'string') throw new Error('invalid_selection')
    const parts = path.split('.')
    if (parts.length > 16 || parts.some(part => !/^[a-zA-Z0-9_-]+$/.test(part) || unsafeKeys.has(part))) throw new Error('invalid_selection')
    return [key, parts]
  })
}
function projectScalars(value: unknown, selection: Array<[string, string[]]>): Record<string, unknown> {
  const result: Record<string, unknown> = Object.create(null)
  for (const [key, parts] of selection) {
    let current = value
    for (const part of parts) {
      current = current && typeof current === 'object' && Object.prototype.hasOwnProperty.call(current, part)
        ? (current as Record<string, unknown>)[part] : undefined
    }
    if (current === undefined) continue
    if (current !== null && !['boolean', 'string', 'number'].includes(typeof current)) throw new Error('nonscalar_selection')
    result[key] = current
  }
  return result
}

/**
 * Parse a command's JSON stdout. Never return raw stdout/stderr in outcomes.
 * select optionally maps safe output names to own-property scalar JSON paths.
 * expectError preserves a known nonzero exit as data, not as authentication.
 * Unknown exit, malformed/truncated output and cancellation always fail.
 * No automatic retry: a generic command may not be idempotent.
 */
export const commandJsonExecutor: StepExecutor = {
  type: 'command.json', risk: 'read', requiresUser: false,
  async execute(ctx, input) {
    const signal = ctx.signal
    if (signal?.aborted) return terminalFailure('operation_cancelled', 'Operation cancelled')
    const command = input.command
    if (typeof command !== 'string' || !command.trim()) return terminalFailure('invalid_input', 'command.json requires a command')
    const timeoutMs = input.timeoutMs ?? 15000
    const stdoutMaxBytes = input.stdoutMaxBytes ?? 524288
    if (typeof timeoutMs !== 'number' || !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 120000 ||
        typeof stdoutMaxBytes !== 'number' || !Number.isSafeInteger(stdoutMaxBytes) || stdoutMaxBytes <= 0 || stdoutMaxBytes > 1048576) {
      return terminalFailure('invalid_input', 'Invalid timeout or output limit')
    }
    let selection: ReturnType<typeof selectionOf>
    try { selection = selectionOf(input.select) }
    catch { return terminalFailure('invalid_selection', 'Invalid JSON projection') }
    const host = ctx.host as { shell?: {
      resolve(request: { command: string; timeoutMs: number; stdoutMaxBytes: number; signal?: AbortSignal }): unknown | Promise<unknown>
      run(spec: unknown): Promise<{ stdout?: { text?: string; truncated?: boolean }; stderr?: { truncated?: boolean }; exitCode?: number | null; timedOut?: boolean; aborted?: boolean }>
    } } | undefined
    if (!host?.shell?.resolve || !host.shell.run) return terminalFailure('no_shell_service', 'Host does not provide shell service')
    try {
      const spec = await host.shell.resolve({ command, timeoutMs, stdoutMaxBytes, signal })
      if (signal?.aborted) return terminalFailure('operation_cancelled', 'Operation cancelled')
      const result = await host.shell.run(spec)
      if (signal?.aborted || result.aborted) return terminalFailure('operation_cancelled', 'Operation cancelled')
      if (result.timedOut) return terminalFailure('command_timeout', 'Command exceeded its deadline')
      if (result.stdout?.truncated || result.stderr?.truncated) return terminalFailure('output_truncated', 'Command output exceeded its limit')
      if (typeof result.exitCode !== 'number' || !Number.isInteger(result.exitCode)) return terminalFailure('unknown_exit_code', 'Command did not return a known exit code')
      if (input.expectError !== true && result.exitCode !== 0) return terminalFailure('command_failed', `Command exited with code ${result.exitCode}`)
      let json: unknown
      try { json = JSON.parse(result.stdout?.text ?? '') }
      catch { return terminalFailure('invalid_json', 'Command did not return valid JSON') }
      if (selection) {
        try { json = projectScalars(json, selection) }
        catch { return terminalFailure('invalid_projection', 'Selected JSON values must be scalar') }
      }
      return completed({ json, exitCode: result.exitCode })
    } catch {
      return terminalFailure(signal?.aborted ? 'operation_cancelled' : 'command_error', 'Command could not complete')
    }
  },
}

export const assertExpressionExecutor: StepExecutor = {
  type: 'assert.expression', risk: 'read', requiresUser: false,
  async execute(ctx, input) {
    if (ctx.signal?.aborted) return terminalFailure('operation_cancelled', 'Operation cancelled')
    const expression = input.expression
    const message = typeof input.message === 'string' ? input.message : 'Assertion failed'
    try {
      validateExpression(expression)
      const passed = evaluateExpression(expression, ctx.stepOutputs)
      if (!passed) return terminalFailure('assertion_failed', message)
      const evidence: EvidenceInput[] = [{ type: 'health', result: 'passed', payload: { assertion: 'expression', passed: true } }]
      return completed({ passed: true }, evidence)
    } catch {
      return terminalFailure('expression_error', 'Invalid assertion expression')
    }
  },
}

export function registerBuiltinExecutors(registry: ExecutorRegistry): void {
  registry.register(executableResolveExecutor)
  registry.register(commandJsonExecutor)
  registry.register(assertExpressionExecutor)
}
