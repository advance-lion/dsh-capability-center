# Capability Center 测试策略与应用矩阵

## 1. 测试目标

验证四件事：

1. **连接真实性**：UI、持久化状态和真实后端 Evidence 一致；
2. **安全性**：Secret 不泄露，认证流程不可重放或串号；
3. **可恢复性**：取消、超时、崩溃、重启和升级后状态收敛；
4. **可扩展性**：不同 Transport/Provider 不需要平台硬编码。

## 2. 标准测试应用

| 应用/集成 | 覆盖模式 | 为什么选它 | 首次纳入 | 完整纳入 |
|---|---|---|---|---|
| 飞书 `lark-cli` | CLI + OAuth + 自动刷新 | 本机已安装，官方工具，能覆盖 CLI 发现、结构化状态、scope 和重新授权 | V0.1 | V0.3 |
| `@xmanrui/dsh-im` | Provider-managed + 多账号 + QR | 验证委托所有权、Provider 版本、账号实例、扫码、多 Bot 和精准下钻 | V0.1 L0 | V0.3 L2 |
| Notion | Remote MCP + OAuth | 覆盖 MCP initialize/tools/list、OAuth 和远端 schema drift | V0.1 Mock | V0.3 Live |
| WPS 365 | CLI + Device Code | 覆盖设备码、轮询、slow_down、过期和浏览器绑定 | V0.1 Contract | V0.3 Live |
| GitHub | API Token/PAT | 覆盖 Secret 输入、Credential Store、身份验证、scope、SSO 和 GHES | V0.1 | V0.2 |
| 微信 via dsh-im | Provider-managed + QR/设备绑定 | 覆盖 Provider 委托、QR 过期、设备踢下线和多账号 | V0.2 | V0.3 |
| QQ 邮箱官方网页 | Browser-session fallback | 覆盖无程序化接口时的披露、隔离 Profile、MFA/Captcha 和不读取 Cookie | V0.2 Design | V0.4 Controlled |

## 3. 每个应用的核心用例

### 3.1 飞书 Lark CLI

P0：

- 发现 `lark-cli` 和版本；
- `auth status` 提取身份、状态、scope 和到期时间；
- `needs_refresh` 被视为可自动刷新但给出提示；
- 登录/重新授权后验证当前账号；
- CLI 输出不整段写库；
- CLI 升级改变输出时 fail closed，不显示假连接。

异常：

- CLI 缺失、PATH hijack、版本不兼容；
- OAuth denied、state/PKCE 错误、callback port 冲突；
- Token revoked/expired；
- tenant/account 变化；
- CLI hang、non-zero、截断或非 JSON 输出；
- 账号切换失败时旧实例不被误标为新账号。

### 3.2 dsh-im

V0.1 L0：

- 检测真实 `dshIm` 服务和包版本；
- 插件未加载时不因 composition inventory 假阳性显示在线；
- 只显示 Provider 管理入口；
- 不访问私有 RPC 或内部 JSON。

Contract v1 后：

- 单/多账号稳定 opaque ID；
- native state + normalized projection；
- observedAt/revision/freshness；
- 精准打开平台/实例管理页；
- Provider 卸载后状态变为 unavailable，缓存标注时间；
- QR 过期、扫码未确认、网络中断、重复账号、并发扫码；
- 删除活动账号、接收开关、重连和诊断动作必须由 Provider 执行。

### 3.3 Notion Remote MCP

- MCP 注册、initialize、tools/list、tool call；
- OAuth state + PKCE、scope、refresh、reconnect；
- DNS/TLS/代理/401/403/429/5xx；
- malformed JSON-RPC/SSE；
- tool schema drift；
- 断线重连不重复外部调用；
- 同一个 MCP 配置幂等注册。

### 3.4 WPS 365

- Device code、verification URL、轮询间隔；
- authorization_pending、slow_down、denied、expired；
- 轮询中断与重启恢复；
- clock skew；
- 错误 tenant/account；
- CLI 缺失和版本不兼容；
- device code 不进入持久化日志或导出。

### 3.5 GitHub

- Fine-grained PAT 的 masked 输入和 Credential Store；
- `/user` 身份验证；
- resource owner、scope、SSO 授权；
- rotate/remove；
- GitHub.com 与 GHES host 绑定；
- invalid/expired/revoked、rate limit、空格和粘贴错误；
- Token 不出现在 argv、URL、Toast、日志或 Run。

### 3.6 微信 via dsh-im

- 委托打开添加账号；
- QR bind、设备确认、账号关联；
- Provider Evidence 后能力中心更新；
- QR 过期/重放、其他设备确认、被踢下线；
- 并发绑定和错误账号路由；
- 能力中心不保存二维码载荷。

### 3.7 QQ 邮箱网页后备

- 明确告知这是官方网页会话而非 API；
- 隔离浏览器 Profile；
- 登录/MFA/Captcha 用户接管；
- 会话健康、logout/delete；
- Cookie 到期、页面变化、headless blocked、Profile 损坏；
- 多账号 Cookie 不串用；
- 不提取密码、Cookie 或浏览器 Secret。

