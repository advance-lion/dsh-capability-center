import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ exec: vi.fn(), execFile: vi.fn(), execSync: vi.fn() }))
vi.mock('node:child_process', () => mocks)
import { ChildProcessHost } from './child-process-host'

beforeEach(() => { vi.resetAllMocks() })
function respond(error: unknown = null, stdout = '{}', stderr = '') {
  mocks.exec.mockImplementation((_command, _options, callback) => { callback(error, stdout, stderr); return {} })
}

describe('ChildProcessHost result fidelity (mocked OS boundary)', () => {
  it('preserves the real numeric exit code instead of reading err.status', async () => {
    respond({ code: 7 })
    expect(await new ChildProcessHost().shell.run({ command: 'synthetic' })).toMatchObject({ exitCode: 7, timedOut: false, aborted: false })
  })
  it('never invents a numeric exit for an infrastructure failure', async () => {
    respond({ code: 'ENOENT' })
    expect(await new ChildProcessHost().shell.run({ command: 'synthetic' })).toMatchObject({ exitCode: null })
  })
  it('preserves a normal zero exit', async () => {
    respond()
    expect(await new ChildProcessHost().shell.run({ command: 'synthetic' })).toMatchObject({ exitCode: 0, timedOut: false, aborted: false })
  })
  it('marks a timeout kill and does not call it ordinary nonzero execution', async () => {
    respond({ code: null, killed: true, signal: 'SIGTERM' })
    expect(await new ChildProcessHost().shell.run({ command: 'synthetic', timeoutMs: 10 })).toMatchObject({ exitCode: null, timedOut: true, aborted: false })
  })
  it('marks output buffer overflow as truncation, not successful JSON or timeout', async () => {
    respond({ code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER', killed: true })
    expect(await new ChildProcessHost().shell.run({ command: 'synthetic' })).toMatchObject({ stdout: { truncated: true }, stderr: { truncated: true }, timedOut: false })
  })
  it('does not start a pre-cancelled process', async () => {
    respond()
    const result = await new ChildProcessHost().shell.run({ command: 'synthetic', signal: AbortSignal.abort() })
    expect(result).toMatchObject({ aborted: true, exitCode: null })
    expect(mocks.exec).not.toHaveBeenCalled()
  })
  it('forwards cancellation and limits to the OS runner', async () => {
    respond()
    const controller = new AbortController()
    await new ChildProcessHost().shell.run({ command: 'synthetic', signal: controller.signal, timeoutMs: 100, stdoutMaxBytes: 512 })
    expect(mocks.exec.mock.calls[0][1]).toMatchObject({ signal: controller.signal, timeout: 100, maxBuffer: 512 })
  })
  it('cancellation is not confused with timeout', async () => {
    respond({ code: 'ABORT_ERR', killed: true })
    expect(await new ChildProcessHost().shell.run({ command: 'synthetic' })).toMatchObject({ aborted: true, timedOut: false, exitCode: null })
  })
  it('lookup uses argv without a shell and returns the first path', async () => {
    mocks.execFile.mockImplementation((_file, _args, _options, callback) => { callback(null, 'one/path\r\ntwo/path\r\n', ''); return {} })
    expect(await new ChildProcessHost().subprocess.resolveExecutable('lark-cli')).toBe('one/path')
    expect(mocks.execFile.mock.calls[0][1]).toEqual(['lark-cli'])
    expect(mocks.execSync).not.toHaveBeenCalled()
  })
  it('a normal not-found detector result returns null', async () => {
    mocks.execFile.mockImplementation((_file, _args, _options, callback) => { callback({ code: 1 }, '', ''); return {} })
    expect(await new ChildProcessHost().subprocess.resolveExecutable('missing')).toBeNull()
  })
  it('does not downgrade an infrastructure detector error into missing executable', async () => {
    mocks.execFile.mockImplementation((_file, _args, _options, callback) => { callback({ code: 'EPERM' }, '', ''); return {} })
    await expect(new ChildProcessHost().subprocess.resolveExecutable('missing')).rejects.toThrow()
  })
})
