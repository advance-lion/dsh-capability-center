# 同源动态只读验证：飞书与 GitHub

## 第10轮最新状态：身份分离，候选尚未替换运行版

最新真实只读 `auth status --json --verify` 返回退出码 0，但 identity=none、botStatus=verify_failed、botVerified=false、userStatus=missing、userTokenStatus=expired；顶层 verified 未取得布尔值。因此不能沿用上一轮的 bot 状态，也不能宣称机器人接入成功。失败原因尚未查明，没有自动重登录或修改配置。

新增独立 `feishu-cli-bot` 方法，与 `feishu-cli-user` 同属 feishu 集成，但方法 ID、验证条件各自独立。机器人配方只接受显式 bot 身份及顶层/机器人验证标志为 true，不调用用户 auth login。成功组合目前仅有模拟测试，尚未取得真实成功样本，发布前须核对 CLI 的成功契约。

生成器现在包含三份配方，保留 `feishu` 选择器指向用户方法，新增 `feishu-bot`。构建时锁定 integrationId/methodId，拒绝把机器人配方冒充用户方法；生成报告显式带两个方法元数据字段。

- 全仓库 11 个文件、202/202 测试通过；TypeScript 检查退出码 0。
- 新增机器人配方测试 15 项，生成器测试新增 4 项；包含双向身份隔离、方法绑定拒绝和最新失败形状回放。
- 新产物源码指纹：`e455d52499e9d5c405001b8ad9de7e9fc7cfb1197ef9333891d6bfcb26bfc382`。
- **新产物仅生成在磁盘，尚未定义/加载为新的 caprun Package。当前 caprun-3/pkg-11 仍是下文旧指纹 14854d… 的版本。** 不可把当前产物文件当作旧 Package 的逐字源码；旧 Package 自身不可变。
- 通过现有运行版重新执行 GitHub：passed，exitCode=0，指纹仍为 14854d…；说明构建新产物没有暗中替换运行版本。
- 开发工具更新为 capdev-2/pkg-12/run-14；仍不改变会话权限或正式 API。

### 正式入口核对结果（只读，未修改）

`src/index.ts` 仍导入 github-pat.recipe.json，而不是本轮验证过的 github-cli-user 配方；飞书旧 CLI manifest 仍含未核实的 user me 和无 scope 的登录指令。创建 Registry 后直接传给 registerRoutes，当前运行入口没有已接入的可替换后端服务。

所以不能只改一张配方表就声称原页面完成接入。下一阶段应先补稳定调度/映射的源码适配和兼容性测试：保留原公开能力 ID，明确映射实际 methodId，用户和机器人不得共用一个已连接状态；授权等待与失败不能被旧 UI 的 2xx 处理吞掉。正式切换必须单独执行受控接入，不能重复注册抢占路由。是否能够仅重载原插件、而无需宿主重启，仍需核实加载器能力，不能预先承诺。

## 第9轮已完成的现场验证（历史记录）

本轮首次把仓库的 RecipeEngine、ExecutorRegistry、built-in executors、expression 实际编译为动态 Host Package，在当前 DSH 进程调用真实 CLI。不是另外手写一套模拟后端，也不是仅运行 Vitest。

| 应用/方法 | 首次真实结果 | 插件重载后 | 结论范围 |
|---|---|---|---|
| GitHub CLI 用户身份 | passed，commandExecuted=true，exitCode=0 | 再次 passed，exitCode=0 | 现有凭据可以通过 github.com 的 GET /user；不代表仓库写入等业务权限 |
| 飞书 CLI 用户身份 | failed，exitCode=0，assertion_failed | 本轮未重复此项 | 命令能运行，但不满足 user 验证条件；不得显示用户连接成功 |

飞书上一阶段观察为 identity=bot、verified=true、用户 tokenStatus=expired；本轮同源配方只报告验证失败，不凭该错误码断言所有具体失败字段仍与上一阶段完全相同。

本轮没有登录、退出、切换账号、扩权、业务写操作、正式运行态持久化，也没有改 UI、接管正式 API 或重启 DSH。

## 运行版本与证据

