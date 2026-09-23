# Capability Center 版本迭代路线

版本号描述能力成熟度，不承诺具体日期。每个版本必须满足退出门槛才能进入下一阶段。

## V0.1 — Foundation / 内部 MVP

### 目标

从硬编码卡片迁移到可扩展的领域模型和本地 Catalog，建立安全边界；不追求自动连接全部应用。

### 范围

- Integration / ConnectionMethod / ConnectionInstance View 类型；
- 单 SQLite 文件的逻辑 Catalog/Runtime 分区，或双库 Repository 抽象；最终物理拓扑由 ADR 决定；
- Excel 幂等导入为 Candidate，不直接发布；
- Catalog Candidate 校验和只读浏览；
- Recipe Schema v1 与静态校验器；
- 受限 Executor：`executable.resolve`、`command.json`、`assert.expression`；
- 飞书 CLI Recipe：检测、`auth status`、验证；安装和登录先以用户确认/终端委托为主；
- dsh-im L0：检测真实服务 `dshIm`、包版本、管理入口；不读取内部 RPC/文件，不伪造账号状态；
- 静态插件 API 引入权限校验、Origin/CSRF、方法、Body size 和 Schema 验证；
- UI 按应用聚合，区分“已知方法、运行时安装、认证、验证”。

### 明确不包含

- dsh-im 账号健康聚合；
- 多账号切换；
- 远程 Catalog 自动发布；
- 任意安装命令执行；
- MCP OAuth 和二维码托管。

### 验收应用

- 飞书 Lark CLI：真实本机只读检测；
- GitHub Token：使用假 Credential Store 和模拟 `/user`；
- dsh-im：只验证存在、版本和跳转；
- Notion：模拟 MCP/OAuth contract smoke。

### 退出门槛

- P0 happy path 全部通过；
- 无明文 Secret 出现在 UI、日志、Session、导出和数据库；
- 任何写操作都经过 authority + Origin/CSRF；
- Catalog 导入重复运行不产生重复项；
- 架构领域类型不再依赖 `statusMap` 作为事实源。

## V0.2 — Preview / Recipe Runtime + Provider Contract

### 目标

建立可恢复自动化运行时，并与 dsh-im 确认稳定的脱敏 Provider Contract v1。

### 范围

- ConnectionRun / StepRun / checkpoint；
- `waiting_user`、取消、超时、重试；
- DSH Credential Store 引用；
- Executor：`credential.prompt`、`credential.store`、`api.identity`、`oauth.browser`、`provider.delegate`；
- 飞书 CLI 完整 connect / reauthorize / verify；
- GitHub PAT 完整路径；
- dsh-im Provider Contract v1 规范和兼容性测试；
- 若 dsh-im 尚未实现 Contract，则保持 L0，不使用内部 API；
- Provider 冲突基础检测；
- Runtime migration、备份与重启恢复；
- Learned Override Candidate（不自动复用）。

### dsh-im Contract v1 最小要求

- `descriptor`：provider id、version、兼容范围；
- `listMethods`：渠道和能力；
- `listConnections`：opaque instance id、脱敏别名、native state、observedAt、revision；
- `openManager`：Provider/渠道/实例导航；
- 不要求写动作。

### 验收应用

- 飞书 CLI OAuth；
- GitHub fine-grained PAT；
- dsh-im 飞书单 Bot（若 Contract 已实现）；
- 微信 via dsh-im 扫码的委托跳转；
- QQ 邮箱官方网页后备的隔离与披露设计测试。

### 退出门槛

- 关键路径连续三轮通过率 ≥95%；
- 重启可恢复 `waiting_user`；
- revoke/expiry/denied/cancel 不产生假连接；
- 零 Sev-1 安全缺陷；
- Provider Contract 未实现时 UI 明确显示“由 dsh-im 管理”，不显示虚构实时状态。

## V0.3 — Beta / 多认证模式与多账号

### 目标

覆盖主要接入模式，正式支持多账号实例和 Provider L2 动作。

### 范围

