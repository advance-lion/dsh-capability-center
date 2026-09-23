/**
 * Built-in Step Executors for V0.1.
 *
 * Three executors that cover the Feishu CLI recipe:
 *   1. executable.resolve — detect if a CLI tool is installed
 *   2. command.json — run a command and parse JSON output
 *   3. assert.expression — evaluate a restricted DSL assertion
 *
 * No platform names. The executor receives its parameters from
 * the Recipe step's `with` field — it doesn't know what app it's
 * connecting to.
 */

import type {
  StepExecutor,
  StepContext,
  StepOutcome,
  EvidenceInput,
} from '../domain/types'
import { evaluateExpression } from './expression'
import { completed, retryableFailure, terminalFailure } from './executor-registry'

// ── 1. executable.resolve ─────────────────────────────────

/**
 * Detects whether a CLI tool is installed on the local machine.
 *
 * Input:
 *   command: string  — the binary name to look for (e.g. "lark-cli")
 *
 * Output:
 *   found: boolean
 *   path?: string
 *   version?: string
 */
export const executableResolveExecutor: StepExecutor = {
  type: 'executable.resolve',
  risk: 'read',
  requiresUser: false,

  async execute(ctx, input) {
    const command = input.command
    if (typeof command !== 'string' || !command.trim()) {
      return terminalFailure('invalid_input', 'executable.resolve requires "command" string')
    }

    const host = ctx.host as {
      subprocess?: { resolveExecutable: (cmd: string) => Promise<string | null> }
      shell?: { resolve: (req: { command: string; timeoutMs?: number; stdoutMaxBytes?: number }) => Promise<unknown> }
    }

    // Try subprocess.resolveExecutable first (returns path or null)
    if (host.subprocess?.resolveExecutable) {
      try {
        const path = await host.subprocess.resolveExecutable(command)
        if (path) {
          return completed({ found: true, path })
        }
      } catch {
        // Fall through to shell-based detection
      }
    }

    // Fallback: use shell to run `which` / `where`
    if (host.shell?.resolve) {
      const isWindows = process.platform === 'win32'
      const detectCmd = isWindows ? `where ${command}` : `which ${command}`
      try {
        const spec = await host.shell.resolve({
          command: detectCmd,
          timeoutMs: 5000,
          stdoutMaxBytes: 4096,
        })
        const runFn = (host.shell as { run?: (spec: unknown) => Promise<{ stdout?: { text?: string }; stderr?: { text?: string }; exitCode?: number }> }).run
        if (runFn) {
          const result = await runFn(spec)
          const text = result.stdout?.text || ''
          if (result.exitCode === 0 && text.trim()) {
            return completed({ found: true, path: text.trim().split('\n')[0] })
          }
        }
      } catch {
        // Not found
      }
    }

    return completed({ found: false })
  },
}

// ── 2. command.json ───────────────────────────────────────

/**
 * Runs a command and parses its stdout as JSON.
 *
 * Input:
 *   command: string       — full command line (e.g. "lark-cli auth status --json")
 *   timeoutMs?: number    — default 15000
 *   stdoutMaxBytes?: number — default 524288 (512KB)
 *   expectError?: boolean — if true, non-zero exit is not a failure
 *
 * Output:
 *   json: unknown         — parsed JSON (or null if parse failed)
 *   stdout: string        — raw stdout text
 *   exitCode: number
 *   stderr: string
 */
export const commandJsonExecutor: StepExecutor = {
  type: 'command.json',
  risk: 'read',
  requiresUser: false,

  async execute(ctx, input) {
    const command = input.command
    if (typeof command !== 'string' || !command.trim()) {
      return terminalFailure('invalid_input', 'command.json requires "command" string')
    }

    const timeoutMs = typeof input.timeoutMs === 'number' ? input.timeoutMs : 15000
    const stdoutMaxBytes = typeof input.stdoutMaxBytes === 'number' ? input.stdoutMaxBytes : 524288
    const expectError = input.expectError === true

    const host = ctx.host as {
      shell?: {
        resolve: (req: { command: string; timeoutMs?: number; stdoutMaxBytes?: number }) => Promise<unknown>
        run: (spec: unknown) => Promise<{
          stdout?: { text?: string; truncated?: boolean }
          stderr?: { text?: string }
          exitCode?: number
        }>
      }
    }

    if (!host.shell?.resolve || !host.shell.run) {
      return terminalFailure('no_shell_service', 'Host does not provide shell service')
    }

    try {
      const spec = await host.shell.resolve({ command, timeoutMs, stdoutMaxBytes })
      const result = await host.shell.run(spec)

      const stdoutText = result.stdout?.text || ''
      const stderrText = result.stderr?.text || ''
      const exitCode = result.exitCode ?? 0

      // Parse JSON
      let json: unknown = null
      if (stdoutText.trim()) {
        try {
          json = JSON.parse(stdoutText)
        } catch {
          // Not JSON — that's OK, caller can still use stdout
        }
      }

      if (!expectError && exitCode !== 0) {
        return retryableFailure(
          'command_failed',
          `Command exited with code ${exitCode}: ${stderrText.slice(0, 200)}`,
          1000,
        )
      }

      return completed({
        json,
        stdout: stdoutText,
        stderr: stderrText,
        exitCode,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return retryableFailure('command_error', message, 2000)
    }
  },
}

// ── 3. assert.expression ──────────────────────────────────

/**
 * Evaluates a restricted DSL expression against accumulated step outputs.
 * Does not execute any command — pure data assertion.
 *
 * Input:
 *   expression: ExpressionNode — the assertion tree
 *   message?: string           — human-readable failure message
 *
 * Output:
 *   passed: boolean
 *   message?: string
 */
export const assertExpressionExecutor: StepExecutor = {
  type: 'assert.expression',
  risk: 'read',
  requiresUser: false,

  async execute(ctx, input) {
    const expression = input.expression
    const message = typeof input.message === 'string' ? input.message : 'Assertion failed'

    if (expression === null || typeof expression !== 'object') {
      return terminalFailure('invalid_input', 'assert.expression requires "expression" object')
    }

    try {
      const passed = evaluateExpression(expression as import('../domain/types').ExpressionNode, ctx.stepOutputs)
      const evidence: EvidenceInput[] = passed
        ? [{
            type: 'health',
            result: 'passed',
            payload: { assertion: 'expression', passed: true },
          }]
        : [{
            type: 'health',
            result: 'failed',
            payload: { assertion: 'expression', passed: false, message },
          }]

      return completed({ passed, message: passed ? undefined : message }, evidence)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      return terminalFailure('expression_error', msg)
    }
  },
}

// ── Registration helper ────────────────────────────────────

import { ExecutorRegistry } from './executor-registry'

export function registerBuiltinExecutors(registry: ExecutorRegistry): void {
  registry.register(executableResolveExecutor)
  registry.register(commandJsonExecutor)
  registry.register(assertExpressionExecutor)
}
