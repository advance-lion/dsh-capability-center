# DSH Capability Center

> **DSH 的统一能力管理层（Capability Layer）** — 为 DeepSeek Harness 提供统一的能力发现、安装、配置、授权和运行状态管理入口。

## 特性

- **统一能力抽象** — 用户不再区分 Skill / MCP / CLI / API，只看到"能力"
- **复用 DSH 原生** — 不重新实现 Skill Runtime（`ctx.skills`）和 MCP Runtime，只做适配层
- **Connector 解耦** — MCP 只是 Connector 的一种实现，未来可无缝替换为 CLI / API / Browser
- **语义能力层** — Agent 看到的是 `feishu.message.send`，而非 `lark send ...`
- **安全凭据隔离** — Agent 永远拿不到原始 Token，只拿到 `credential://feishu/default` 引用
- **来源链接追踪** — 每个能力标注 `sourceUrl`，Agent 可据此查找更新
- **松耦合扩展** — Partner、Marketplace、第三方能力通过 Provider 接口接入

## 能力模型

```
能力 Capability
├── 技能 Skill          — 可复用的任务指令 / 工作流（来源: DSH ctx.skills）
├── 连接器 Connector    — 将 Agent 与外部系统连接
│   ├── MCP            — 来源: DSH MCP Client
│   ├── CLI            — 来源: 外部 CLI 工具（如 Lark CLI）
│   ├── API            — 来源: 外部 REST API
│   └── Browser        — 预留
└── 伙伴 Partner        — 让 DSH 发现、调用、协作其他 Agent（来源: dsh-agent-partners）
```

> **当前版本只实现 Skill + Connector。** Partner 由独立的 `dsh-agent-partners` 插件提供。

## UI 入口

入口位于 **对话栏左侧、新对话按钮正下方**，与 Codex / 豆包工作等产品一致。

通过 DSH 的 `main` keyed-slot 注册，sidebar panellist 自动发现并渲染入口图标。

## 技术栈

与 `dsh-skills-mcp-manager` 保持一致：

| 维度 | 选择 |
|------|------|
| 语言 | TypeScript ~5.7.2 |
| 插件框架 | Cordis (@deepseek-ai/cordis ^4.0.1) |
| 前端 | React 18 (jsx: react-jsx) |
| 构建工具 | tsdown（双 entry：host ESM + client CJS） |
| CSS | lightningcss + @tsdown/css (CSS Modules) |
| 配置 schema | schemastery ^3.18.0 |
| 测试 | vitest + jsdom |
| 包管理 | pnpm |
| DSH 集成 | cordis.patch.yml (bundle patch) + package.json `dsh` 字段 |

## 项目结构

```
src/
├── index.ts                          # Host 入口（Cordis 插件）
├── protocol.ts                       # Host ↔ Client RPC 协议
├── routes.ts                         # HTTP 路由 /api/capability-center/*
├── core/
│   ├── capability/
│   │   ├── types.ts                  # Capability 统一类型定义
│   │   ├── registry.ts               # Capability Registry（分发器）
│   │   ├── catalog.ts                # Catalog（聚合所有 Provider）
│   │   └── provider.ts              # Provider 接口 + Official/Local/Partner
│   ├── adapters/
│   │   ├── skill-adapter.ts          # → ctx.skills
│   │   ├── mcp-adapter.ts            # → DSH MCP Client
│   │   ├── cli-adapter.ts            # → CLI subprocess
│   │   └── im-recommendation-adapter.ts  # → dsh-im 推荐
│   ├── runtime/                      # （预留）
│   └── services/                     # （预留）
├── connectors/
│   └── lark/
│       └── manifest.json             # 飞书 Connector Manifest
└── client/
    ├── index.ts                      # Client 入口（注册 main panel）
    ├── capability-center.tsx         # 主面板 UI
    ├── capability-center.module.css  # 样式
    ├── api.ts                        # Client → Host RPC 调用
    ├── locales.ts                    # i18n（zh / en）
    └── css-modules.d.ts              # CSS Module 类型声明
```

## 开发

```bash
pnpm install          # 安装依赖
pnpm run typecheck    # 类型检查
pnpm run build        # 构建（tsc + tsdown + wrap-client）
pnpm run watch        # 监听模式
pnpm test             # 运行测试
```

## 安装到 DSH

```bash
# 在 DSH 配置目录创建 symlink
ln -s /path/to/dsh-capability-center ~/.dsh/node_modules/@wanganxin/dsh-capability-center

# 在 ~/.dsh/cordis.patch.yml 中启用
# - insert:
#     - id: ui-capability-center
#       name: '@wanganxin/dsh-capability-center'
```

## MVP 范围

| 版本 | 范围 |
|------|------|
| **V0.1** | Capability Catalog · Skill 展示/启禁用 · MCP 展示/连接断开 · CLI Detection/Install/Auth · Connector Health · Search · Category |
| **V0.2** | IM Recommendation（发现 dsh-im → 推荐安装 → 打开） |
| **V0.3** | Marketplace（Official / Community） |
| **V0.4** | Agent-driven Capability Request（发现缺能力 → 请求 → 安装 → 授权 → 恢复 Session） |

## 参考

- [dsh-skills-mcp-manager](https://github.com/zebbkira/dsh-skills-mcp-manager) — 代码基础
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — DSH 原生 Skill 系统
- [Lark CLI](https://open.larksuite.com/document/mcp_open_tools/feishu-cli-let-ai-actually-do-your-work-in-feishu) — 飞书 CLI 官方文档

## License

MIT