## 4. 分层测试

### 4.1 Contract Tests（每次提交）

- Catalog/Recipe/Provider Schema；
- 状态机合法转换；
- Executor 输入输出与 Redactor；
- Provider Adapter 映射；
- MCP 协议和 CLI parser；
- 使用确定性的 Fake OAuth、QR、Device Code、MCP 和 Provider。

### 4.2 Integration Tests（PR / Nightly）

- 真实进程边界和 DSH Service；
- Credential Store；
- callback port；
- SQLite transaction/WAL/migration；
- restart/crash recovery；
- 账号 Registry、proxy/TLS、rate limit；
- 管理 API authority、Origin、CSRF 和 body limits。

### 4.3 E2E Sandbox（Nightly / Pre-release）

```text
install → authorize → verify → invoke → refresh → revoke → remove
```

仅使用 disposable tenant/test account。破坏性操作不触及生产账号。

### 4.4 Fault Injection

- offline、DNS、TLS、proxy；
- callback port collision；
- 401/403/408/409/429/5xx；
- malformed/truncated output；
- clock skew；
- process kill mid-write；
- disk full/read-only；
- Provider outage；
- stale QR/device code；
- CLI hang；
- MCP schema drift；
- concurrent connect/remove/switch/default update。

断言 bounded backoff + jitter、Retry-After、可取消、无重复副作用、保留 last-known-good。

### 4.5 Canary / Soak

V0.4 起进行 7 日：

- 长期 token refresh；
- Provider 重连；
- snapshot freshness；
- SQLite 增长和清理；
- Catalog rollout/rollback；
- SLO 和遥测脱敏。

## 5. 安全与脱敏测试

使用 seeded canary secrets，扫描：

- Host/Client 日志；
- Toast 与错误；
- SQLite；
- Session replay/export；
- crash report；
- clipboard preview；
- backup 和诊断包；
- base64、URL encoded、短 Secret、多行和非 ASCII 变体。

必须验证：

- OAuth state/nonce/PKCE；
- callback 精确绑定和一次消费；
- redirect allowlist；
- TLS；
- QR 单次有效；
- account isolation；
- revoke/delete；
- provider-scoped credentials；
- 错误在脱敏后仍然可操作。

## 6. Migration 测试

维护每个受支持 Schema 的 golden fixtures：

- fresh install；
- N-2 → N；
- sequential upgrade；
- interrupted migration/resume；
- idempotent rerun；
- unknown-field preservation；
- account ID/default mapping；
- credential reference migration 不复制 Secret；
- rollback；
- unsafe downgrade refusal；
- backup/restore；
- uninstall/reinstall；
- legacy CLI/浏览器会话导入。

如果使用 WAL，备份测试必须调用 SQLite backup/checkpoint 语义，不能只复制 `.sqlite` 文件。

## 7. Provider 冲突测试

身份键：

```text
capability + provider + environment/tenant + accountId
```

覆盖：

- CLI 和 dsh-im 同时为飞书贡献能力；
- dsh-im 与 dsh-im-connect 同平台；
- 两个 Provider 相同显示名但不同 tenant；
- 同 Provider 两版本；
- 默认 Provider 删除/禁用；
- priority tie；
- 健康失败后的 fallback；
- 并发改默认；
- tool/port collision；
- selected Provider 卸载。

选择规则：用户 pin > 管理策略 > 健康兼容 Provider > 确定优先级。若身份/权限仍歧义则 fail closed。

## 8. UI 与无障碍

- 应用、方法、实例层级可理解；
- 状态不能只用颜色；
- Provider owner 和 freshness 明确；
- 键盘、焦点、屏幕阅读器；
- 中文/英文；
- 长名称、长错误、窄屏；
- `waiting_user` 在刷新后可恢复；
- destructive confirmation 的对象和影响清晰。

## 9. 发布门禁

### V0.1

- P0 contract/mock E2E；
- 无明文 Secret；
- authority/CSRF；
- Excel 幂等导入。

### V0.2

- 关键路径三轮 ≥95%；
- cancel/timeout/restart/revoke；
- 零 Sev-1。

### V0.3

- 适用 OS 全矩阵；
- P0 flake ≤1%；
- 多账号和 rollback。

### V0.4

- 7 日 soak；
- 零 P0/P1；
- 性能与错误预算；
- redaction audit、backup restore。

### V1.0

- 两轮干净 RC；
- restore drill；
- signed artifacts 和 staged rollback。

## 10. Release Blockers

任一项阻止发布：

- 对错误账号执行操作；
- Secret 暴露；
- OAuth/QR replay 或认证绕过；
- migration 不可逆数据丢失；
- 静默切换 Provider/账号；
- 重复外部副作用；
- 无法 revoke/remove；
- 缓存状态被误报为实时连接。
