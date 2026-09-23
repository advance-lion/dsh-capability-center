/** Capability Center main-panel UI. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Capability, CapabilityType } from '../core/capability/types'
import {
  connectCapability,
  disableCapability,
  disconnectCapability,
  enableCapability,
  installCapability,
  listCapabilities,
} from './api.ts'
import type { CapabilityCenterKey } from './locales.ts'
import * as s from './capability-center.module.css'

interface PanelProps {
  t: (key: CapabilityCenterKey) => string
}

const CATEGORY_KEYS = [
  ['all', 'categoryAll'],
  ['精选', 'categoryFeatured'],
  ['办公', 'categoryOffice'],
  ['开发', 'categoryDev'],
  ['研究', 'categoryResearch'],
  ['数据', 'categoryData'],
  ['内容创作', 'categoryContent'],
  ['效率工具', 'categoryTools'],
  ['其他', 'categoryOther'],
] as const

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

export function CapabilityCenterPanel({ t }: PanelProps) {
  const [capabilities, setCapabilities] = useState<Capability[] | null>(null)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'all' | CapabilityType>('all')
  const [activeCategory, setActiveCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Capability | null>(null)

  const refresh = useCallback(async () => {
    setError('')
    try {
      setCapabilities(await listCapabilities())
    } catch (cause) {
      console.error('[capability-center] discovery failed:', cause)
      setError(cause instanceof Error ? cause.message : String(cause))
      setCapabilities([])
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const filtered = useMemo(() => (capabilities ?? []).filter((cap) => {
    if (activeTab !== 'all' && cap.type !== activeTab) return false
    if (activeCategory !== 'all' && !cap.category?.includes(activeCategory)) return false
    const query = search.trim().toLowerCase()
    if (!query) return true
    return [cap.name, cap.description, cap.source, ...(cap.tags ?? [])]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query))
  }), [capabilities, activeTab, activeCategory, search])

  const counts = useMemo(() => ({
    all: capabilities?.length ?? 0,
    skill: capabilities?.filter((cap) => cap.type === 'skill').length ?? 0,
    connector: capabilities?.filter((cap) => cap.type === 'connector').length ?? 0,
    partner: capabilities?.filter((cap) => cap.type === 'partner').length ?? 0,
  }), [capabilities])

  const ready = capabilities?.filter((cap) =>
    cap.status === 'installed' || cap.status === 'connected',
  ).length ?? 0

  return (
    <main className={s.root}>
      <div className={s.content}>
        <section className={s.hero}>
          <div>
            <div className={s.eyebrow}>DSH Capability Center</div>
            <h1 className={s.title}>{t('title')}</h1>
            <div className={s.subtitle}>{t('subtitle')}</div>
          </div>
          <div className={s.stats}>
            <Stat value={counts.all} label={t('allCapabilities')} />
            <Stat value={ready} label={t('readyCapabilities')} />
          </div>
        </section>

        <div className={s.toolbar}>
          <div className={s.tabs}>
            {(['all', 'skill', 'connector', 'partner'] as const).map((tab) => (
              <button
                key={tab}
                className={tab === activeTab ? s.tabActive : s.tab}
                onClick={() => setActiveTab(tab)}
              >
                {t(tab === 'all' ? 'tabAll' : TYPE_LABELS[tab])}
                <span className={s.tabCount}>{counts[tab]}</span>
              </button>
            ))}
          </div>
          <div className={s.searchRow}>
            <input
              className={s.search}
              placeholder={t('search')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button className={s.refresh} onClick={() => void refresh()} title={t('refresh')}>
              ↻
            </button>
          </div>
        </div>

        <div className={s.categories}>
          {CATEGORY_KEYS.map(([value, key]) => (
            <button
              key={value}
              className={value === activeCategory ? s.catActive : s.cat}
              onClick={() => setActiveCategory(value)}
            >
              {t(key)}
            </button>
          ))}
        </div>

        {capabilities === null ? (
          <div className={s.loading}><span className={s.spinner} />{t('loading')}</div>
        ) : error ? (
          <div className={s.empty}>{t('loadError')}: {error}</div>
        ) : filtered.length === 0 ? (
          <div className={s.empty}>{t('noResults')}</div>
        ) : (
          <div className={s.grid}>
            {filtered.map((cap) => (
              <CapabilityCard
                key={`${cap.type}:${cap.id}`}
                cap={cap}
                t={t}
                onClick={() => setSelected(cap)}
                onAction={(action) => void handleAction(cap.id, action, refresh)}
              />
            ))}
          </div>
        )}

        {selected && (
          <CapabilityDetail
            cap={selected}
            t={t}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </main>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return <div className={s.stat}><strong>{value}</strong><span>{label}</span></div>
}

function CapabilityCard({ cap, t, onClick, onAction }: {
  cap: Capability
  t: (key: CapabilityCenterKey) => string
  onClick: () => void
  onAction: (action: string) => void
}) {
  const action = getCardAction(cap, t)
  return (
    <article className={s.card} onClick={onClick}>
      <div className={s.cardTop}>
        <div className={s.cardIcon}>{cap.icon ?? '⚡'}</div>
        <div className={s.cardInfo}>
          <div className={s.nameRow}>
            <div className={s.cardName}>{cap.name}</div>
            <span className={s.badgeType}>{t(TYPE_LABELS[cap.type])}</span>
          </div>
          <div className={s.cardDesc}>{cap.description}</div>
        </div>
      </div>
      <div className={s.cardMeta}>
        {cap.transport && <span className={s.badgeTransport}>{cap.transport.toUpperCase()}</span>}
        {cap.sourceUrl ? (
          <a
            className={s.sourceLink}
            href={cap.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
            title={cap.sourceUrl}
          >
            ↗ {cap.source ?? domain(cap.sourceUrl)} · {domain(cap.sourceUrl)}
          </a>
        ) : <span className={s.sourceLink}>{cap.source}</span>}
      </div>
      <div className={s.cardBottom}>
        <div className={s.status}>
          <span className={`${s.statusDot} ${s['status_' + cap.status]}`} />
          {t(STATUS_LABELS[cap.status] ?? 'statusAvailable')}
        </div>
        {action && (
          <button
            className={action.primary ? s.btnPrimary : s.btnSecondary}
            onClick={(event) => {
              event.stopPropagation()
              onAction(action.action)
            }}
          >
            {action.label}
          </button>
        )}
      </div>
    </article>
  )
}

function CapabilityDetail({ cap, t, onClose }: {
  cap: Capability
  t: (key: CapabilityCenterKey) => string
  onClose: () => void
}) {
  return (
    <div className={s.overlay} onClick={onClose}>
      <section className={s.detail} onClick={(event) => event.stopPropagation()}>
        <header className={s.detailHeader}>
          <div className={s.detailIcon}>{cap.icon ?? '⚡'}</div>
          <div className={s.detailInfo}>
            <div className={s.detailName}>{cap.name}</div>
            <div className={s.detailDesc}>{cap.description}</div>
          </div>
          <button className={s.closeBtn} onClick={onClose}>✕</button>
        </header>
        <div className={s.detailBody}>
          <section className={s.detailSection}>
            <h3 className={s.sectionTitle}>{t('capabilityInfo')}</h3>
            <div className={s.metaGrid}>
              <div className={s.metaLabel}>{t('type')}</div>
              <div className={s.metaValue}>{t(TYPE_LABELS[cap.type])}</div>
              <div className={s.metaLabel}>{t('source')}</div>
              <div className={s.metaValue}>{cap.source}</div>
              <div className={s.metaLabel}>{t('path')}</div>
              <div className={s.metaValue}><code>{cap.sourcePath}</code></div>
              <div className={s.metaLabel}>{t('status')}</div>
              <div className={s.metaValue}>{t(STATUS_LABELS[cap.status] ?? 'statusAvailable')}</div>
              {cap.sourceUrl && <>
                <div className={s.metaLabel}>{t('sourceUrl')}</div>
                <div className={s.metaValue}>
                  <a className={s.detailSourceLink} href={cap.sourceUrl} target="_blank" rel="noopener noreferrer">
                    {cap.sourceUrl} ↗
                  </a>
                </div>
              </>}
            </div>
          </section>
          {!!cap.capabilities?.length && (
            <section className={s.detailSection}>
              <h3 className={s.sectionTitle}>{t('providedCapabilities')}</h3>
              <div className={s.capList}>
                {cap.capabilities.map((item) => <span key={item} className={s.capItem}>{item}</span>)}
              </div>
            </section>
          )}
        </div>
      </section>
    </div>
  )
}

function domain(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function getCardAction(cap: Capability, t: (key: CapabilityCenterKey) => string) {
  if (cap.type === 'skill') {
    return cap.status === 'disabled'
      ? { action: 'enable', label: t('btnEnable'), primary: true }
      : { action: 'configure', label: t('btnManage'), primary: false }
  }
  if (cap.id === 'lark-im') {
    return { action: 'configure', label: cap.status === 'installed' ? t('btnOpenDshIm') : t('btnRecommendInstall'), primary: false }
  }
  if (cap.type === 'partner') return null
  if (cap.status === 'connected') return { action: 'disconnect', label: t('btnDisconnect'), primary: false }
  if (cap.status === 'installed') return { action: 'configure', label: t('btnManage'), primary: false }
  if (cap.status === 'disabled') return { action: 'enable', label: t('btnEnable'), primary: true }
  if (cap.transport === 'mcp' || cap.transport === 'cli') {
    return { action: 'connect', label: t('btnConnect'), primary: true }
  }
  return null
}

async function handleAction(id: string, action: string, refresh: () => Promise<void>) {
  try {
    if (action === 'install') await installCapability(id)
    if (action === 'enable') await enableCapability(id)
    if (action === 'disable') await disableCapability(id)
    if (action === 'connect') await connectCapability(id)
    if (action === 'disconnect') await disconnectCapability(id)
    await refresh()
  } catch (error) {
    console.error('[capability-center] action failed:', error)
  }
}
