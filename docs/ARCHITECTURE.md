# DSH Capability Center 完整架构设计

> 状态：目标架构草案（供评审）  
> 项目：`@wanganxin/dsh-capability-center`  
> 设计日期：2026-09-23  
> 设计目标：把 Skills、CLI、MCP、API、浏览器会话和专业 Provider 统一为可发现、可连接、可验证、可复用的 Capability Layer。

## 1. 执行摘要

能力中心不应继续以 `if (id === 'feishu')` 的方式实现连接按钮。目标系统采用两条接入轨道：

1. **Recipe-managed**：能力中心通过版本化 Recipe 管理没有专业插件托管的 CLI、MCP、API、OAuth、设备码和手工认证。
2. **Provider-managed**：成熟领域插件拥有连接事实和生命周期，能力中心只聚合状态、展示脱敏摘要、委托动作并提供下钻入口。

IM 领域的首选 Provider 为 `@xmanrui/dsh-im`。它继续拥有多账号、Bot、扫码、凭据、连接、诊断、接收开关、工作区、模型、Agent Preset、准入控制和消息运行时。能力中心不得复制这些逻辑或直接修改其内部文件。

核心架构：

```text
官方资料 / Excel / Agent 调研 / 本机成功路径
                    │
                    ▼
             Catalog 候选变更区
                    │ 校验、审核、发布
                    ▼
            Catalog SQLite（知识）
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
Provider Registry          Recipe Engine
(dsh-im 等)             (CLI/MCP/API/OAuth)
        │                       │
        └───────────┬───────────┘
                    ▼
          Connection Aggregator
                    │
                    ▼
              统一能力中心 UI
                    │
                    ▼
          Runtime SQLite（本机事实）
```

交互式架构图见 [`diagrams/capability-center-architecture.html`](diagrams/capability-center-architecture.html)。

## 2. 设计目标与非目标

### 2.1 目标

- 用户按“飞书、Notion、GitHub”等应用理解能力，不必先理解 CLI/MCP/API。
- 每个连接状态都有真实 Evidence，不能由内存按钮状态伪造。
- 支持安装、认证、用户接管、验证、恢复、重新授权和账号切换。
- 复用 dsh-im 等专业插件，不重造领域控制面。
- Catalog 可扩容、可审计、可版本化；Excel 退化为导入与导出格式。
- 用户成功路径可沉淀并在同类环境或切换账号时复用。
- Secret 永不进入 Catalog、Runtime、日志、Session、导出或前端状态。
- 每次自动化都能解释：来源、计划、风险、步骤、证据和失败原因。

### 2.2 非目标

- 不在第一阶段构建公共 Marketplace。
- 不绕过短信、电话、扫码、MFA 或管理员审批。
- 不允许 Catalog Recipe 执行任意未审计脚本。
- 不把“安装成功”“认证成功”“权限齐全”“端到端可用”混成一个状态。
- 不把所有 Provider 的复杂管理 UI 复制到能力中心。

## 3. 架构原则

### 3.1 应用视角优先

默认 UI 按应用聚合：

```text
飞书
├── Lark CLI 用户身份（Recipe-managed）
└── 飞书 IM Bot（dsh-im Provider-managed）
```

高级排错页才按 Provider 和 Transport 展示。

### 3.2 单一事实来源

每个 `ConnectionInstance` 只有一个 Owner：

```ts
type ConnectionOwner =
  | { kind: 'recipe'; recipeId: string; recipeVersionId: string }
  | { kind: 'provider'; providerId: string; externalInstanceId: string }
```

Owner 以外的组件只能读取、缓存和委托，不能直接修改连接事实。

### 3.3 专业 Provider 优先

当成熟插件已经拥有某领域生命周期时，优先 Provider-managed。首个正式委托 Provider 是 `@xmanrui/dsh-im`。

### 3.4 动作必须被声明

UI 不根据平台名猜测“重连、退出、扫码、补权限”。可用动作由 Recipe 当前状态或 Provider 返回的 Action Descriptor 决定。

### 3.5 Evidence 驱动状态

“已连接”必须有可追踪证据：

