/**
 * V0.5: 台账 (Ledger) Importer
 *
 * Imports application connection data from a structured ledger
 * (JSON array) and generates manifest + recipe candidates.
 *
 * Input format (台账 entry):
 *   {
 *     "appName": "飞书",
 *     "appCategory": ["办公", "协作"],
 *     "installMethod": "npm install -g @larksuite/cli",
 *     "binaryName": "lark-cli",
 *     "authMethod": "cli-auth",
 *     "authStatusCommand": "lark-cli auth status --json",
 *     "authLoginCommand": "lark-cli auth login",
 *     "statusJsonPath": "identities.user.status",
 *     "capabilities": ["message.send", "document.read"],
 *     "sourceUrl": "https://open.larksuite.com",
 *     "icon": "🟦",
 *     "description": "飞书协作平台"
 *   }
 *
 * Output:
 *   - CliConnectorManifest (for the CLI adapter)
 *   - RecipeDocument (for the Recipe Engine)
 *
 * The importer is generic: it doesn't know what app it's importing.
 * It reads the ledger entry and generates data files.
 */

import type { RecipeDocument, RecipeStep } from '../domain/types'

export interface LedgerEntry {
  appName: string
  appCategory?: string[]
  installMethod?: string
  binaryName: string
  authMethod?: string
  authStatusCommand?: string
  authLoginCommand?: string
  authLogoutCommand?: string
  statusJsonPath?: string
  capabilities?: string[]
  sourceUrl?: string
  icon?: string
  description?: string
  tags?: string[]
}

export interface ImportedConnector {
  manifest: {
    id: string
    name: string
    binary: string
    installCommand: string
    authStatusCommand: string
    authLoginCommand: string
    authLogoutCommand?: string
    statusJsonPath?: string
    capabilities: string[]
    sourceUrl?: string
    icon?: string
    category?: string[]
    tags?: string[]
    description?: string
  }
  recipe: RecipeDocument
}

/**
 * Convert a ledger entry to a manifest + recipe.
 * The recipe is generated from a template — the same pattern as
 * the feishu recipe, but with the app's specific commands.
 */
export function importLedgerEntry(entry: LedgerEntry): ImportedConnector {
  const id = entry.appName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  const binary = entry.binaryName
  const statusPath = entry.statusJsonPath || 'status'

  // Generate manifest
  const manifest = {
    id,
    name: entry.appName,
    binary,
    installCommand: entry.installMethod || `npm install -g ${binary}`,
    authStatusCommand: entry.authStatusCommand || `${binary} auth status --json`,
    authLoginCommand: entry.authLoginCommand || `${binary} auth login`,
    authLogoutCommand: entry.authLogoutCommand || `${binary} auth logout`,
    statusJsonPath: statusPath,
    capabilities: entry.capabilities || [],
    sourceUrl: entry.sourceUrl,
    icon: entry.icon || '🔌',
    category: entry.appCategory || ['其他'],
    tags: entry.tags || [id],
    description: entry.description || `${entry.appName} 连接器`,
  }

  // Generate recipe from template
  const recipe: RecipeDocument = {
    schemaVersion: 1,
    id: `${id}-cli-user`,
    version: '1.0.0',
    integrationId: id,
    methodId: `${id}-cli-user`,
    platforms: ['win32', 'darwin', 'linux'],
    source: {
      level: 'official-open-source',
      url: entry.sourceUrl || '',
    },
    intents: {
      connect: {
        steps: [
          {
            id: 'detect-cli',
            type: 'executable.resolve',
            with: { command: binary },
            persist: ['found', 'path'],
          },
          {
            id: 'check-not-found',
            type: 'assert.expression',
            when: { not: { exists: { path: 'detect-cli.found' } } },
            with: {
              expression: { equals: { path: 'detect-cli.found', value: false } },
              message: `${binary} 未安装。请运行 ${manifest.installCommand} 安装。`,
            },
          },
          {
            id: 'auth-status',
            type: 'command.json',
            when: { exists: { path: 'detect-cli.found' } },
            with: {
              command: manifest.authStatusCommand,
              timeoutMs: 15000,
              stdoutMaxBytes: 524288,
              expectError: true,
            },
            persist: ['json', 'exitCode'],
          },
          {
            id: 'assert-authenticated',
            type: 'assert.expression',
            when: { exists: { path: 'auth-status.json' } },
            with: {
              expression: {
                any: [
                  { equals: { path: `auth-status.json.${statusPath}`, value: 'logged_in' } },
                  { equals: { path: `auth-status.json.${statusPath}`, value: 'ready' } },
                  { equals: { path: `auth-status.json.${statusPath}`, value: 'needs_refresh' } },
                ],
              },
              message: `${entry.appName} CLI 未登录。请运行 ${manifest.authLoginCommand} 完成认证。`,
            },
          },
        ],
      },
      verify: {
        steps: [
          {
            id: 'recheck-auth',
            type: 'command.json',
            with: {
              command: manifest.authStatusCommand,
              timeoutMs: 15000,
              stdoutMaxBytes: 524288,
              expectError: true,
            },
            persist: ['json', 'exitCode'],
          },
          {
            id: 'assert-still-authed',
            type: 'assert.expression',
            when: { exists: { path: 'recheck-auth.json' } },
            with: {
              expression: {
                any: [
                  { equals: { path: `recheck-auth.json.${statusPath}`, value: 'logged_in' } },
                  { equals: { path: `recheck-auth.json.${statusPath}`, value: 'ready' } },
                  { equals: { path: `recheck-auth.json.${statusPath}`, value: 'needs_refresh' } },
                ],
              },
              message: `${entry.appName} CLI 认证已失效，需要重新登录。`,
            },
          },
        ],
      },
      reauthorize: {
        steps: [
          {
            id: 'login',
            type: 'terminal.interactive',
            with: {
              command: manifest.authLoginCommand,
              message: `请在终端中完成 ${entry.appName} 登录认证`,
            },
            userAction: 'complete-login',
            timeoutMs: 300000,
          },
          {
            id: 'verify-after-login',
            type: 'command.json',
            with: {
              command: manifest.authStatusCommand,
              timeoutMs: 15000,
              stdoutMaxBytes: 524288,
              expectError: true,
            },
            persist: ['json'],
          },
          {
            id: 'assert-login-success',
            type: 'assert.expression',
            when: { exists: { path: 'verify-after-login.json' } },
            with: {
              expression: {
                any: [
                  { equals: { path: `verify-after-login.json.${statusPath}`, value: 'logged_in' } },
                  { equals: { path: `verify-after-login.json.${statusPath}`, value: 'ready' } },
                ],
              },
              message: '登录后认证状态仍不正常',
            },
          },
        ],
      },
    },
  }

  return { manifest, recipe }
}

/**
 * Bulk import multiple ledger entries.
 */
export function importLedger(entries: LedgerEntry[]): ImportedConnector[] {
  return entries.map(importLedgerEntry)
}
