/**
 * terminal.interactive executor.
 *
 * When a recipe step needs the user to run a command in a real
 * terminal (e.g. `lark-cli auth login` which opens a browser),
 * this executor returns a `waiting_user` challenge with the
 * command and instructions.
 *
 * The UI shows the instructions. When the user completes the
 * action and clicks "I've done it", the engine calls `resume()`
 * which returns `completed`.
 */

import type { StepExecutor, StepContext, StepOutcome } from '../domain/types'
import { completed, waitingUser } from './executor-registry'

export const terminalInteractiveExecutor: StepExecutor = {
  type: 'terminal.interactive',
  risk: 'write',
  requiresUser: true,

  async execute(_ctx: StepContext, input: Record<string, unknown>): Promise<StepOutcome> {
    const command = input.command
    const message = typeof input.message === 'string' ? input.message : '请在终端中完成操作'

    if (typeof command !== 'string' || !command.trim()) {
      return {
        state: 'terminal_failure',
        error: { category: 'unknown', code: 'invalid_input', message: 'terminal.interactive requires "command" string', retryable: false },
      }
    }

    return waitingUser(
      { type: 'terminal', terminalRunRef: command, message },
      { command, completed: false },
    )
  },

  async resume(_ctx: StepContext, _checkpoint: unknown): Promise<StepOutcome> {
    // User confirmed they completed the terminal action
    return completed({ completed: true })
  },
}
