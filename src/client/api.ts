/** Browser-side same-origin API for the publishable static plugin. */
import type { Capability } from '../core/capability/types'

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

async function post<T>(path: string): Promise<T> {
  return readJson<T>(await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
  }))
}

export async function listCapabilities(): Promise<Capability[]> {
  const body = await get<{ capabilities: Capability[] }>(`${API_ROOT}/list`)
  return body.capabilities ?? []
}

export async function getCapability(id: string): Promise<Capability | null> {
  const body = await get<{ capability: Capability | null }>(
    `${API_ROOT}/${encodeURIComponent(id)}`,
  )
  return body.capability ?? null
}

export async function installCapability(id: string): Promise<void> {
  await post(`${API_ROOT}/${encodeURIComponent(id)}/install`)
}

export async function uninstallCapability(id: string): Promise<void> {
  await post(`${API_ROOT}/${encodeURIComponent(id)}/uninstall`)
}

export async function enableCapability(id: string): Promise<void> {
  await post(`${API_ROOT}/${encodeURIComponent(id)}/enable`)
}

export async function disableCapability(id: string): Promise<void> {
  await post(`${API_ROOT}/${encodeURIComponent(id)}/disable`)
}

export async function connectCapability(id: string): Promise<void> {
  await post(`${API_ROOT}/${encodeURIComponent(id)}/connect`)
}

export async function disconnectCapability(id: string): Promise<void> {
  await post(`${API_ROOT}/${encodeURIComponent(id)}/disconnect`)
}

export async function checkHealth(
  id: string,
): Promise<{ healthy: boolean; message?: string }> {
  return get(`${API_ROOT}/${encodeURIComponent(id)}/health`)
}