- CLI：可执行文件 + 认证检查 + 最小验证；
- MCP：initialize + tools/list 或业务 probe；
- API：身份接口或最小只读调用；
- Provider：Provider 返回的实时状态与检查时间。

### 3.6 凭据不跨所有权边界

Secret 留在 DSH Credential Store 或 Owner Provider 中。能力中心仅保存 `credential://` 引用、脱敏身份、scope、到期时间和验证摘要。

## 4. 领域模型

### 4.1 Integration

应用本身，例如 `feishu`、`notion`、`github`。同一应用可以有多个接入方法。

### 4.2 ConnectionMethod

一种官方接入方式，例如：

- `feishu-cli-user`
- `feishu-cli-app`
- `dsh-im-feishu-bot`
- `notion-remote-mcp`

字段包括 Transport、身份类型、平台、来源级别、推荐优先级和 Owner 类型。

### 4.3 CapabilityDefinition

语义能力，例如：

- `feishu.doc.read`
- `feishu.im.message.send`
- `notion.page.read`

ConnectionMethod 与 CapabilityDefinition 是多对多关系，并可声明 required scopes 和 verification probe。

### 4.4 Recipe / RecipeVersion / RecipeStep

Recipe 是逻辑身份；RecipeVersion 是不可变执行定义；RecipeStep 是受限原语。历史 Run 永远指向实际执行的版本。

### 4.5 CapabilityProvider

专业插件向能力中心贡献方法、实例、状态、动作和 Evidence。Provider 可以是 dsh-im、DSH MCP Client 或未来专业集成插件。

### 4.6 ConnectionInstance

本机或当前用户的实际连接，例如：

- 王安欣 / 飞书 CLI 用户身份
- 研发助手 / dsh-im 飞书 Bot
- Notion Workspace A

### 4.7 ConnectionRun / StepRun

一次 `install`、`connect`、`verify`、`reauthorize`、`switch_account`、`repair` 或 `remove` 的可恢复执行记录。

### 4.8 VerificationEvidence

证明状态成立的脱敏证据，含检查类型、结果、时间、Provider/Recipe 版本、环境指纹和到期时间。

### 4.9 LearnedOverride

从成功路径提取的非敏感环境覆盖，例如解析出的可执行路径、成功选项或平台兼容修复。它不是一份复制出来的新脚本。

## 5. 核心组件

### 5.1 Catalog Service

职责：

- 应用、接入方法、能力、官方来源和 Recipe 版本查询；
- 候选变更、校验、审核与发布；
- 来源复查、内容指纹和失效检测；
- Excel 幂等导入与报表导出。

不负责执行连接。

### 5.2 Provider Registry

职责：

- 注册 Provider；
- 读取其能力和兼容范围；
- 路由实例查询、动作和事件；
- 检测 Provider 冲突、失效和版本不兼容。

### 5.3 Connection Aggregator

职责：

- 合并 Catalog、Recipe Runtime、Skills、MCP 和 Provider 贡献；
- 按 Integration 聚合 ConnectionMethod 和 ConnectionInstance；
- 统一状态映射；
- 确定 Owner；
- 缓存最后状态并标注 freshness；
- 计算能力覆盖、权限缺口和冲突。

### 5.4 Connection Orchestrator

职责：

- 接收用户意图；
- 根据 Owner 路由到 Recipe Engine 或 Provider；
- 生成可审查计划；
- 管理暂停、恢复、取消和幂等；
- 记录 ConnectionRun 和 Evidence；
- 处理跨插件流程，如“安装 dsh-im → 打开管理页 → 等待新账号”。

### 5.5 Recipe Engine

职责：

- 加载不可变 RecipeVersion；
- 执行受限 Step；
- 在 `waiting_user` 保存检查点；
- 在重启后恢复；
- 执行重试、超时、补偿和验证；
- 输出脱敏结果。

### 5.6 Step Executor Registry

首批受限原语：

