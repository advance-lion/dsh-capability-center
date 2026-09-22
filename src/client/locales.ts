/**
 * Locale dictionaries for the Capability Center UI.
 */

export type CapabilityCenterKey =
  | 'title'
  | 'tabAll'
  | 'tabSkill'
  | 'tabConnector'
  | 'tabPartner'
  | 'search'
  | 'categoryAll'
  | 'categoryFeatured'
  | 'categoryOffice'
  | 'categoryDev'
  | 'categoryResearch'
  | 'categoryData'
  | 'categoryContent'
  | 'categoryTools'
  | 'btnInstall'
  | 'btnConfigure'
  | 'btnEnable'
  | 'btnDisable'
  | 'btnConnect'
  | 'btnDisconnect'
  | 'btnReauth'
  | 'btnLaunch'
  | 'btnOpenDshIm'
  | 'btnRecommendInstall'
  | 'source'
  | 'sourceUrl'
  | 'statusAvailable'
  | 'statusInstalled'
  | 'statusConnected'
  | 'statusDisabled'
  | 'statusExpired'
  | 'statusError'
  | 'providedCapabilities'
  | 'runtimeInfo'
  | 'permissions'
  | 'status'
  | 'type'
  | 'transport'
  | 'path'
  | 'noResults'

export const zh: Record<CapabilityCenterKey, string> = {
  title: '能力中心',
  tabAll: '全部',
  tabSkill: '技能',
  tabConnector: '连接器',
  tabPartner: '伙伴',
  search: '搜索能力…',
  categoryAll: '全部',
  categoryFeatured: '精选',
  categoryOffice: '办公',
  categoryDev: '开发',
  categoryResearch: '研究',
  categoryData: '数据',
  categoryContent: '内容创作',
  categoryTools: '效率工具',
  btnInstall: '安装',
  btnConfigure: '配置',
  btnEnable: '启用',
  btnDisable: '禁用',
  btnConnect: '连接',
  btnDisconnect: '断开连接',
  btnReauth: '重新授权',
  btnLaunch: '启动',
  btnOpenDshIm: '打开 dsh-im',
  btnRecommendInstall: '推荐安装',
  source: '来源',
  sourceUrl: '来源链接',
  statusAvailable: '可安装',
  statusInstalled: '已启用',
  statusConnected: '已连接',
  statusDisabled: '已禁用',
  statusExpired: '已过期',
  statusError: '错误',
  providedCapabilities: '提供能力',
  runtimeInfo: '运行信息',
  permissions: '权限',
  status: '状态',
  type: '类型',
  transport: '实现方式',
  path: '路径 / 接入点',
  noResults: '没有找到匹配的能力',
}

export const en: Record<CapabilityCenterKey, string> = {
  title: 'Capability Center',
  tabAll: 'All',
  tabSkill: 'Skills',
  tabConnector: 'Connectors',
  tabPartner: 'Partners',
  search: 'Search capabilities…',
  categoryAll: 'All',
  categoryFeatured: 'Featured',
  categoryOffice: 'Office',
  categoryDev: 'Development',
  categoryResearch: 'Research',
  categoryData: 'Data',
  categoryContent: 'Content Creation',
  categoryTools: 'Productivity',
  btnInstall: 'Install',
  btnConfigure: 'Configure',
  btnEnable: 'Enable',
  btnDisable: 'Disable',
  btnConnect: 'Connect',
  btnDisconnect: 'Disconnect',
  btnReauth: 'Re-authorize',
  btnLaunch: 'Launch',
  btnOpenDshIm: 'Open dsh-im',
  btnRecommendInstall: 'Recommend Install',
  source: 'Source',
  sourceUrl: 'Source URL',
  statusAvailable: 'Available',
  statusInstalled: 'Enabled',
  statusConnected: 'Connected',
  statusDisabled: 'Disabled',
  statusExpired: 'Expired',
  statusError: 'Error',
  providedCapabilities: 'Provided Capabilities',
  runtimeInfo: 'Runtime Info',
  permissions: 'Permissions',
  status: 'Status',
  type: 'Type',
  transport: 'Transport',
  path: 'Path / Entry Point',
  noResults: 'No matching capabilities found',
}
