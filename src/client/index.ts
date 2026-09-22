/**
 * Browser-half entry for the dsh-capability-center plugin — runs inside the
 * DSH web GUI. Registers the locale dictionary and contributes a first-class
 * main panel (a `main` keyed-slot entry, addressable from the sidebar
 * panellist). The panel hosts the Capability Center UI, which talks to the
 * Host over host.call() RPC.
 *
 * The sidebar automatically picks up registered main-panel keys and renders
 * them as icons in the `sidebar.panellist` row — below the New Session button,
 * exactly like Codex / 豆包工作 entry positions.
 *
 * Failure policy: mounting problems are logged, never thrown — the web shell
 * fails the whole boot when a plugin apply throws, and an external plugin must
 * not take the GUI down.
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the slots merge tables (SlotMap / LocaleNamespaceMap).
import type {} from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the layout service (ctx.layout, MainPanelId) and the
// `main` keyed-slot + `sidebar` slot declarations into SlotMap.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { en, zh, type CapabilityCenterKey } from './locales.ts'
import { CapabilityCenterPanel } from './capability-center.tsx'

/** Locale namespace this plugin owns. */
const NS = 'capability-center'

/** Main panel key — the sidebar panellist addresses this id. */
const PANEL_ID = 'capability-center'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** dsh-capability-center surface copy. */
    'capability-center': CapabilityCenterKey
  }
}

/** Required services (fiber inject waiting — the runtime must be up first). */
export const inject = ['slots', 'locale', 'layout']

/**
 * Mount the Capability Center main panel.
 *
 * The `main` slot is a keyed slot declared by dsh-client-ui-layout. Each
 * registered key becomes a selectable central panel; the sidebar's panellist
 * discovers all registered keys and renders an icon for each. Clicking the
 * icon calls ctx.layout.selectPanel(key), which swaps the central column
 * from the Conversation to our panel.
 *
 * @param ctx - client root context (slots, locale, layout).
 */
export function apply(ctx: ClientContext): void {
  // Register locale dictionaries.
  ctx.effect(
    () => ctx.locale.register(NS, { zh, en }),
    'capability-center: dictionaries',
  )

  // Register the Capability Center as a main panel.
  // `main` is a keyed slot; `key` is the entry key within that slot.
  // The sidebar panellist automatically discovers keyed-slot entries
  // and renders an icon for each. Clicking the icon calls
  // ctx.layout.selectPanel(PANEL_ID), which swaps the central column
  // from the Conversation to our panel.
  //
  // We use ctx.effect + register directly (instead of slots.inject) because
  // the `main` keyed slot is declared by the layout package which loads at
  // boot time, so the declaration is already live when our plugin applies.
  ctx.effect(() => {
    const dispose = ctx.slots.register(
      {
        name: 'main' as never,
        key: PANEL_ID,
        locale: NS,
      } as never,
      CapabilityCenterPanel as never,
    )
    return dispose
  }, 'capability-center: main panel')
}
