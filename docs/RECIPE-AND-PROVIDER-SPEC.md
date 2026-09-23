# Recipe Engine 与 Capability Provider SPI 设计

## 1. 双轨执行模型

```ts
type ManagementMode = 'recipe-managed' | 'provider-managed'
```

- Recipe-managed：Connection Orchestrator 创建 Run，Recipe Engine 执行 Step。
- Provider-managed：Orchestrator 调用 Provider Action，等待 Provider Evidence。
- 同一 Integration 可以同时拥有两种模式，例如飞书 CLI 与 dsh-im Bot。

## 2. Recipe 文档

建议 Recipe 在审核和发布层使用 JSON/YAML；发布后编译为 Catalog 表。

```yaml
schemaVersion: 1
id: feishu-cli-user
version: 1.0.0
integrationId: feishu
methodId: feishu-cli-user
platforms: [windows, macos, linux]
source:
  level: official-open-source
  url: https://github.com/larksuite/cli
intents:
  connect:
    steps:
      - id: detect-cli
        type: executable.resolve
        with:
          command: lark-cli
      - id: inspect-auth
        type: command.json
        with:
          argv: [lark-cli, auth, status]
          persist: [appId, brand, identity, identities.bot.status,
                    identities.user.status, identities.user.expiresAt]
      - id: login
        type: terminal.interactive
        when: "steps.inspect-auth.output.ready != true"
        with:
          argv: [lark-cli, auth, login]
        userAction: browser-or-terminal
      - id: verify
        type: assert.expression
        with:
          any:
            - path: identities.bot.status
              equals: ready
            - path: identities.user.status
              in: [ready, needs_refresh]
```

### 2.1 Recipe 约束

- `id + version` 唯一且不可变；
- 每个 Step 类型必须已注册；
- 参数必须通过 Executor 输入 Schema；
- 不能引用任意 JavaScript；
- 命令优先 argv 数组，禁止未转义 Shell 拼接；
- `persist` 使用字段白名单；
- destructive Step 必须声明确认与补偿；
- 验证 Step 必须产生 Evidence。

## 3. Step Executor Contract

```ts
interface StepExecutor<I, O, P> {
  type: string
  inputSchema: JsonSchema
  persistedOutputSchema: JsonSchema
  risk(input: I): StepRisk
  prepare(ctx: StepContext, input: I): Promise<PreparedStep<I>>
  execute(ctx: StepContext, input: I): Promise<StepOutcome<O>>
  resume?(ctx: StepContext, checkpoint: P): Promise<StepOutcome<O>>
  compensate?(ctx: StepContext, output: O): Promise<void>
  redact(output: O): PersistedStepOutput
}
```

`StepOutcome`：

```ts
type StepOutcome<O> =
  | { state: 'completed'; output: O; evidence?: EvidenceInput[] }
  | { state: 'waiting_user'; challenge: UserChallenge; checkpoint: unknown }
  | { state: 'retryable_failure'; error: StructuredError; retryAfterMs?: number }
  | { state: 'terminal_failure'; error: StructuredError }
```

## 4. User Challenge

```ts
type UserChallenge =
  | { type: 'browser'; url: string; message: string }
  | { type: 'device_code'; verificationUrl: string; displayCode: string; expiresAt: string }
  | { type: 'qr'; renderRef: string; expiresAt: string }
  | { type: 'terminal'; terminalRunRef: string; message: string }
  | { type: 'credential'; credentialKind: string; fields: CredentialField[] }
  | { type: 'phone'; message: string }
  | { type: 'manual'; instructions: string; officialUrl?: string }
```

持久化时：

- device code、二维码载荷和验证码不落库；
- 只保存 challenge 类型、到期时间、恢复句柄和非敏感说明；
- 前端刷新后通过 Run API 重新获得仍有效的展示对象。

## 5. Orchestrator 幂等与恢复

### 5.1 Run 创建

`POST /runs` 接收 `idempotencyKey`。相同 key 的并发请求返回同一个 Run。

### 5.2 Step 提交

每个产生外部副作用的 Step 在执行前写入 `started`，完成后在同一事务中写入 output + checkpoint。重启恢复时：

- read-only Step 可安全重跑；
- idempotent write Step 使用远端 idempotency key；
- 不可判定结果的 Step 进入 `needs_reconciliation`，先检查远端状态；
- 绝不盲目重放可能重复创建资源的动作。

### 5.3 取消

取消只停止当前自动化，不绕过 Owner 的语义：

- OAuth/device polling 停止；
- interactive terminal 按 Provider/Terminal 协议终止；
- 已安装软件不会自动卸载，除非 Recipe 有显式补偿且用户同意；
- Provider-delegated 操作通过 Provider cancel 能力决定。

## 6. 标准状态

