/**
 * Browser-side same-origin API for the Capability Center V0.1.
 *
 * Uses the new /views endpoint for the unified IntegrationView model.
 * Falls back to the compatibility /list endpoint if /views fails.
 */
import type { IntegrationView, ProviderDescriptor, ActionResult, ManagerNavigation } from '../core/domain/types'

const API_ROOT = '/api/capability-center'

export class CapabilityApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CapabilityApiError'
  }
}

async function readJson<T>(response: Response): Promise<T> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new CapabilityApiError(`HTTP ${response.status}: invalid JSON response`)
  }
  if (!response.ok) {
    const message =
      typeof body === 'object' && body !== null &&
      typeof (body as { error?: unknown }).error === 'string'
        ? (body as { error: string }).error
        : `HTTP ${response.status}`
    throw new CapabilityApiError(message)
  }
  return body as T
}

async function get<T>(path: string): Promise<T> {
  return readJson<T>(await fetch(path, { credentials: 'same-origin' }))
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  return readJson<T>(await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }))
}

// ── V0.1 API: IntegrationView ─────────────────────────────

export async function listViews(): Promise<IntegrationView[]> {
  const body = await get<{ views: IntegrationView[] }>(`${API_ROOT}/views`)
  return body.views ?? []
}

export async function getView(integrationId: string): Promise<IntegrationView | null> {
  const body = await get<{ view: IntegrationView | null }>(
    `${API_ROOT}/views/${encodeURIComponent(integrationId)}`,
  )
  return body.view ?? null
}

// ── V0.1 API: Providers ───────────────────────────────────

export async function listProviders(): Promise<ProviderDescriptor[]> {
  const body = await get<{ providers: ProviderDescriptor[] }>(`${API_ROOT}/providers`)
  return body.providers ?? []
}

// ── V0.1 API: Actions ─────────────────────────────────────

export async function executeAction(params: {
  actionId: string
  integrationId?: string
  methodId: string
  externalInstanceId?: string
  input?: Record<string, unknown>
}): Promise<ActionResult & { navigation?: ManagerNavigation }> {
  const body = await post<{ result: ActionResult & { navigation?: ManagerNavigation } }>(
    `${API_ROOT}/action`,
    params,
  )
  return body.result
}

// ── V0.1 API: Recipes ─────────────────────────────────────

export interface RecipeSummary {
  id: string
  version: string
  integrationId: string
  methodId: string
  valid: boolean
  errors: string[]
  warnings: string[]
}

export async function listRecipes(): Promise<RecipeSummary[]> {
  const body = await get<{ recipes: RecipeSummary[] }>(`${API_ROOT}/recipes`)
  return body.recipes ?? []
}
