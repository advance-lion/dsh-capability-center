/**
 * Capability Center V0.1 main-panel UI.
 *
 * Uses the new IntegrationView model from /views endpoint.
 * No hardcoded platform names — all actions come from ActionDescriptor[]
 * returned by the API. No special-casing for specific app IDs.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { IntegrationView, MethodView, ActionDescriptor, ObservedState } from '../core/domain/types'
import { listViews, executeAction } from './api.ts'
import { observedStateLabels, healthStateLabels, observedStateDotClass } from '../core/domain/status'
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

export function CapabilityCenterPanel({ t }: PanelProps) {
  const [views, setViews] = useState<IntegrationView[] | null>(null)
  const [error, setError] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<IntegrationView | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setError('')
    try {
      setViews(await listViews())
    } catch (cause) {
      console.error('[capability-center] load failed:', cause)
      setError(cause instanceof Error ? cause.message : String(cause))
      setViews([])
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const filtered = useMemo(() => (views ?? []).filter((v) => {
    if (activeCategory !== 'all' && !v.integration.categories?.includes(activeCategory)) return false
    const query = search.trim().toLowerCase()
    if (!query) return true
    return [v.integration.name, v.integration.description, ...v.methods.flatMap((m) => m.method.capabilities)]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query))
  }), [views, activeCategory, search])

  const stats = useMemo(() => {
    let total = 0, connected = 0, needsAttention = 0
    for (const v of views ?? []) {
      total++
      connected += v.stats.connected
      needsAttention += v.stats.needsAttention
    }
    return { total, connected, needsAttention }
  }, [views])

  const handleAction = useCallback(async (view: IntegrationView, method: MethodView, action: ActionDescriptor) => {
    setActionLoading(action.id)
    try {
      const result = await executeAction({
        actionId: action.id,
        integrationId: view.integration.id,
        methodId: method.method.id,
      })
      // If navigation, redirect to settings
      if (result.navigation?.type === 'settings-section') {
        // The DSH client runtime handles navigation to settings sections
        // via the slots system — we just inform the user
        console.log('[capability-center] navigate to settings:', result.navigation.target)
      }
      await refresh()
    } catch (cause) {
      console.error('[capability-center] action failed:', cause)
    } finally {
      setActionLoading(null)
    }
  }, [refresh])

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
            <Stat value={stats.total} label={t('allCapabilities')} />
            <Stat value={stats.connected} label={t('readyCapabilities')} />
            {stats.needsAttention > 0 && (
              <Stat value={stats.needsAttention} label={t('needsAttention')} highlight />
            )}
          </div>
        </section>

        <div className={s.toolbar}>
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

        {views === null ? (
          <div className={s.loading}><span className={s.spinner} />{t('loading')}</div>
        ) : error ? (
          <div className={s.empty}>{t('loadError')}: {error}</div>
        ) : filtered.length === 0 ? (
          <div className={s.empty}>{t('noResults')}</div>
        ) : (
          <div className={s.grid}>
            {filtered.map((view) => (
              <IntegrationCard
                key={view.integration.id}
                view={view}
                t={t}
                onClick={() => setSelected(view)}
                onAction={(method, action) => void handleAction(view, method, action)}
                actionLoading={actionLoading}
              />
            ))}
          </div>
        )}

        {selected && (
          <IntegrationDetail
            view={selected}
            t={t}
            onClose={() => setSelected(null)}
            onAction={(method, action) => void handleAction(selected, method, action)}
            actionLoading={actionLoading}
          />
        )}
      </div>
    </main>
  )
}

function Stat({ value, label, highlight }: { value: number; label: string; highlight?: boolean }) {
  return (
    <div className={`${s.stat} ${highlight ? s.statHighlight : ''}`}>
      <strong>{value}</strong><span>{label}</span>
    </div>
  )
}

function IntegrationCard({ view, t, onClick, onAction, actionLoading }: {
  view: IntegrationView
  t: (key: CapabilityCenterKey) => string
  onClick: () => void
  onAction: (method: MethodView, action: ActionDescriptor) => void
  actionLoading: string | null
}) {
  const { integration, methods, stats } = view
  const primaryMethod = methods[0]
  const primaryAction = primaryMethod?.actions[0]

  // Derive overall status from instances
  const overallState: ObservedState = stats.connected > 0 ? 'connected'
    : stats.needsAttention > 0 ? 'reauth_required'
    : 'not_configured'

  return (
    <article className={s.card} onClick={onClick}>
      <div className={s.cardTop}>
        <div className={s.cardIcon}>{integration.icon ?? '⚡'}</div>
        <div className={s.cardInfo}>
          <div className={s.nameRow}>
            <div className={s.cardName}>{integration.name}</div>
            <span className={s.badgeType}>{methods.length} {t('connectionMethods')}</span>
          </div>
          <div className={s.cardDesc}>{integration.description}</div>
        </div>
      </div>
      <div className={s.cardMeta}>
        {methods.map((mv) => (
          <span key={mv.method.id} className={s.badgeTransport}>
            {mv.method.transport.toUpperCase()}
          </span>
        ))}
        {integration.homepageUrl && (
          <a
            className={s.sourceLink}
            href={integration.homepageUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
          >
            ↗ {domain(integration.homepageUrl)}
          </a>
        )}
      </div>
      <div className={s.cardBottom}>
        <div className={s.status}>
          <span className={`${s.statusDot} ${s['status_' + observedStateDotClass(overallState)]}`} />
          {t(stateLabelKey(overallState))}
        </div>
        {primaryAction && primaryMethod && (
          <button
            className={primaryAction.risk === 'read' ? s.btnSecondary : s.btnPrimary}
            disabled={actionLoading === primaryAction.id}
            onClick={(event) => {
              event.stopPropagation()
              onAction(primaryMethod, primaryAction)
            }}
          >
            {actionLoading === primaryAction.id ? t('actionExecuting') : primaryAction.label}
          </button>
        )}
      </div>
    </article>
  )
}

function IntegrationDetail({ view, t, onClose, onAction, actionLoading }: {
  view: IntegrationView
  t: (key: CapabilityCenterKey) => string
  onClose: () => void
  onAction: (method: MethodView, action: ActionDescriptor) => void
  actionLoading: string | null
}) {
  const { integration, methods } = view
  return (
    <div className={s.overlay} onClick={onClose}>
      <section className={s.detail} onClick={(event) => event.stopPropagation()}>
        <header className={s.detailHeader}>
          <div className={s.detailIcon}>{integration.icon ?? '⚡'}</div>
          <div className={s.detailInfo}>
            <div className={s.detailName}>{integration.name}</div>
            <div className={s.detailDesc}>{integration.description}</div>
          </div>
          <button className={s.closeBtn} onClick={onClose}>✕</button>
        </header>
        <div className={s.detailBody}>
          <section className={s.detailSection}>
            <h3 className={s.sectionTitle}>{t('capabilityInfo')}</h3>
            <div className={s.metaGrid}>
              <div className={s.metaLabel}>{t('source')}</div>
              <div className={s.metaValue}>{integration.vendor || integration.name}</div>
              {integration.homepageUrl && <>
                <div className={s.metaLabel}>{t('sourceUrl')}</div>
                <div className={s.metaValue}>
                  <a className={s.detailSourceLink} href={integration.homepageUrl} target="_blank" rel="noopener noreferrer">
                    {integration.homepageUrl} ↗
                  </a>
                </div>
              </>}
            </div>
          </section>

          {methods.map((mv) => (
            <section key={mv.method.id} className={s.detailSection}>
              <h3 className={s.sectionTitle}>
                {mv.method.name}
                <span className={s.badgeType}>
                  {mv.method.ownerKind === 'provider' ? t('providerManaged') : t('recipeManaged')}
                </span>
              </h3>
              <div className={s.metaGrid}>
                <div className={s.metaLabel}>{t('transport')}</div>
                <div className={s.metaValue}>{mv.method.transport.toUpperCase()}</div>
                <div className={s.metaLabel}>{t('identityType')}</div>
                <div className={s.metaValue}>{mv.method.identityType}</div>
              </div>

              {mv.instances.length > 0 && (
                <div className={s.metaGrid}>
                  {mv.instances.map((inst) => (
                    <div key={inst.id} className={s.metaValue}>
                      <span className={`${s.statusDot} ${s['status_' + observedStateDotClass(inst.observedState)]}`} />
                      {inst.displayName} — {t(stateLabelKey(inst.observedState))}
                      {inst.healthState !== 'unknown' && ` (${t(healthLabelKey(inst.healthState))})`}
                    </div>
                  ))}
                </div>
              )}

              {!!mv.method.capabilities.length && (
                <div className={s.capList}>
                  {mv.method.capabilities.map((cap) => (
                    <span key={cap} className={s.capItem}>{cap}</span>
                  ))}
                </div>
              )}

              {mv.actions.length > 0 ? (
                <div className={s.capList}>
                  {mv.actions.map((action) => (
                    <button
                      key={action.id}
                      className={action.risk === 'read' ? s.btnSecondary : s.btnPrimary}
                      disabled={actionLoading === action.id}
                      onClick={() => onAction(mv, action)}
                    >
                      {actionLoading === action.id ? t('actionExecuting') : action.label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className={s.empty}>{t('noActions')}</div>
              )}
            </section>
          ))}
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

function stateLabelKey(state: ObservedState): CapabilityCenterKey {
  switch (state) {
    case 'connected': return 'statusConnected'
    case 'disconnected': return 'statusDisconnected'
    case 'reauth_required': return 'statusReauth'
    case 'revoked': return 'statusRevoked'
    case 'not_configured': return 'statusNotConfigured'
    case 'provider_unavailable': return 'statusUnavailable'
    default: return 'statusUnknown'
  }
}

function healthLabelKey(health: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'): CapabilityCenterKey {
  switch (health) {
    case 'healthy': return 'healthHealthy'
    case 'degraded': return 'healthDegraded'
    case 'unhealthy': return 'healthUnhealthy'
    default: return 'statusUnknown'
  }
}