| 类别 | Step 类型 |
|---|---|
| 检测 | `executable.resolve`, `file.exists`, `package.detect`, `http.probe` |
| 安装 | `package.npm.install`, `download.official`, `mcp.register`, `config.patch` |
| 认证 | `oauth.browser`, `oauth.device_code`, `terminal.interactive`, `credential.prompt`, `qr.present`, `manual.wait` |
| 检查 | `command.json`, `api.identity`, `mcp.initialize`, `mcp.tools.list` |
| 验证 | `assert.expression`, `capability.probe`, `provider.verify` |
| 委托 | `provider.require`, `provider.delegate`, `provider.await` |

原语实现必须注册到 Executor Registry；Recipe 不得直接包含任意 JS。

### 5.7 Runtime Store

保存本机实例、Run、StepRun、Evidence、环境覆盖和账号切换历史；不保存 Secret。

### 5.8 Unified UI

主视图：

- 应用
- 连接实例
- Provider
- 待处理认证
- 目录变更与复查

应用详情同时展示多个方法和实例，而不是把 CLI、MCP、Plugin 分成互不相关的卡片。

## 6. Provider SPI

建议接口语义：

```ts
interface CapabilityProvider {
  descriptor(): Promise<ProviderDescriptor>
  listMethods(): Promise<ProviderConnectionMethod[]>
  listConnections(query?: ProviderConnectionQuery): Promise<ProviderConnectionSummary[]>
  inspectConnection(id: string): Promise<ProviderConnectionDetail>
  listActions(target?: ProviderActionTarget): Promise<ProviderAction[]>
  executeAction?(request: ProviderActionRequest): Promise<ProviderActionResult>
  openManager?(target?: ProviderManagerTarget): Promise<void>
  subscribe?(listener: ProviderChangeListener): () => void
}
```

### 6.1 Provider Action

```ts
interface ProviderAction {
  id: string
  label: string
  risk: 'read' | 'write' | 'destructive' | 'navigation'
  presentation: 'inline' | 'delegate' | 'external'
  requiresConfirmation: boolean
}
```

能力中心只能渲染 Provider 声明的动作。

### 6.2 Provider 兼容等级

- L0：检测安装与版本，提供管理入口；
- L1：只读实例和状态聚合；
- L2：委托诊断、重连、暂停等动作；
- L3：Provider 向能力中心 Slot 贡献托管 UI。

第一阶段 dsh-im 目标为 L0（检测 + 导航）；Contract v1 实现后升级为 L1；Provider 声明稳定 Action 后进入 L2；L3 暂不作为必要条件。

## 7. dsh-im 委托托管

### 7.1 所有权

`@xmanrui/dsh-im` 拥有：

- 11 类 IM 渠道；
- 同一渠道多个机器人；
- 扫码、Manifest、Token 和 App Secret；
- Credential Store；
- 连接监督、重试与健康检查；
- 接收开关；
- 工作区、模型、Agent Preset；
- 私聊准入、命令权限和会话映射；
- 主动投递和平台特有诊断。

### 7.2 能力中心展示

能力中心展示脱敏摘要：

- Provider 与版本；
- 平台、机器人别名；
- 在线、暂停、异常；
- 接收开关；
- 最近检查时间；
- 工作区/Agent Preset 的可显示名称；
- 诊断摘要；
- “在 dsh-im 中管理”。

### 7.3 禁止事项

- 不读取或写入 dsh-im 内部 JSON；
- 不保存或代理原始 Secret；
- 不复制扫码和多账号 UI；
- 不自行执行机器人删除或换号；
- 不将 Provider 安装等同于账号已连接。

### 7.4 接入过渡

当前稳定 Host 服务名为 `dshIm`，公开能力只足以完成基础 Bot 发现/投递，不提供完整状态、诊断和管理 Action；丰富管理 RPC 属于 dsh-im 私有实现，能力中心不得导入内部模块或假定其稳定。

1. V0.1 只做 L0：真实检测 `dshIm`、读取包版本并打开 dsh-im 设置入口；
2. 与 dsh-im 共同定义 Redacted Provider Contract v1；
3. dsh-im 明确实现并声明兼容范围后，能力中心才启用 L1 状态聚合；
4. Provider 声明稳定 Action 后再启用 L2；
5. 不使用私有管理 RPC 作为长期 Compatibility Adapter。

