/**
 * Client-side API — calls the Host half via host.call() RPC.
 *
 * The Client never touches the filesystem or the network directly.
 * All capability operations go through the Host, which delegates to
 * the appropriate adapter (SkillAdapter, MCPAdapter, CLIAdapter).
 */
import type { Capability } from '../core/capability/types'

/** List capabilities with optional filter. */
export async function listCapabilities(
  host: { call: (method: string, args?: unknown) => Promise<any> },
  filter?: { type?: string; category?: string; search?: string },
): Promise<Capability[]> {
  const res = await host.call('capability.list', filter ?? {})
  return res.capabilities ?? []
}

/** Get a single capability by ID. */
export async function getCapability(
  host: { call: (method: string, args?: unknown) => Promise<any> },
  id: string,
): Promise<Capability | null> {
  const res = await host.call('capability.get', { id })
  return res.capability ?? null
}

/** Install a capability. */
export async function installCapability(
  host: { call: (method: string, args?: unknown) => Promise<any> },
  id: string,
): Promise<void> {
  await host.call('capability.install', { id })
}

/** Uninstall a capability. */
export async function uninstallCapability(
  host: { call: (method: string, args?: unknown) => Promise<any> },
  id: string,
): Promise<void> {
  await host.call('capability.uninstall', { id })
}

/** Enable a capability. */
export async function enableCapability(
  host: { call: (method: string, args?: unknown) => Promise<any> },
  id: string,
): Promise<void> {
  await host.call('capability.enable', { id })
}

/** Disable a capability. */
export async function disableCapability(
  host: { call: (method: string, args?: unknown) => Promise<any> },
  id: string,
): Promise<void> {
  await host.call('capability.disable', { id })
}

/** Connect a connector. */
export async function connectCapability(
  host: { call: (method: string, args?: unknown) => Promise<any> },
  id: string,
): Promise<void> {
  await host.call('capability.connect', { id })
}

/** Disconnect a connector. */
export async function disconnectCapability(
  host: { call: (method: string, args?: unknown) => Promise<any> },
  id: string,
): Promise<void> {
  await host.call('capability.disconnect', { id })
}

/** Health check. */
export async function checkHealth(
  host: { call: (method: string, args?: unknown) => Promise<any> },
  id: string,
): Promise<{ healthy: boolean; message?: string }> {
  return await host.call('capability.health', { id })
}
