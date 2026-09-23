/**
 * Recipe Engine — executes recipe steps sequentially.
 *
 * The engine is generic: it doesn't know what app it's connecting to.
 * It reads recipe data (JSON), evaluates `when` conditions, dispatches
 * to registered StepExecutors, and persists step outputs.
 *
 * Lifecycle:
 *   1. executeIntent(recipe, intentName) → runs steps in order
 *   2. If a step returns waiting_user → return challenge + checkpoint
 *   3. resumeIntent(recipe, intentName, checkpoint) → continue from where it stopped
 *
 * Error handling:
 *   - retryable_failure → return error with retry hint
 *   - terminal_failure → return error, no retry
 *   - Step `when` condition false → skip step, continue
 */

import type {
  RecipeDocument,
  RecipeStep,
  StepContext,
  StepOutcome,
  ExpressionNode,
  StructuredError,
  UserChallenge,
} from '../domain/types'
import { evaluateExpression } from './expression'
import type { ExecutorRegistry } from './executor-registry'

export type RecipeRunResult =
  | { state: 'completed'; stepOutputs: Record<string, Record<string, unknown>> }
  | { state: 'waiting_user'; challenge: UserChallenge; checkpoint: ResumeCheckpoint }
  | { state: 'failed'; error: StructuredError; retryable: boolean }

export interface ResumeCheckpoint {
  stepId: string
  stepIndex: number
  stepOutputs: Record<string, Record<string, unknown>>
}

export class RecipeEngine {
  constructor(
    private executors: ExecutorRegistry,
    private host: unknown,
  ) {}

  async executeIntent(
    recipe: RecipeDocument,
    intentName: string,
    options?: { signal?: AbortSignal; existingOutputs?: Record<string, Record<string, unknown>> },
  ): Promise<RecipeRunResult> {
    const intent = recipe.intents[intentName]
    if (!intent) {
      return {
        state: 'failed',
        error: { category: 'unknown', code: 'intent_not_found', message: `Intent "${intentName}" not found in recipe "${recipe.id}"`, retryable: false },
        retryable: false,
      }
    }

    const stepOutputs: Record<string, Record<string, unknown>> = options?.existingOutputs ? { ...options.existingOutputs } : {}
    const runId = `${recipe.id}:${intentName}:${Date.now()}`

    for (let i = 0; i < intent.steps.length; i++) {
      const step = intent.steps[i]

      // Evaluate `when` condition — skip if false
      if (step.when) {
        try {
          const shouldRun = evaluateExpression(step.when as ExpressionNode, stepOutputs)
          if (!shouldRun) continue
        } catch {
          // If condition evaluation fails, skip the step
          continue
        }
      }

      // Execute the step
      const ctx: StepContext = {
        host: this.host,
        stepOutputs,
        signal: options?.signal,
        runId,
      }

      const outcome = await this.executors.execute(step.type, ctx, step.with)

      if (outcome.state === 'completed') {
        // Persist specified fields (or all if no persist list)
        const persisted: Record<string, unknown> = {}
        if (step.persist && step.persist.length > 0) {
          for (const field of step.persist) {
            persisted[field] = outcome.output[field]
          }
        } else {
          Object.assign(persisted, outcome.output)
        }
        stepOutputs[step.id] = persisted
        continue
      }

      if (outcome.state === 'waiting_user') {
        return {
          state: 'waiting_user',
          challenge: outcome.challenge,
          checkpoint: { stepId: step.id, stepIndex: i, stepOutputs },
        }
      }

      if (outcome.state === 'retryable_failure') {
        return { state: 'failed', error: outcome.error, retryable: true }
      }

      if (outcome.state === 'terminal_failure') {
        return { state: 'failed', error: outcome.error, retryable: false }
      }
    }

    return { state: 'completed', stepOutputs }
  }

  async resumeIntent(
    recipe: RecipeDocument,
    intentName: string,
    checkpoint: ResumeCheckpoint,
    options?: { signal?: AbortSignal },
  ): Promise<RecipeRunResult> {
    const intent = recipe.intents[intentName]
    if (!intent) {
      return {
        state: 'failed',
        error: { category: 'unknown', code: 'intent_not_found', message: `Intent "${intentName}" not found`, retryable: false },
        retryable: false,
      }
    }

    const stepOutputs = { ...checkpoint.stepOutputs }
    const runId = `${recipe.id}:${intentName}:resume:${Date.now()}`

    // Resume from the step that was waiting
    const step = intent.steps[checkpoint.stepIndex]
    if (!step) {
      return { state: 'completed', stepOutputs }
    }

    // Try to resume the step
    const executor = this.executors.get(step.type)
    if (executor?.resume) {
      const ctx: StepContext = { host: this.host, stepOutputs, signal: options?.signal, runId }
      const outcome = await executor.resume(ctx, checkpoint)

      if (outcome.state === 'completed') {
        const persisted: Record<string, unknown> = {}
        if (step.persist && step.persist.length > 0) {
          for (const field of step.persist) {
            persisted[field] = outcome.output[field]
          }
        } else {
          Object.assign(persisted, outcome.output)
        }
        stepOutputs[step.id] = persisted
      } else if (outcome.state === 'waiting_user') {
        return { state: 'waiting_user', challenge: outcome.challenge, checkpoint: { stepId: step.id, stepIndex: checkpoint.stepIndex, stepOutputs } }
      } else {
        return { state: 'failed', error: outcome.error, retryable: outcome.state === 'retryable_failure' }
      }
    }

    // Continue with remaining steps
    for (let i = checkpoint.stepIndex + 1; i < intent.steps.length; i++) {
      const nextStep = intent.steps[i]

      if (nextStep.when) {
        try {
          const shouldRun = evaluateExpression(nextStep.when as ExpressionNode, stepOutputs)
          if (!shouldRun) continue
        } catch { continue }
      }

      const ctx: StepContext = { host: this.host, stepOutputs, signal: options?.signal, runId }
      const outcome = await this.executors.execute(nextStep.type, ctx, nextStep.with)

      if (outcome.state === 'completed') {
        const persisted: Record<string, unknown> = {}
        if (nextStep.persist && nextStep.persist.length > 0) {
          for (const field of nextStep.persist) {
            persisted[field] = outcome.output[field]
          }
        } else {
          Object.assign(persisted, outcome.output)
        }
        stepOutputs[nextStep.id] = persisted
        continue
      }

      if (outcome.state === 'waiting_user') {
        return { state: 'waiting_user', challenge: outcome.challenge, checkpoint: { stepId: nextStep.id, stepIndex: i, stepOutputs } }
      }

      if (outcome.state === 'retryable_failure') {
        return { state: 'failed', error: outcome.error, retryable: true }
      }

      if (outcome.state === 'terminal_failure') {
        return { state: 'failed', error: outcome.error, retryable: false }
      }
    }

    return { state: 'completed', stepOutputs }
  }
}
