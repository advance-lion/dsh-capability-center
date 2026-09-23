/**
 * Step Executor Registry.
 *
 * Executors are registered by type string. Recipe steps reference
 * executors by type — no platform names are hardcoded here.
 *
 * V0.1 includes three built-in executors:
 *   - executable.resolve: detect if a CLI tool is installed
 *   - command.json: run a command and parse JSON output
 *   - assert.expression: evaluate a restricted DSL assertion
 *
 * Additional executors (oauth, mcp, credential, etc.) will be
 * registered in later versions.
 */

import type {
  StepExecutor,
  StepContext,
  StepOutcome,
  StructuredError,
  EvidenceInput,
} from '../domain/types'

export class ExecutorRegistry {
  private executors = new Map<string, StepExecutor>()

  register(executor: StepExecutor): void {
    if (this.executors.has(executor.type)) {
      throw new Error(`Step executor already registered: ${executor.type}`)
    }
    this.executors.set(executor.type, executor)
  }

  get(type: string): StepExecutor | undefined {
    return this.executors.get(type)
  }

  has(type: string): boolean {
    return this.executors.has(type)
  }

  list(): string[] {
    return [...this.executors.keys()]
  }

  async execute(
    type: string,
    ctx: StepContext,
    input: Record<string, unknown>,
  ): Promise<StepOutcome> {
    const executor = this.executors.get(type)
    if (!executor) {
      return terminalFailure('unknown_executor', `No executor registered for step type: ${type}`)
    }
    try {
      return await executor.execute(ctx, input)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        state: 'retryable_failure',
        error: {
          category: 'unknown',
          code: 'executor_threw',
          message,
          retryable: false,
        },
      }
    }
  }
}

// ── Helpers ────────────────────────────────────────────────

export function completed(
  output: Record<string, unknown>,
  evidence?: EvidenceInput[],
): StepOutcome {
  return { state: 'completed', output, evidence }
}

export function waitingUser(
  challenge: import('../domain/types').UserChallenge,
  checkpoint: unknown,
): StepOutcome {
  return { state: 'waiting_user', challenge, checkpoint }
}

export function retryableFailure(
  code: string,
  message: string,
  retryAfterMs?: number,
): StepOutcome {
  return {
    state: 'retryable_failure',
    error: structuredError(code, message, true),
    retryAfterMs,
  }
}

export function terminalFailure(
  code: string,
  message: string,
): StepOutcome {
  return {
    state: 'terminal_failure',
    error: structuredError(code, message, false),
  }
}

export function structuredError(
  code: string,
  message: string,
  retryable: boolean,
  category: StructuredError['category'] = 'unknown',
): StructuredError {
  return { category, code, message, retryable }
}