### 7.5 dsh-im-connect

`@michengai/dsh-im-connect` 标为兼容 Provider，不作为新建 IM 连接默认入口。已有实例可以按 Provider 归属只读展示。检测到同平台双 Provider 时提示潜在重复接收，不自动禁用、迁移或删除。

## 8. 状态模型与 Recipe 生命周期

状态必须拆成四个正交维度，不能把 Run 阶段与连接事实混在一个枚举里：

1. `desiredState`：用户希望 `connected | paused | removed`；
2. `operationState`：`planning | awaiting_approval | preparing | awaiting_user | authenticating | verifying | retrying | completed | failed | cancelled`；
3. `observedState`：`unknown | not_configured | connected | disconnected | reauth_required | revoked | provider_unavailable`；
4. `healthState`：`unknown | healthy | degraded | unhealthy`。

Provider 保留其 native state，Aggregator 只生成带 `observedAt`、`revision` 和 TTL 的标准投影。快照过期后不得继续支撑实时 `connected`。

Recipe Run 主链：

```text
planning → awaiting_approval → preparing → awaiting_user
→ authenticating → verifying → completed
```

异常与恢复：

```text
preparing/authenticating/verifying
  → retryable_failure → retrying → 原阶段

awaiting_user → cancelled | expired | authenticating

任意可恢复状态 → repairing → verifying
```

连接的 `connected/degraded/revoked` 是 Evidence 推导的 observed/health 状态，不是 Operation 的终态。

### 8.1 状态约束

- `connected` 需要未过期 Evidence；
- `awaiting_user` 必须保存 challenge 的非敏感描述和恢复点；
- 重复 callback、重复扫码确认和重复点击必须幂等；
- 重启后从最后已提交 Step 恢复，不重放已经产生外部副作用的步骤；
- Recipe 更新不会修改正在运行的 Run；
- 删除和注销必须是显式破坏性动作。

## 9. 账号与切换模型

应用、方法、实例分离：

```text
Integration: 飞书
Method: Lark CLI 用户身份
Instances:
  - 王安欣
  - 测试账号

Method: dsh-im 飞书 Bot
Instances:
  - 研发助手
  - 测试助手
```

账号切换优先级：

1. 官方多 Profile；
2. Provider 原生多账号；
3. 独立配置目录/凭据引用；
4. 最后才是 logout + login。

切换策略必须由 Recipe 或 Provider 声明。不能默认所有系统都适用退出登录。若注销后无法自动恢复旧账号，执行前必须说明风险。

## 10. 成功路径学习

### 10.1 保存内容

- Recipe 和版本；
- OS、Shell、CLI 路径与版本；
- 成功步骤序列；
- 用户选择过的非敏感选项；
- 验证方法与 Evidence；
- Provider 版本；
- 脱敏账号/工作区标识；
- 失败分类和已验证修复。

### 10.2 禁止保存

- Access/Refresh Token；
- API Key、密码、Cookie；
- OAuth code、device code；
- 二维码载荷；
- 短信/电话验证码；
- 未经过白名单提取的完整 stdout/stderr。

### 10.3 信任晋升

```text
learned-candidate
→ verified-once
→ verified-local
→ deprecated
```

一次成功只产生 Candidate。至少完成独立复跑、敏感数据扫描和 Recipe 兼容检查后才自动复用。

## 11. SQLite 数据架构

V0.x 采用**一个物理 SQLite 数据库、Catalog/Runtime 逻辑分区**。这样 Recipe 发布、Run 创建、版本快照和 migration 可以在单事务内完成，并保留真实外键。Catalog 的发布/导入/导出仍与本机 Runtime 分离为 Repository 和表前缀；未来只有在出现独立远程 Catalog 服务或跨设备分发需求时才评估物理拆库。

```text
$DSH_HOME/storages/capability-center/
├── capability-center.sqlite
├── backups/
└── exports/
```

实际路径通过 DSH Storage/FS 服务解析。备份必须使用 SQLite backup API 或受控 checkpoint，不可只复制主文件而遗漏 WAL。

