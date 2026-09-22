/**
 * CapabilityCenterPanel — the main panel component rendered in the DSH
 * central column when the user selects "能力中心" from the sidebar.
 *
 * Fetches capabilities from the Host via host.call() RPC and renders
 * the tabbed, searchable, categorized card grid.
 */
import { useState, useEffect, useCallback } from 'react'
import type { Capability, CapabilityType } from '../core/capability/types'
import {
  listCapabilities,
  installCapability,
  enableCapability,
  disableCapability,
  connectCapability,
  disconnectCapability,
} from './api.ts'
import type { CapabilityCenterKey } from './locales.ts'
import * as s from './capability-center.module.css'

/** Props injected by the slot system. */
interface PanelProps {
  t: (key: CapabilityCenterKey) => string
  host: { call: (method: string, args?: unknown) => Promise<any> }
}

const CATEGORIES = [
  'categoryAll',
  'categoryFeatured',
  'categoryOffice',
  'categoryDev',
  'categoryResearch',
  'categoryData',
  'categoryContent',
  'categoryTools',
] as const

const CATEGORY_VALUES: Record<string, string> = {
  categoryAll: 'all',
  categoryFeatured: '精选',
  categoryOffice: '办公',
  categoryDev: '开发',
  categoryResearch: '研究',
  categoryData: '数据',
  categoryContent: '内容创作',
  categoryTools: '效率工具',
}

const TYPE_LABELS: Record<CapabilityType, CapabilityCenterKey> = {
  skill: 'tabSkill',
  connector: 'tabConnector',
  partner: 'tabPartner',
}

const STATUS_LABELS: Record<string, CapabilityCenterKey> = {
  available: 'statusAvailable',
  installed: 'statusInstalled',
  connected: 'statusConnected',
  disabled: 'statusDisabled',
  expired: 'statusExpired',
  error: 'statusError',
}