```ts
type ConnectionStatus =
  | 'unknown'
  | 'not_configured'
  | 'planning'
  | 'awaiting_approval'
  | 'preparing'
  | 'awaiting_user'
  | 'authenticating'
  | 'verifying'
  | 'connected'
  | 'degraded'
  | 'paused'
  | 'permission_required'
  | 'reauth_required'
  | 'revoked'
  | 'provider_unavailable'
  | 'failed'
  | 'removed'
```

Provider 可使用自己的内部状态，但 Adapter 必须返回标准状态及原始状态代码。

## 7. Provider SPI Schema

```ts
interface ProviderDescriptor {
  id: string
  name: string
  packageName?: string
  version: string
  managementMode: 'delegated'
  compatibility: { capabilityCenter: string; dsh?: string }
  trust: 'bundled' | 'installed-plugin' | 'external'
  homepage?: string
  levels: Array<'discover' | 'read' | 'actions' | 'ui'>
}

interface ProviderConnectionMethod {
  id: string
  integrationId: string
  name: string
  identityType: string
  transport: string
  capabilities: string[]
  accountCardinality: 'single' | 'multiple'
}

interface ProviderConnectionSummary {
  externalInstanceId: string
  methodId: string
  integrationId: string
  displayName: string
  status: ConnectionStatus
  rawStatus?: string
  observedAt: string
  receiveEnabled?: boolean
  health?: 'healthy' | 'degraded' | 'unknown'
  capabilityIds?: string[]
  safeMetadata?: Record<string, string | number | boolean | null>
}

interface ProviderAction {
  id: string
  label: string
  target: 'provider' | 'method' | 'instance'
  risk: 'read' | 'write' | 'destructive' | 'navigation'
  presentation: 'inline' | 'delegate' | 'external'
  requiresConfirmation: boolean
  inputSchema?: JsonSchema
}
```

## 8. Provider 注册生命周期

```ts
providerRegistry.register(provider) → disposer
```

要求：

- 注册和事件监听属于当前 Fiber；
- Provider 卸载时立即标记 snapshot 失去实时性；
- Provider API 返回 owned JSON，不泄露 Cordis live object；
- Provider event 只发送稳定 ID 和变更类型，Aggregator 再获取详情；
- 同一 Provider ID 多版本同时出现时不静默覆盖。

## 9. dsh-im Provider 适配

### 9.1 方法贡献

每个渠道贡献一个 ConnectionMethod：

```text
dsh-im-feishu-bot
dsh-im-weixin
dsh-im-wecom-bot
dsh-im-dingtalk-bot
dsh-im-qq-bot
dsh-im-slack-bot
...
```

### 9.2 实例摘要

映射 dsh-im 已有字段：

```text
platform        → integrationId / methodId
account alias   → displayName
connected       → connected/disconnected
receiveEnabled  → connected/paused 的辅助状态
lastCheckedAt   → observedAt
workspace/preset→ safeMetadata（只展示名称，不暴露路径）
```

### 9.3 第一阶段动作

- `diagnose`：若正式 API 支持；
- `open-manager`：必须支持；
- `add-account`：先用精准导航委托；
- 其他重连、删除、接收开关在 Provider SPI 稳定后开放。

### 9.4 添加账号编排

```yaml
- type: provider.require
  with: { providerId: dsh-im }
- type: provider.delegate
  with: { providerId: dsh-im, action: add-account, integrationId: feishu }
- type: provider.await
  with:
    providerId: dsh-im
    event: connection.created
    match: { integrationId: feishu }
    timeoutMs: 900000
- type: provider.verify
  with: { check: connection-health }
```

## 10. 账号切换

```ts
interface AccountSwitchStrategy {
  id: 'provider-native' | 'profile' | 'credential-select' | 'logout-login'
  reversible: boolean
  preservesPreviousCredential: boolean
  plan(from?: ConnectionInstance, to?: ConnectionInstance): Promise<ConnectionPlan>
}
```

优先 Provider-native。dsh-im 已支持多机器人，应添加或选择实例，不采用 logout/login。

## 11. Evidence Contract

```ts
interface VerificationEvidence {
  type: 'identity' | 'auth' | 'scope' | 'health' | 'capability-probe'
  result: 'passed' | 'failed' | 'unknown'
  observedAt: string
  expiresAt?: string
  producer: { id: string; version?: string }
  payload: Record<string, string | number | boolean | null | string[]>
}
```

Evidence Payload 必须通过 Schema 和 Redactor。Provider 自报 `connected` 仍应带 observedAt；超过 TTL 后 UI 显示“最后状态”，不能继续算实时在线。

## 12. Structured Error