- 开发工具：capdev-2 / pkg-10 / run-11。
- 只读候选：caprun-3 / pkg-11。首次运行 run-12；停止后重载 run-13。
- 源码指纹：`14854d28848eadec0e0793c9129a501253717344d5e97e836152c7d2f328dff3`。
- 飞书配方 1.0.1；GitHub CLI 配方 1.0.0。
- status 返回的指纹与生成器输出一致；停止前 inFlight=0。
- cordis_stop 明确返回 stopped；同一 Package 再 run 后，GitHub 真实验证仍通过。

上述动态 ID 只属于当前进程/会话，不承诺进程重启后仍存在。源码指纹标识编译器版本和输入文件内容，不是数字签名，也不替代代码审查。

## 同源生成方式

生成器：`scripts/build-readonly-candidate.mjs`。
产物：`artifacts/readonly-candidate.body.js`，是 Cordis Host 函数体，不是可直接 node 执行的独立脚本。**不要手改产物。**

生成器读取四份核心源码、两份配方及自身源码，计算 SHA-256 输入指纹，通过本项目 TypeScript 编译器输出纯 JavaScript。模块依赖只解析到已嵌入模块；没有运行时 import/require，也不使用 Node ChildProcessHost。两份配方仅嵌入 verify intent，且构建时要求固定只读命令和无条件最终断言。

生成器本身只向 stdout 输出 JSON；cap_source 的 build-candidate 再用已观察版本和当前会话沙箱策略写入产物。构建前后还比较输入，防止构建期间变化。

适配层在每次工具调用时从当前会话解析 sandboxPolicy，不请求覆盖权限；所有实际命令通过宿主 shell Service 执行。固定 15 秒期限、64 KiB 输出上限，只接受当前申请的单次执行对象。最终报告只含验证状态、退出码、错误码、配方版本和源码指纹，不回传账户 ID、用户名、邮箱、scope 或令牌。

## GitHub 命令依据

已实际读取 `gh api --help`，确认 --hostname、--method 和 GET 用法；官方用户 API 文档明确 GET /user 为认证用户查询，200 为成功，401/403 为认证或权限失败：

- https://docs.github.com/en/rest/users/users#get-the-authenticated-user
- 文档正文：https://docs.github.com/api/article/body?pathname=/en/rest/users/users

配方命令固定为：

```text
gh api --hostname github.com --method GET user
```

显式 hostname 防止 GH_HOST 改变目标，显式 GET 防止未来参数令默认方法变为 POST。复用 CLI 当前有效身份，不读取或重写它的凭据配置。仅投影 id/type 进行最小身份断言；动态工具不会把 id 返回。配方不是完整 GitHub 响应 JSON Schema 校验。

## 回归证据

```text
node node_modules/vitest/vitest.mjs run
node node_modules/typescript/bin/tsc --noEmit
```

- 全仓库 10 个测试文件，183/183 通过。
- TypeScript 检查退出码 0。
- 新增 GitHub 配方测试 16 项。
- 新增生成器/生成代码测试 11 项：可复现构建、输入变化改变指纹、拒绝非白名单命令/条件断言、同会话策略传递、GitHub成功、飞书失败、畸形JSON、错误脱敏、忙碌拒绝、停止后晚到结果不能成功。
- 生成代码测试直接执行生成的函数体，但使用模拟宿主；上表的两次 GitHub 查询与一次飞书查询才是真实服务调用，不能把 183 项测试都称为真实接入测试。

## 生命周期与部署边界

本次实际测试的是空闲时停止/重载同一 Package，不是跨版本回滚，也不是在途强杀测试。工具停止后拒绝新操作，晚到结果不得报告成功；在途 shell 调用仍受模型取消信号和宿主期限控制，本候选没有证明点击停止可立即终止整个 OS 进程树。

当前候选只注册会话工具，无 Client、路由或业务 Service 替换，不写 cache.json/runtime.json。正式 UI/API 仍由原实现处理，所以不能宣称原能力中心页面已经完成新的连接流程。

核心仍存在历史未解决项：可变/可伪造恢复检查点、部分条件校验缺口、Registry 多账号身份/能力投影、旧 UI 对 202 的解释和真实撤权等。只读适配层不暴露 resume/reauthorize/任意 intent，避免把这些路径作为已验收能力开放。

整体目标仍未完成：目前取得 GitHub 用户身份成功证据，以及飞书用户身份失败的可靠识别；还要推进另一条真实可用应用/身份路径，并完成稳定 API 接入与必要业务权限验证。