export function CapabilityCenterPanel({ t, host }: PanelProps) {
  const [capabilities, setCapabilities] = useState<Capability[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'all' | CapabilityType>('all')
  const [activeCategory, setActiveCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Capability | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const caps = await listCapabilities(host)
      setCapabilities(caps)
    } catch (e) {
      console.error('[capability-center] failed to list:', e)
    } finally {
      setLoading(false)
    }
  }, [host])

  useEffect(() => {
    refresh()
  }, [refresh])

  const filtered = capabilities.filter((cap) => {
    if (activeTab !== 'all' && cap.type !== activeTab) return false
    if (activeCategory !== 'all' && !cap.category?.includes(activeCategory))
      return false
    if (search) {
      const q = search.toLowerCase()
      if (
        !cap.name.toLowerCase().includes(q) &&
        !cap.description?.toLowerCase().includes(q)
      )
        return false
    }
    return true
  })

  const counts = {
    all: capabilities.length,
    skill: capabilities.filter((c) => c.type === 'skill').length,
    connector: capabilities.filter((c) => c.type === 'connector').length,
    partner: capabilities.filter((c) => c.type === 'partner').length,
  }

  return (
    <div className={s.root}>
      {/* Header */}
      <div className={s.header}>
        <h1 className={s.title}>{t('title')}</h1>
        <input
          className={s.search}
          placeholder={t('search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Tabs */}
      <div className={s.tabs}>
        {(['all', 'skill', 'connector', 'partner'] as const).map((tab) => (
          <button
            key={tab}
            className={tab === activeTab ? s.tabActive : s.tab}
            onClick={() => setActiveTab(tab)}
          >
            {t(TYPE_LABELS[tab as CapabilityType] ?? ('tabAll' as CapabilityCenterKey))}
            <span className={s.tabCount}>({counts[tab as keyof typeof counts]})</span>
          </button>
        ))}
      </div>

      {/* Categories */}
      <div className={s.categories}>
        {CATEGORIES.map((catKey) => {
          const catValue = CATEGORY_VALUES[catKey]
          return (
            <button
              key={catKey}
              className={catValue === activeCategory ? s.catActive : s.cat}
              onClick={() => setActiveCategory(catValue)}
            >
              {t(catKey as CapabilityCenterKey)}
            </button>
          )
        })}
      </div>

      {/* Grid */}
      {loading ? (
        <div className={s.empty}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div className={s.empty}>{t('noResults')}</div>
      ) : (
        <div className={s.grid}>
          {filtered.map((cap) => (
            <CapabilityCard
              key={cap.id}
              cap={cap}
              t={t}
              onClick={() => setSelected(cap)}
              onAction={(action) => handleAction(host, cap.id, action, refresh)}
            />
          ))}
        </div>
      )}

      {/* Detail overlay */}
      {selected && (
        <CapabilityDetail
          cap={selected}
          t={t}
          onClose={() => setSelected(null)}
          onAction={(action) => {
            handleAction(host, selected.id, action, refresh)
            setSelected(null)
          }}
        />
      )}
    </div>
  )
}

// ===== Card =====
interface CardProps {
  cap: Capability
  t: (key: CapabilityCenterKey) => string
  onClick: () => void
  onAction: (action: string) => void
}

function CapabilityCard({ cap, t, onClick, onAction }: CardProps) {
  const actionBtn = getCardAction(cap, t)
  return (
    <div className={s.card} onClick={onClick}>
      <div className={s.cardTop}>
        <div className={s.cardIcon}>{cap.icon}</div>
        <div className={s.cardInfo}>
          <div className={s.cardName}>{cap.name}</div>
          <div className={s.cardDesc}>{cap.description}</div>
        </div>
      </div>
      <div className={s.cardBadges}>
        <span className={s.badgeType}>{t(TYPE_LABELS[cap.type])}</span>
        {cap.transport && (
          <span className={s.badgeTransport}>{cap.transport.toUpperCase()}</span>
        )}
        {cap.source && (
          <span className={s.badgeSource}>
            {t('source')}: {cap.source}
          </span>
        )}
      </div>
      {cap.sourceUrl && (
        <a
          className={s.sourceLink}
          href={cap.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          title={cap.sourceUrl}
        >
          🔗 {cap.sourceUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}
        </a>
      )}
      <div className={s.cardBottom}>
        <div className={s.status}>
          <span className={`${s.statusDot} ${s['status_' + cap.status]}`} />
          {t(STATUS_LABELS[cap.status] ?? 'statusAvailable')}
        </div>
        {actionBtn && (
          <button
            className={actionBtn.primary ? s.btnPrimary : s.btnSecondary}
            onClick={(e) => {
              e.stopPropagation()
              onAction(actionBtn.action)
            }}
          >
            {actionBtn.label}
          </button>
        )}
      </div>
    </div>
  )
}

// ===== Detail =====
interface DetailProps {
  cap: Capability
  t: (key: CapabilityCenterKey) => string
  onClose: () => void
  onAction: (action: string) => void
}

function CapabilityDetail({ cap, t, onClose, onAction }: DetailProps) {
  const actionBtns = getDetailActions(cap, t)
  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.detail} onClick={(e) => e.stopPropagation()}>
        <div className={s.detailHeader}>
          <div className={s.detailIcon}>{cap.icon}</div>
          <div className={s.detailInfo}>
            <div className={s.detailName}>{cap.name}</div>
            <div className={s.detailDesc}>{cap.description}</div>
          </div>
          <button className={s.closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>
        <div className={s.detailBody}>
          <section className={s.detailSection}>
            <h3 className={s.sectionTitle}>{t('type')} & {t('source')}</h3>
            <div className={s.metaGrid}>
              <div className={s.metaLabel}>{t('type')}</div>
              <div className={s.metaValue}>
                <span className={s.badgeType}>{t(TYPE_LABELS[cap.type])}</span>
                {cap.transport && (
                  <span className={s.badgeTransport}>
                    {cap.transport.toUpperCase()}
                  </span>
                )}
              </div>
              <div className={s.metaLabel}>{t('source')}</div>
              <div className={s.metaValue}>{cap.source}</div>
              <div className={s.metaLabel}>{t('path')}</div>
              <div className={s.metaValue}>
                <code>{cap.sourcePath}</code>
              </div>
              {cap.sourceUrl && (
                <>
                  <div className={s.metaLabel}>{t('sourceUrl')}</div>
                  <div className={s.metaValue}>
                    <a
                      className={s.detailSourceLink}
                      href={cap.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      🔗 {cap.sourceUrl}
                    </a>
                  </div>
                </>
              )}
            </div>
          </section>

          {cap.capabilities && cap.capabilities.length > 0 && (
            <section className={s.detailSection}>
              <h3 className={s.sectionTitle}>{t('providedCapabilities')}</h3>
              <div className={s.capList}>
                {cap.capabilities.map((c) => (
                  <div key={c} className={s.capItem}>
                    <span className={s.check}>✓</span>
                    {c}
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className={s.detailSection}>
            <h3 className={s.sectionTitle}>{t('status')}</h3>
            <div className={s.status}>
              <span className={`${s.statusDot} ${s['status_' + cap.status]}`} />
              {t(STATUS_LABELS[cap.status] ?? 'statusAvailable')}
            </div>
          </section>
        </div>
        {actionBtns.length > 0 && (
          <div className={s.detailActions}>
            {actionBtns.map((btn) => (
              <button
                key={btn.action}
                className={btn.primary ? s.btnPrimary : s.btnSecondary}
                onClick={() => onAction(btn.action)}
              >
                {btn.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ===== Helpers =====
function getCardAction(
  cap: Capability,
  t: (key: CapabilityCenterKey) => string,
): { action: string; label: string; primary: boolean } | null {
  if (cap.type === 'partner') {
    if (cap.status === 'available')
      return { action: 'install', label: t('btnInstall'), primary: false }
    return { action: 'launch', label: t('btnLaunch'), primary: true }
  }
  switch (cap.status) {
    case 'connected':
      return { action: 'configure', label: t('btnConfigure'), primary: false }
    case 'installed':
      return { action: 'disable', label: t('btnDisable'), primary: false }
    case 'disabled':
      return { action: 'enable', label: t('btnEnable'), primary: true }
    case 'available':
      return { action: 'install', label: t('btnInstall'), primary: true }
    case 'expired':
      return { action: 'reauth', label: t('btnReauth'), primary: true }
    default:
      return { action: 'configure', label: t('btnConfigure'), primary: false }
  }
}

function getDetailActions(
  cap: Capability,
  t: (key: CapabilityCenterKey) => string,
): { action: string; label: string; primary: boolean }[] {
  if (cap.type === 'partner') {
    if (cap.status === 'available')
      return [{ action: 'install', label: t('btnInstall'), primary: false }]
    return [
      { action: 'launch', label: t('btnLaunch'), primary: true },
      { action: 'configure', label: t('btnConfigure'), primary: false },
    ]
  }
  switch (cap.status) {
    case 'connected':
      return [
        { action: 'reauth', label: t('btnReauth'), primary: false },
        { action: 'disconnect', label: t('btnDisconnect'), primary: false },
      ]
    case 'installed':
      return [
        { action: 'disable', label: t('btnDisable'), primary: false },
        { action: 'configure', label: t('btnConfigure'), primary: false },
      ]
    case 'disabled':
      return [{ action: 'enable', label: t('btnEnable'), primary: true }]
    case 'available':
      return [{ action: 'install', label: t('btnInstall'), primary: true }]
    case 'expired':
      return [{ action: 'reauth', label: t('btnReauth'), primary: true }]
    default:
      return [{ action: 'configure', label: t('btnConfigure'), primary: false }]
  }
}

async function handleAction(
  host: { call: (method: string, args?: unknown) => Promise<any> },
  id: string,
  action: string,
  refresh: () => void,
) {
  try {
    switch (action) {
      case 'install':
        await installCapability(host, id)
        break
      case 'enable':
        await enableCapability(host, id)
        break
      case 'disable':
        await disableCapability(host, id)
        break
      case 'connect':
        await connectCapability(host, id)
        break
      case 'disconnect':
        await disconnectCapability(host, id)
        break
    }
    refresh()
  } catch (e) {
    console.error('[capability-center] action failed:', e)
  }
}
