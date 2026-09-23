# DSH Capability Center 设计文档索引

> 仓库：https://github.com/advance-lion/dsh-capability-center  
> 设计日期：2026-09-23  
> 状态：目标架构草案，供评审

## 文档清单

| 文档 | 内容 | 状态 |
|---|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | 总体架构、领域模型、核心组件、Provider SPI、dsh-im 委托、安全、冲突策略、ADR | ✅ 完成 |
| [DATA-MODEL.md](DATA-MODEL.md) | SQLite 单库逻辑分区、Catalog/Runtime Schema、Schema 完整性约束、Migration、Excel 导入映射 | ✅ 完成 |
| [RECIPE-AND-PROVIDER-SPEC.md](RECIPE-AND-PROVIDER-SPEC.md) | Recipe 文档格式、Step Executor Contract、状态机、Provider SPI、dsh-im 适配、协议硬化、表达式安全 | ✅ 完成 |
| [ROADMAP.md](ROADMAP.md) | V0.1→V1.0 版本迭代、每版范围/验收/退出门槛、迁移 Backlog | ✅ 完成 |
| [TEST-STRATEGY.md](TEST-STRATEGY.md) | 7 个标准测试应用、分层测试、故障注入、安全脱敏、Migration、Provider 冲突、发布门禁 | ✅ 完成 |
| [diagrams/capability-center-architecture.html](diagrams/capability-center-architecture.html) | 可交互架构图（3 个视图：统一发现、配方自动化、目录治理） | ✅ 完成 |

## 架构决策记录

| ADR | 决策 |
|---|---|
| ADR-001 | 应用视角优先，Transport 是实现细节 |
| ADR-002 | Recipe-managed 与 Provider-managed 双轨 |
| ADR-003 | 每个 ConnectionInstance 只有一个 Owner |
| ADR-004 | IM 首选 Provider 为 `@xmanrui/dsh-im` |
| ADR-005 | 专业配置下钻，不复制 Provider UI |
| ADR-006 | 动作由 Recipe/Provider 声明，UI 不猜测 |
| ADR-007 | Catalog 与 Runtime 使用独立逻辑分区 |
| ADR-008 | RecipeVersion 不可变，Run 固定版本 |
| ADR-009 | 成功路径保存为脱敏 Override，不是任意脚本 |
| ADR-010 | Secret 只在 Credential Store/Owner Provider |
| ADR-011 | 状态必须由 Evidence 支撑 |
| ADR-012 | 冲突涉及身份或权限时 fail closed |
| ADR-013 | dsh-im Provider Contract v1；禁止依赖内部管理 RPC |
| ADR-014 | 管理 API 使用 DSH authority + Origin/CSRF + 审计 |
| ADR-015 | Catalog 可执行内容必须签名、审核、固定摘要并可撤销 |
| ADR-016 | Operation、Observed、Health、Desired 状态正交分离 |
| ADR-017 | V0.x 使用单物理 SQLite；历史 Run 保存 Catalog 摘要快照 |
| ADR-018 | Recipe 表达式为受限非图灵 DSL，不使用动态 JS |
| ADR-019 | 交互终端通过受控 PTY Broker，支持取消、重连和输出清洗 |

## 标准测试应用矩阵

| 应用 | 覆盖模式 | V0.1 | V0.2 | V0.3 | V0.4 |
|---|---|---|---|---|---|
| 飞书 Lark CLI | CLI + OAuth + 自动刷新 | ✅ 只读 | ✅ 完整 | ✅ 多账号 | — |
| dsh-im | Provider-managed + 多账号 + QR | ✅ L0 | ✅ Contract | ✅ L2 | — |
| Notion | Remote MCP + OAuth | ✅ Mock | — | ✅ Live | — |
| WPS 365 | CLI + Device Code | ✅ Contract | — | ✅ Live | — |
| GitHub | API Token/PAT | ✅ | ✅ 完整 | — | — |
| 微信 via dsh-im | Provider-managed + QR | — | ✅ 委托 | ✅ 完整 | — |
| QQ 邮箱网页 | Browser-session fallback | — | ✅ 设计 | — | ✅ 受控 |

## 关键设计约束

1. **不伪造状态**：`connected` 必须有未过期 Evidence。
2. **不跨所有权**：Secret 留在 Credential Store 或 Owner Provider。
3. **不猜动作**：按钮由 Recipe 状态或 Provider Action Descriptor 决定。
4. **不重放副作用**：重启从 checkpoint 恢复，不盲目重放。
5. **不静默切换**：账号/Provider 切换涉及身份或权限时 fail closed。
6. **不绕过认证**：管理 API 必须经过 authority + Origin/CSRF。
7. **不执行未审计内容**：Recipe 从 Candidate 到 Published 必须签名、审核、固定摘要。
8. **不依赖内部 RPC**：dsh-im Provider Contract 未实现前只做 L0。
