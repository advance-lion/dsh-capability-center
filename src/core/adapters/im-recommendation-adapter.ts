/** Read-only recommendation bridge for dsh-im. */
import type { Capability } from '../capability/types'

export interface IMRecommendationAdapter {
  isInstalled(): Promise<boolean>
  getRecommendation(): Promise<Capability>
  open(): Promise<void>
}

export class DefaultIMRecommendationAdapter implements IMRecommendationAdapter {
  constructor(private ctx?: any) {}

  async isInstalled(): Promise<boolean> {
    if (!this.ctx) return false
    if (this.ctx.get('dsh.im') || this.ctx.get('dsh.im.connect')) return true

    const presets = this.ctx.get('agentPresets') as
      | { compositionInventory(): Promise<Array<{ rows?: Array<Record<string, unknown>> }>> }
      | undefined
    if (!presets?.compositionInventory) return false

    try {
      const inventory = await presets.compositionInventory()
      return inventory.some((preset) => preset.rows?.some((row) => {
        const candidate = String(
          row.name ?? row.moduleName ?? row.plugin ?? row.package ?? '',
        ).toLowerCase()
        return row.disabled !== true && candidate.includes('dsh-im')
      }))
    } catch {
      return false
    }
  }

  async getRecommendation(): Promise<Capability> {
    const installed = await this.isInstalled()
    return {
      id: 'lark-im',
      type: 'connector',
      name: '飞书 IM',
      description: '通过 dsh-im 提供飞书即时通讯能力',
      icon: '💬',
      category: ['办公'],
      tags: ['feishu', 'lark', 'im', 'dsh-im'],
      source: 'dsh-im 插件',
      sourcePath: '@xmanrui/dsh-im',
      sourceUrl: 'https://open.larksuite.com/document/mcp_open_tools/feishu-cli-let-ai-actually-do-your-work-in-feishu',
      status: installed ? 'installed' : 'available',
      capabilities: ['IM 收发消息', '群聊管理', '卡片消息', '文件上传下载'],
      provider: { name: 'official' },
    }
  }

  /** Navigation belongs to the Client half; Host remains read-only here. */
  async open(): Promise<void> {}
}
