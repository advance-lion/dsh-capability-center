/**
 * Child Process Host — provides the shell/subprocess interface that
 * Step Executors expect, using Node.js child_process directly.
 *
 * In the static plugin (real Node.js process), this is the concrete
 * implementation. In a dynamic plugin sandbox, the same interface is
 * provided by ctx.get('shell').
 */

import { execSync, exec as execCb } from 'node:child_process'

export interface ShellSpec {
  command: string
  timeoutMs?: number
  stdoutMaxBytes?: number
}

export interface ShellResult {
  stdout: { text: string; truncated?: boolean }
  stderr: { text: string }
  exitCode: number
}

export class ChildProcessHost {
  readonly subprocess = {
    async resolveExecutable(cmd: string): Promise<string | null> {
      const isWindows = process.platform === 'win32'
      const detectCmd = isWindows ? `where ${cmd} 2>nul` : `which ${cmd} 2>/dev/null`
      try {
        const out = execSync(detectCmd, { encoding: 'utf-8', timeout: 5000, windowsHide: true })
        const path = out.trim().split('\n')[0]
        return path || null
      } catch {
        return null
      }
    },
  }

  readonly shell = {
    async resolve(req: ShellSpec): Promise<ShellSpec> {
      return req
    },

    async run(spec: ShellSpec): Promise<ShellResult> {
      return new Promise((resolve) => {
        execCb(
          spec.command,
          {
            encoding: 'utf-8',
            timeout: spec.timeoutMs ?? 15000,
            maxBuffer: spec.stdoutMaxBytes ?? 524288,
            windowsHide: true,
          },
          (err, stdout, stderr) => {
            resolve({
              stdout: { text: stdout || '' },
              stderr: { text: stderr || '' },
              exitCode: err ? (err as any).status ?? 1 : 0,
            })
          },
        )
      })
    },
  }
}
