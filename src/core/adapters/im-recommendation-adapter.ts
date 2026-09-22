/**
 * IMRecommendationAdapter — recommends dsh-im for IM capabilities.
 *
 * Capability Center does NOT manage IM runtime (Token, Bot, Auth, Connection,
 * Enable/Disable). Those are all handled by the dsh-im plugin.
 *
 * This adapter only:
 * 1. Detects whether dsh-im is installed
 * 2. If not, shows a "推荐安装 dsh-im" card
 * 3. If yes, shows an "打开 dsh-im" button
 */
import type { Capability } from '../capability/types'

export interface IMRecommendationAdapter {
  /** Check whether dsh-im is installed. */
  isInstalled(): Promise<boolean>

  /** Get the recommendation capability card. */
  getRecommendation(): Promise<Capability>

  /** Open dsh-im (navigate to its UI). */
  open(): Promise<void>
}

export class DefaultIMRecommendationAdapter implements IMRecommendationAdapter {
  async isInstalled(): Promise<boolean> {
    // TODO: check if dsh-im plugin is loaded
    return false
  }

  async getRecommendation(): Promise<Capability> {
    const installed = await this.isInstalled()
    return {
      id: 'lark-im',
      type: 'skill', // displayed as "IM 推荐" in the UI
      name: '飞书 IM',
      description: '通过 dsh-im 提供飞书即时通讯能力',
      icon: '💬',
      category: ['办公'],
      source: 'dsh-im 插件',
      sourcePath: '~/.dsh/plugins/dsh-im/',
      sourceUrl: 'https://open.larksuite.com/document/mcp_open_tools/feishu-cli-let-ai-actually-do-your-work-in-feishu',
      status: installed ? 'installed' : 'available',
      capabilities: ['IM 收发消息', '群聊管理', '卡片消息'],
    }
  }

  async open(): Promise<void> {
    // TODO: navigate to dsh-im settings page
  }
}