### 11.1 Catalog 逻辑分区

核心表：

- `integrations`
- `connection_methods`
- `official_sources`
- `capabilities`
- `method_capabilities`
- `recipes`
- `recipe_versions`
- `recipe_steps`
- `catalog_change_candidates`
- `import_batches`
- `import_rows`

### 11.2 Runtime 逻辑分区

核心表：

- `connection_instances`
- `connection_runs`
- `connection_step_runs`
- `verification_evidence`
- `learned_overrides`
- `provider_snapshots`
- `account_switch_runs`

### 11.3 逻辑分离与历史引用

Catalog 可随插件或远程目录发布；Runtime 属于本机用户，因此 Repository、权限、导出和保留策略必须分开。每个 Run 除外键外还保存 `catalog_release_id`、Method/Recipe 内容摘要和必要的不可变脱敏快照，避免 Catalog 废弃或未来物理拆库后历史无法解释。Catalog GC 不得删除被 Runtime 引用的 RecipeVersion。

详细表结构见 [`DATA-MODEL.md`](DATA-MODEL.md)。

## 12. Catalog 治理

数据来源：

- Excel 导入；
- 官方网站或仓库监测；
- Agent 调研；
- 手工表单；
- 本机成功 Run。

都先进入候选区：

```text
draft → candidate → validated → approved → published → deprecated
```

自动任务负责 URL、版本、内容指纹和复查日期；自动变化不能直接覆盖已发布 Recipe。

现有 Excel 作为首批导入源，使用文件 SHA-256、Sheet、行号和记录 ID 保证幂等。以后支持 SQLite → Excel/CSV/JSON 导出供人工审阅。

## 13. 安全与隐私

### 13.0 管理 API Authority

能力中心的安装、连接、注销、配置和 Provider Action 都是管理操作，不能只依赖“同源 fetch”。Host 必须使用 DSH 原生 authority/connection 边界，或等价落实：登录态、Host/Origin 校验、CSRF、精确 HTTP method、JSON Schema、请求体上限、幂等键、审计 actor 和速率限制。此项是 V0.1 发布阻断条件。

### 13.1 Secret 存储

Secret 只进入 DSH Credential Store 或 Owner Provider。Runtime 仅保存：

```text
credential://provider/account
credential fingerprint
scope
expiration
masked identity
```

### 13.2 执行安全

- 安装和破坏性动作显示完整计划；
- 命令参数结构化，不优先通过 Shell 拼接；
- 官方下载校验来源和可选哈希/签名；
- Token 尽量通过 stdin 或 Credential Service，不进入 argv/query；
- Step 定义风险级别、超时、重试和回滚；
- Provider 动作保留 Owner 的权限检查。

### 13.3 输出清洗

对日志、Toast、异常、Run、Session、导出、剪贴板预览和备份统一执行 Secret Redactor。CLI stdout/stderr 只通过字段白名单提取，不整段落库。账号 hash、credential fingerprint 和 masked identity 仍属于可关联隐私数据，需有分类、用途、保留期限和默认不导出策略。

### 13.4 Catalog 与 Recipe 供应链

显示元数据不能直接升级为可执行内容。Recipe 从 Candidate 进入 Published 必须绑定发布者身份、不可变摘要、信任等级、审核记录和撤销状态。Executor 对命令、包、URL、工作目录、环境变量和网络目标执行 allowlist；安装固定版本，并尽可能验证哈希/签名。官方 URL redirect、DNS 解析和下载目标需防止被转向不可信来源。远程 Catalog 在签名和晋升流程实现前只能提供只读候选。

## 14. 冲突与选择策略

实例身份：

```text
integration + provider + environment/tenant + accountId
```

选择顺序：

1. 用户显式固定；
2. 管理策略固定；
3. 健康且兼容的首选 Provider；
4. 确定性优先级；
5. 若身份或权限边界仍不明确，则 fail closed。

禁止静默切换账号、Provider 或权限边界。

## 15. 可观测性与 SLO

核心指标：

