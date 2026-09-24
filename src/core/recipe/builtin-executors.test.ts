import { describe, expect, it } from 'vitest'
import type { StepContext } from '../domain/types'
import { assertExpressionExecutor, commandJsonExecutor, executableResolveExecutor } from './builtin-executors'

function context(result: unknown, signal?: AbortSignal): StepContext {
  return { runId: 'synthetic', stepOutputs: {}, signal, host: { shell: { resolve: (request: unknown) => request, run: async () => result } } }
}
const good = { exitCode: 0, stdout: { text: '{"ok":true}' }, stderr: { text: '' } }

describe('command.json fail-closed results', () => {
  it('parses JSON without returning raw stdout/stderr', async () => {
    const result = await commandJsonExecutor.execute(context(good), { command: 'synthetic read' })
    expect(result).toMatchObject({ state: 'completed', output: { json: { ok: true }, exitCode: 0 } })
    if (result.state === 'completed') { expect(result.output).not.toHaveProperty('stdout'); expect(result.output).not.toHaveProperty('stderr') }
  })
  it.each(['', 'not json', '{"ok":'])('rejects empty/malformed JSON %#', async (text) => {
    const result = await commandJsonExecutor.execute(context({ ...good, stdout: { text } }), { command: 'synthetic read', expectError: true })
    expect(result).toMatchObject({ state: 'terminal_failure', error: { code: 'invalid_json' } })
  })
  it.each([undefined, null, NaN])('never defaults an unknown exit code to success %#', async (exitCode) => {
    expect(await commandJsonExecutor.execute(context({ ...good, exitCode }), { command: 'synthetic read' })).toMatchObject({ state: 'terminal_failure', error: { code: 'unknown_exit_code' } })
  })
  it('marks nonzero exits as failures without leaking error text', async () => {
    const result = await commandJsonExecutor.execute(context({ ...good, exitCode: 7, stderr: { text: 'synthetic-secret=do-not-return' } }), { command: 'synthetic read' })
    expect(result).toMatchObject({ state: 'terminal_failure', error: { code: 'command_failed', retryable: false } })
    expect(JSON.stringify(result)).not.toContain('do-not-return')
  })
  it('expectError permits a nonzero exit only as data, preserving the actual code', async () => {
    const result = await commandJsonExecutor.execute(context({ ...good, exitCode: 7 }), { command: 'synthetic read', expectError: true })
    expect(result).toMatchObject({ state: 'completed', output: { exitCode: 7 } })
  })
  it.each([
    [{ timedOut: true }, 'command_timeout'], [{ aborted: true }, 'operation_cancelled'],
    [{ stdout: { text: '{}', truncated: true } }, 'output_truncated'],
    [{ stderr: { text: '', truncated: true } }, 'output_truncated'],
  ])('rejects interruption/truncation even with expectError %#', async (extra, code) => {
    expect(await commandJsonExecutor.execute(context({ ...good, ...extra as object }), { command: 'synthetic read', expectError: true })).toMatchObject({ state: 'terminal_failure', error: { code } })
  })
  it('projects only selected scalar fields and discards credentials and identifiers', async () => {
    const raw = { identity: 'user', user: { status: 'ready', token: 'synthetic-secret', id: 'private-id' } }
    const result = await commandJsonExecutor.execute(context({ ...good, stdout: { text: JSON.stringify(raw) } }), { command: 'synthetic read', select: { identity: 'identity', status: 'user.status' } })
    expect(result).toMatchObject({ state: 'completed', output: { json: { identity: 'user', status: 'ready' } } })
    expect(JSON.stringify(result)).not.toMatch(/synthetic-secret|private-id/)
  })
  it.each([{ bad: '__proto__.value' }, { bad: 'constructor.name' }, { bad: 'user' }])('rejects unsafe paths or nonscalar projection %#', async (select) => {
    const result = await commandJsonExecutor.execute(context({ ...good, stdout: { text: '{"user":{"token":"synthetic-secret"}}' } }), { command: 'synthetic read', select })
    expect(result.state).toBe('terminal_failure')
    expect(JSON.stringify(result)).not.toContain('synthetic-secret')
  })
  it('propagates the abort signal and rejects a late completed command after cancellation', async () => {
    const controller = new AbortController()
    const ctx: StepContext = { runId: 'synthetic', stepOutputs: {}, signal: controller.signal, host: { shell: {
      resolve(request: { signal?: AbortSignal }) { expect(request.signal).toBe(controller.signal); return request },
      async run() { controller.abort(); return good },
    } } }
    expect(await commandJsonExecutor.execute(ctx, { command: 'synthetic read' })).toMatchObject({ state: 'terminal_failure', error: { code: 'operation_cancelled' } })
  })
  it('does not execute a pre-cancelled command', async () => {
    const ctx = context(good, AbortSignal.abort())
    ctx.host = { shell: { resolve() { throw new Error('must not be called') } } }
    expect(await commandJsonExecutor.execute(ctx, { command: 'synthetic read' })).toMatchObject({ state: 'terminal_failure', error: { code: 'operation_cancelled' } })
  })
  it('does not echo thrown command errors', async () => {
    const ctx = context(good)
    ctx.host = { shell: { resolve: () => ({}), run() { throw new Error('synthetic-secret') } } }
    const result = await commandJsonExecutor.execute(ctx, { command: 'synthetic read' })
    expect(result.state).toBe('terminal_failure')
    expect(JSON.stringify(result)).not.toContain('synthetic-secret')
  })
})

describe('assert.expression must terminate a failed recipe', () => {
  it('false is terminal failure, not completed with passed:false', async () => {
    expect(await assertExpressionExecutor.execute(context(good), { expression: { equals: { path: 'absent', value: true } } })).toMatchObject({ state: 'terminal_failure', error: { code: 'assertion_failed' } })
  })
  it('a true assertion produces passed evidence', async () => {
    const ctx = context(good); ctx.stepOutputs = { check: { ready: true } }
    expect(await assertExpressionExecutor.execute(ctx, { expression: { equals: { path: 'check.ready', value: true } } })).toMatchObject({ state: 'completed', output: { passed: true } })
  })
})

describe('executable.resolve', () => {
  it('does not construct a shell fallback from missing detection service', async () => {
    expect(await executableResolveExecutor.execute(context(good), { command: 'tool' })).toMatchObject({ state: 'terminal_failure', error: { code: 'no_executable_service' } })
  })
  it('rejects shell metacharacters before looking up a binary', async () => {
    expect(await executableResolveExecutor.execute(context(good), { command: 'tool & unexpected' })).toMatchObject({ state: 'terminal_failure', error: { code: 'invalid_input' } })
  })
})
