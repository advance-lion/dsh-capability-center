/** Locale dictionaries for Capability Center V0.1. */
export type CapabilityCenterKey =
  | 'title' | 'subtitle' | 'allCapabilities' | 'readyCapabilities' | 'needsAttention'
  | 'search' | 'refresh' | 'loading' | 'loadError'
  | 'categoryAll' | 'categoryFeatured' | 'categoryOffice'
  | 'categoryDev' | 'categoryResearch' | 'categoryData'
  | 'categoryContent' | 'categoryTools' | 'categoryOther'
  | 'btnConnect' | 'btnReauth' | 'btnVerify' | 'btnManage' | 'btnOpenSettings'
  | 'source' | 'sourceUrl' | 'officialSource'
  | 'statusConnected' | 'statusDisconnected' | 'statusReauth' | 'statusRevoked'
  | 'statusNotConfigured' | 'statusUnknown' | 'statusUnavailable'
  | 'healthHealthy' | 'healthDegraded' | 'healthUnhealthy'
  | 'providedCapabilities' | 'connectionMethods' | 'instances'
  | 'capabilityInfo' | 'methodInfo' | 'noResults'
  | 'providerManaged' | 'recipeManaged' | 'transport' | 'identityType'
  | 'actions' | 'noActions' | 'actionExecuting' | 'actionFailed'

export const zh: Record<CapabilityCenterKey, string> = {
  title: '能力中心', subtitle: '统一发现、连接和管理你的 Agent 能力',
  allCapabilities: '全部应用', readyCapabilities: '已连接', needsAttention: '需要关注',
  search: '搜索应用名称或能力', refresh: '刷新', loading: '正在加载能力列表…', loadError: '加载失败',
  categoryAll: '全部', categoryFeatured: '精选', categoryOffice: '办公',
  categoryDev: '开发', categoryResearch: '研究', categoryData: '数据',
  categoryContent: '内容创作', categoryTools: '效率工具', categoryOther: '其他',
  btnConnect: '连接', btnReauth: '重新认证', btnVerify: '验证', btnManage: '管理', btnOpenSettings: '打开设置',
  source: '来源', sourceUrl: '来源链接', officialSource: '官方来源',
  statusConnected: '已连接', statusDisconnected: '已断开', statusReauth: '需要重新认证',
  statusRevoked: '已撤销', statusNotConfigured: '未配置', statusUnknown: '未知', statusUnavailable: '不可用',
  healthHealthy: '健康', healthDegraded: '降级', healthUnhealthy: '异常',
  providedCapabilities: '提供能力', connectionMethods: '连接方式', instances: '连接实例',
  capabilityInfo: '应用信息', methodInfo: '连接方式信息', noResults: '没有找到匹配的应用',
  providerManaged: 'Provider 托管', recipeManaged: 'Recipe 管理',
  transport: '传输方式', identityType: '身份类型',
  actions: '可用操作', noActions: '暂无可用操作',
  actionExecuting: '正在执行…', actionFailed: '操作失败',
}

export const en: Record<CapabilityCenterKey, string> = {
  title: 'Capability Center', subtitle: 'Discover, connect, and manage Agent capabilities in one place',
  allCapabilities: 'All Apps', readyCapabilities: 'Connected', needsAttention: 'Needs Attention',
  search: 'Search apps or capabilities', refresh: 'Refresh', loading: 'Loading capabilities…', loadError: 'Failed to load',
  categoryAll: 'All', categoryFeatured: 'Featured', categoryOffice: 'Office',
  categoryDev: 'Development', categoryResearch: 'Research', categoryData: 'Data',
  categoryContent: 'Content Creation', categoryTools: 'Productivity', categoryOther: 'Other',
  btnConnect: 'Connect', btnReauth: 'Re-authorize', btnVerify: 'Verify', btnManage: 'Manage', btnOpenSettings: 'Open Settings',
  source: 'Source', sourceUrl: 'Source URL', officialSource: 'Official Source',
  statusConnected: 'Connected', statusDisconnected: 'Disconnected', statusReauth: 'Re-auth Required',
  statusRevoked: 'Revoked', statusNotConfigured: 'Not Configured', statusUnknown: 'Unknown', statusUnavailable: 'Unavailable',
  healthHealthy: 'Healthy', healthDegraded: 'Degraded', healthUnhealthy: 'Unhealthy',
  providedCapabilities: 'Provided Capabilities', connectionMethods: 'Connection Methods', instances: 'Instances',
  capabilityInfo: 'App Information', methodInfo: 'Method Information', noResults: 'No matching apps found',
  providerManaged: 'Provider-managed', recipeManaged: 'Recipe-managed',
  transport: 'Transport', identityType: 'Identity Type',
  actions: 'Available Actions', noActions: 'No actions available',
  actionExecuting: 'Executing…', actionFailed: 'Action failed',
}
