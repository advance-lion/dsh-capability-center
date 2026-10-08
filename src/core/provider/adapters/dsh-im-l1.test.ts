import { describe, expect, it } from 'vitest'
import { createDshImL1Provider } from './dsh-im-l1'

describe('dsh-im provider reports only live authoritative bot state', () => {
  it('does not invent a running service from a pinned package version', async () => {
    const provider = createDshImL1Provider({ packageVersion: '4.21.2' })
    expect(await provider.listMethods()).toEqual([])
    expect(await provider.listConnections()).toEqual([])
  })
  it('connected text and available flags cannot impersonate connected=true', async () => {
    const provider = createDshImL1Provider({ dshImService: {
      listBots: async () => [
        { botId: 'offline', state: 'connected', available: true, connected: false, configured: true },
        { botId: 'online', connected: true, configured: true, bot: { name: 'synthetic bot' } },
        { botId: 'invalid', connected: true, configured: false },
        { name: 'no botId', connected: true },
      ],
    } })
    const found = await provider.listConnections()
    expect(found).toHaveLength(3)
    expect(found.find(bot => bot.externalInstanceId === 'offline')?.observedState).toBe('disconnected')
    expect(found.find(bot => bot.externalInstanceId === 'invalid')?.observedState).toBe('disconnected')
    expect(found.find(bot => bot.externalInstanceId === 'online')).toMatchObject({ observedState: 'connected', displayName: 'synthetic bot' })
    expect(JSON.stringify(found)).not.toContain('no botId')
  })
  it('a failing or malformed provider call returns no connected bots', async () => {
    for (const listBots of [async () => { throw new Error('token=synthetic-secret') }, async () => ({ connected: true })]) {
      const provider = createDshImL1Provider({ dshImService: { listBots: listBots as unknown as () => Promise<any[]> } })
      expect(await provider.listConnections()).toEqual([])
    }
  })
})