- Catalog 查询延迟；
- Provider snapshot freshness；
- Recipe 各阶段成功率与耗时；
- `waiting_user` 放弃率；
- 认证失败分类；
- 验证成功率；
- 重试与重复副作用拦截数；
- Learned Override 命中与失效率；
- Secret redaction 命中数。

遥测只使用 allowlist，不包含账号原始 ID、消息内容或 Secret。

## 16. 当前代码迁移

当前 `Capability` 把应用、方法、实例和状态压在同一对象中；`CapabilityRegistry.statusMap` 是易失的内存状态；`DefaultCLIAdapter` 有飞书命令硬编码。迁移步骤：

1. 保持现有 UI 可用，新增领域类型；
2. 把 `Capability` 拆为 Integration、Method、Instance View；
3. 引入 Provider Registry 和 Owner；
4. 飞书 CLI 状态改为首条 Recipe；
5. dsh-im 卡片改为 Provider 摘要；
6. 删除 `statusMap` 的事实来源职责；
7. 删除通用 CLI 安装启发式和飞书固定映射；
8. Catalog/Runtime 接入 SQLite；
9. HTTP API 升级为资源化接口并保留一版兼容层。

## 17. API 边界

建议同源 API：

```text
GET  /api/capability-center/integrations
GET  /api/capability-center/integrations/:id
GET  /api/capability-center/connections
GET  /api/capability-center/connections/:id
GET  /api/capability-center/providers
POST /api/capability-center/plans
POST /api/capability-center/runs
GET  /api/capability-center/runs/:id
POST /api/capability-center/runs/:id/resume
POST /api/capability-center/runs/:id/cancel
POST /api/capability-center/provider-actions
GET  /api/capability-center/catalog/candidates
POST /api/capability-center/catalog/imports
```

写操作必须带期望版本或幂等键。Provider 详情和 Secret 不透传。

## 18. 架构决策记录

- ADR-001：应用视角优先，Transport 是实现细节。
- ADR-002：Recipe-managed 与 Provider-managed 双轨。
- ADR-003：每个 ConnectionInstance 只有一个 Owner。
- ADR-004：IM 首选 Provider 为 `@xmanrui/dsh-im`。
- ADR-005：专业配置下钻，不复制 Provider UI。
- ADR-006：动作由 Recipe/Provider 声明，UI 不猜测。
- ADR-007：Catalog 与 Runtime 使用独立 SQLite。
- ADR-008：RecipeVersion 不可变，Run 固定版本。
- ADR-009：成功路径保存为脱敏 Override，而不是任意脚本。
- ADR-010：Secret 只在 Credential Store/Owner Provider。
- ADR-011：状态必须由 Evidence 支撑。
- ADR-012：冲突涉及身份或权限时 fail closed。
- ADR-013：dsh-im Provider Contract v1；禁止依赖内部管理 RPC。
- ADR-014：管理 API 使用 DSH authority + Origin/CSRF + 审计。
- ADR-015：Catalog 可执行内容必须签名、审核、固定摘要并可撤销。
- ADR-016：Operation、Observed、Health、Desired 状态正交分离。
- ADR-017：V0.x 使用单物理 SQLite；历史 Run 保存 Catalog 摘要快照。
- ADR-018：Recipe 表达式为受限非图灵 DSL，不使用动态 JS。
- ADR-019：交互终端通过受控 PTY Broker，支持取消、重连和输出清洗。

## 19. 开放问题

以下内容应在相应版本开始前冻结：

1. dsh-im 精准导航能否使用稳定 route/参数，还是先只能打开设置 Section；
2. dsh-im 是否愿意原生实现 Provider SPI；
3. Catalog 远程更新是否由本仓库托管，及签名机制；
4. 浏览器会话 Executor 的实现归属和隔离方式；
5. SQLite 采用 DSH Storage Domain 还是插件内 SQLite driver；
6. Recipe 发布者、审核者和企业策略模型；
7. 多机器同步时 Catalog 与 Runtime 的同步边界。

这些问题不阻塞 V0.1 的 Schema、Catalog Import 和飞书 Recipe，但阻塞对应生产能力上线。
