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
    // A preset mentioning dsh-im is not a running service and cannot prove
    // that any Feishu IM bot is connected. Only a live provider counts.
    return this.ctx.get('dshIm') !== undefined
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