- Remote MCP + OAuth；
- Device Code；
- QR/manual challenge；
- Provider L2：Provider 声明 diagnose/reconnect/pause/open-manager 等动作；
- 多账号实例、默认实例和账号选择；
- Account Switch Strategy；
- Provider event subscription 或版本化 polling；
- Learned Override `verified-local`；
- Recipe N-2 读取、升级和回滚；
- Windows/macOS/Linux 兼容矩阵。

### 验收应用

- Notion Remote MCP + OAuth；
- WPS 365 CLI + Device Code；
- dsh-im 飞书多 Bot；
- dsh-im 微信设备绑定；
- 飞书 CLI 两账号重新授权；
- GitHub.com 与 GHES host 区分。

### 退出门槛

- 完整矩阵在适用 OS 通过；
- P0 flaky rate ≤1%；
- 不会静默切换账号或 Provider；
- QR/device callback 重放不产生第二凭据；
- migration rollback 实证通过；
- Provider snapshot freshness 正确影响 UI。

## V0.4 — Release Candidate / 治理与韧性

### 目标

从功能完整走向生产韧性、Catalog 治理和供应链安全。

### 范围

- Catalog 变更审核 UI；
- 官方来源指纹、复查队列和 URL 健康；
- Recipe publisher identity、签名、摘要和撤销；
- 安装包版本锁定、下载哈希/签名、redirect/DNS 策略；
- 故障注入、并发、配额、代理、TLS、磁盘故障；
- 冲突仲裁与企业策略；
- 备份/恢复和脱敏诊断包；
- 无障碍、i18n、性能与 7 日 Canary/Soak；
- QQ 邮箱官方网页会话后备正式受控试验。

### 验收应用

前述全部应用，并加入：

- dsh-im Telegram Token Bot；
- 双 IM Provider 冲突场景；
- Notion MCP schema drift；
- CLI 输出格式升级；
- Catalog 恶意候选与供应链攻击样本。

### 退出门槛

- 7 日 Canary/Soak；
- 无开放 P0/P1；
- SLO 达标；
- Secret artifact scanner 通过；
- 备份恢复演练通过；
- 远程 Recipe 不能绕过审核和签名进入执行态。

## V1.0 — Stable / 可发布平台

### 目标

形成稳定的 Capability Provider 与 Recipe 生态协议。

### 范围

- 签名、版本固定的 Catalog/Recipe artifact；
- Provider compatibility policy；
- 分阶段 Catalog rollout 和自动回滚；
- SLO、遥测、维护责任和 deprecation policy；
- 两个以上外部 Provider 对 SPI 的实现验证；
- 安装、升级、卸载、恢复和迁移完整文档。

### 发布门槛

- 连续两个干净 RC；
- 完成恢复演练；
- Provider/Recipe N-2 兼容策略验证；
- 无 release blocker：凭据泄露、认证绕过、错误账号操作、不可逆数据丢失、静默 Provider 切换、重复外部副作用或无法撤销连接。

## 后续版本方向

### V1.1 — Catalog Sync

- 签名远程目录；
- 企业私有 Catalog；
- 差异更新和灰度。

### V1.2 — Agent-driven Capability Request

- Agent 声明缺失能力；
- 生成最小权限计划；
- 用户确认；
- 连接完成后恢复原 Session。

### V1.3 — Ecosystem

- Provider SDK；
- Recipe authoring/validation CLI；
- 社区候选与可信发布者；
- 合规策略和组织管理。

## 当前代码到 V0.1 的迁移 Backlog

1. 新建领域类型，不直接删除当前 `Capability`；
2. 建 Repository 接口和 migration runner；
3. 实现 Excel Candidate Import；
4. 实现 Recipe validator；
5. 将飞书 CLI 探测从 `DefaultCLIAdapter` 提取为 Recipe Executor；
6. 修复 dsh-im 检测服务名为 `dshIm`，降级为 L0；
7. 移除 IM 假安装/管理状态；
8. 拆分 Operation State 与 Connection Observation；
9. 加固 API authority 和 CSRF；
10. UI 改为 Integration → Methods → Instances；
11. 保留旧 `/list` API 一版只读兼容；
12. 增加 migration、redaction 和 integration tests。