```ts
interface StructuredError {
  category:
    | 'not_installed' | 'auth' | 'permission' | 'network' | 'timeout'
    | 'rate_limit' | 'provider' | 'invalid_response' | 'conflict'
    | 'cancelled' | 'unknown'
  code: string
  message: string
  retryable: boolean
  remediation?: Array<{ label: string; actionId: string }>
  safeDetails?: Record<string, unknown>
}
```

错误应可操作，但必须先清洗 Secret。

## 13. 示例 Recipe 覆盖

### 飞书 CLI

- `executable.resolve`
- `command.json auth status`
- `terminal.interactive auth login`
- `assert.expression`
- 最小只读 probe

### Notion Remote MCP

- `mcp.register`
- `oauth.browser`
- `mcp.initialize`
- `mcp.tools.list`
- 可选 `notion.identity` probe

### WPS 365

- `executable.resolve`
- `terminal.interactive config init`
- `oauth.device_code`
- `command.json user me`

### GitHub Token

- `credential.prompt`
- `credential.store`
- `api.identity GET /user`
- scope 与 resource owner 验证

### QQ 邮箱网页后备

- `manual.wait` / 浏览器 Executor
- 隔离 Profile
- 官方页面登录
- 会话健康检查
- 不读取 Cookie 或密码

## 14. Provider 协议硬化

### 14.1 调用边界

Provider SPI 所有方法必须接受 `AbortSignal` 和 `deadlineMs`。`listConnections` 支持分页游标和 `sinceRevision` 增量。事件订阅使用单调递增 `revision`。Provider 不可用时 Aggregator 标记 `provider_unavailable`，不阻塞其他 Provider 查询。

### 14.2 Action 结果与异步句柄

```ts
type ProviderActionResult =
  | { state: 'completed'; evidence?: EvidenceInput[]; revision: number }
  | { state: 'async'; operationHandle: string; pollIntervalMs: number }
  | { state: 'waiting_user'; challenge: UserChallenge }
  | { state: 'failed'; error: StructuredError }
```

异步操作通过 `pollAction(handle)` 或事件完成。`executeAction` 接受 `expectedRevision`；不匹配时返回 `conflict`。取消通过 `cancelAction(handle)`。

### 14.3 openManager 是 Client 能力

`openManager` 不是通用 Host 方法。它返回一个导航描述符，由 Client Side 的 Layout/Slot 服务执行：

```ts
interface ManagerNavigation {
  type: 'settings-section' | 'panel' | 'external-url'
  target: string
  params?: Record<string, string>
}
```

Client 侧 allowlist 决定可导航目标。Provider 不能直接操作浏览器导航。

### 14.4 Provider 信任与命名空间

Provider ID 由 Host composition 或包身份证明，不是自声明 `trust` 字段。注册时校验：

- Provider ID 命名空间（如 `dsh-im`、`dsh-mcp`）；
- 包来源和版本；
- 同 ID 冲突时拒绝覆盖，进入冲突仲裁。

### 14.5 Provider 数据安全

Provider 返回的 `safeMetadata`、`displayName`、URL 和 remediation action ID 是不可信数据。必须：

- Schema dialect/size/depth 限制；
- 安全渲染（无 HTML 注入）；
- URI scheme allowlist（只允许 https）；
- 只调用注册 Owner 声明的 action ID。

## 15. Recipe 表达式安全

### 15.1 受限 DSL

`when` 和 `assert.expression` 不使用动态 JavaScript。采用非图灵完备 DSL：

```yaml
when:
  not:
    equals:
      path: steps.inspect-auth.output.ready
      value: true

assert:
  any:
    - equals:
        path: identities.bot.status
        value: ready
    - in:
        path: identities.user.status
        values: [ready, needs_refresh]
```

支持的操作：`equals`、`not`、`any`、`all`、`in`、`path`（只读 Step 输出字段）、`value`。不支持循环、递归、函数调用或任意表达式。

### 15.2 Executor 环境安全

- 不继承宿主环境中的 Secret；
- 可执行文件解析使用受控 PATH，防止 hijack；
- `cwd` allowlist；
- 命令和包版本固定；
- 资源限制（CPU、内存、输出大小）；
- 出站网络策略；
- `prepare` 和 `execute` 之间防止 TOCTOU。

### 15.3 交互终端安全

`terminal.interactive` 通过受控 PTY Broker：

- 归属当前 Fiber，可取消；
- 输出经过 Redactor；
- 不捕获 Secret 输入；
- 支持重连和超时；
- Web 环境下通过 Host PTY Service，不直接 spawn。

### 15.4 OAuth/Challenge 安全

- state + nonce + PKCE 强制；
- redirect URI 精确绑定和一次消费；
- callback 与 Run ID 关联；
- 过期后 challenge 载荷立即清除；
- 重启恢复时重新生成 state，不重用旧 challenge；
- device code 和 QR 载荷不持久化，只保存类型、到期时间和恢复句柄。
