/** Browser half: explicit sidebar entry plus keyed main panel. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { ComponentType } from 'react'
import { createElement } from 'react'
import { en, zh, type CapabilityCenterKey } from './locales.ts'
import { CapabilityCenterPanel } from './capability-center.tsx'
import * as s from './capability-center.module.css'

const NS = 'capability-center'
const PANEL_ID = 'capability-center'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'capability-center': CapabilityCenterKey
  }
}

interface PanelIconProps {
  size: number
  active: boolean
}

function CapabilityCenterIcon({ size, active }: PanelIconProps) {
  return createElement(
    'span',
    { className: active ? `${s.navIcon} ${s.navIconActive}` : s.navIcon },
    createElement(
      'svg',
      {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.8,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
      },
      createElement('rect', { x: 3, y: 3, width: 7, height: 7, rx: 1.5 }),
      createElement('rect', { x: 14, y: 3, width: 7, height: 7, rx: 1.5 }),
      createElement('rect', { x: 3, y: 14, width: 7, height: 7, rx: 1.5 }),
      createElement('path', { d: 'M14 17.5h7M17.5 14v7' }),
    ),
  )
}

export const inject = ['slots', 'locale', 'layout']

export function apply(ctx: ClientContext): void {
  ctx.effect(
    () => ctx.locale.register(NS, { zh, en }),
    'capability-center: dictionaries',
  )

  ctx.effect(
    () => ctx.slots.register(
      {
        name: 'sidebar.panellist' as never,
        id: PANEL_ID,
        order: -100,
        label: () => ctx.locale.bind(NS)('title'),
      } as never,
      CapabilityCenterIcon as ComponentType<any> as never,
    ),
    'capability-center: sidebar entry',
  )

  // `main` is keyed and currently absent from the generic inject key union in
  // the rc type package; runtime inspection confirms this exact contract.
  ctx.effect(
    () => ctx.slots.register(
      { name: 'main' as never, key: PANEL_ID, locale: NS } as never,
      CapabilityCenterPanel as never,
    ),
    'capability-center: main panel',
  )
}
