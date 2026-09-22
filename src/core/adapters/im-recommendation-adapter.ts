/**
 * IMRecommendationAdapter — recommends dsh-im for IM capabilities.
 *
 * Capability Center does NOT manage IM runtime (Token, Bot, Auth, Connection,
 * Enable/Disable). Those are all handled by the dsh-im plugin.
 *
 * This adapter only:
 * 1. Detects whether dsh-im is installed/loaded (checks ctx for dsh-im service)
 * 2. If not installed: shows a "推荐安装 dsh-im" card
 * 3. If installed: shows an "打开 dsh-im" button that navigates to dsh-im's UI
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
  constructor(private ctx?: any) {}

  async isInstalled(): Promise<boolean> {
    if (!this.ctx) return false
    // Check if the dsh-im service is available in the Cordis context.
    // dsh-im registers as 'dsh.im' or similar service.
    const imService = this.ctx.get('dsh.im')
    if (imService) return true

    // Also check if the dsh-im-connect plugin is loaded.
    const imConnect = this.ctx.get('dsh.im.connect')
    if (imConnect) return true

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
      tags: ['feishu', 'lark', 'im', 'dsh-im'],
      source: 'dsh-im 插件',
      sourcePath: '~/.dsh/plugins/dsh-im/',
      sourceUrl: 'https://open.larksuite.com/document/mcp_open_tools/feishu-cli-let-ai-actually-do-your-work-in-feishu',
      status: installed ? 'installed' : 'available',
      capabilities: ['IM 收发消息', '群聊管理', '卡片消息', '文件上传下载'],
      provider: { name: 'official' },
    }
  }

  async open(): Promise<void> {
    if (!this.ctx) return

    // If dsh-im is installed, navigate to its settings page.
    // dsh-im likely registers a settings section or a main panel.
    const layout = this.ctx.get('dsh.layout') ?? this.ctx.get('layout')
    if (layout?.selectPanel) {
      // Try to select the dsh-im panel if it's registered.
      try {
        layout.selectPanel('dsh-im')
      } catch {
        // If dsh-im doesn't register a main panel, try settings.
        const settings = this.ctx.get('dsh.settings')
        if (settings?.open) {
          settings.open('dsh-im')
        }
      }
    }
  }
}
