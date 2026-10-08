import { describe, expect, it } from 'vitest'
import { DefaultIMRecommendationAdapter } from './im-recommendation-adapter'

describe('IM recommendation does not forge a live bot connection', () => {
  it('does not treat a preset row or a similarly named service as a real provider', async () => {
    const adapter = new DefaultIMRecommendationAdapter({ get(name: string) {
      if (name === 'agentPresets') return { compositionInventory: async () => [{ rows: [{ name: 'dsh-im', disabled: false }] }] }
      if (name === 'dsh.im.connect') return {}
      return undefined
    } })
    expect(await adapter.isInstalled()).toBe(false)
    expect((await adapter.getRecommendation()).status).toBe('available')
  })
  it('a live service means installed, but not a proven connected Feishu bot', async () => {
    const adapter = new DefaultIMRecommendationAdapter({ get: (name: string) => name === 'dshIm' ? { listBots: async () => [] } : undefined })
    expect(await adapter.isInstalled()).toBe(true)
    expect((await adapter.getRecommendation()).status).toBe('installed')
  })
  it('absence of context fails closed', async () => {
    expect((await new DefaultIMRecommendationAdapter().getRecommendation()).status).toBe('available')
  })
})
