/**
 * Static Node host for reviewed repository recipes. A dynamic Host must use
 * the session-policy-aware shell/subprocess services, not import this class.
 * Node exec cancellation targets the spawned shell; full descendant-tree
 * termination is NOT guaranteed here and remains a deployment acceptance gate.
 */
import { execFile, exec as execCb } from 'node:child_process'

export interface ShellSpec {
  command: string
  timeoutMs?: number
  stdoutMaxBytes?: number
  signal?: AbortSignal
}
export interface ShellResult {
  stdout: { text: string; truncated?: boolean }
  stderr: { text: string; truncated?: boolean }
  exitCode: number | null
  timedOut: boolean
  aborted: boolean
}

export class ChildProcessHost {
  readonly subprocess = {
    async resolveExecutable(command: string, signal?: AbortSignal): Promise<string | null> {
      if (!/^[a-zA-Z0-9][a-zA-Z0-9._+-]*$/.test(command)) throw new Error('Invalid executable name')
      if (signal?.aborted) throw new Error('Executable lookup cancelled')
      return new Promise<string | null>((resolve, reject) => {
        execFile(process.platform === 'win32' ? 'where.exe' : 'which', [command],
          { encoding: 'utf8', timeout: 5000, maxBuffer: 16384, windowsHide: true, signal },
          (error, stdout) => {
            if (signal?.aborted) { reject(new Error('Executable lookup cancelled')); return }
            if (!error) { resolve(stdout.trim().split(/\r?\n/)[0] || null); return }
            if (error.code === 1) { resolve(null); return }
            reject(new Error('Executable lookup could not complete'))
          },
        )
      })
    },
  }

  readonly shell = {
    async resolve(request: ShellSpec): Promise<ShellSpec> {
      return { ...request }
    },
    async run(spec: ShellSpec): Promise<ShellResult> {
      const { signal, command, timeoutMs = 15000, stdoutMaxBytes = 524288 } = spec
      if (signal?.aborted) return { stdout: { text: '' }, stderr: { text: '' }, exitCode: null, timedOut: false, aborted: true }
      return new Promise((resolve) => {
        execCb(command, { encoding: 'utf8', timeout: timeoutMs, maxBuffer: stdoutMaxBytes, windowsHide: true, signal },
          (error, stdout, stderr) => {
            // Node may report string infrastructure codes even though this
            // @types/node exec callback narrows code to number. Validate it at runtime.
            const code: unknown = error?.code
            const truncated = code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'
            const aborted = signal?.aborted === true || code === 'ABORT_ERR'
            const timedOut = !!error?.killed && !aborted && !truncated
            resolve({
              stdout: { text: stdout || '', truncated },
              stderr: { text: stderr || '', truncated },
              exitCode: aborted || timedOut ? null : !error ? 0 : typeof code === 'number' ? code : null,
              timedOut, aborted,
            })
          },
        )
      })
    },
  }
}
