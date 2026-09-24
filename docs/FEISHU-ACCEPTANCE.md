# 飞书 CLI 用户接入：当前验收证据与发布门槛

## 目标与本轮范围

以真实应用为目标，而不是继续增加模拟界面。本轮修改飞书 Recipe、通用执行器、静态子进程结果映射和测试；不修改 UI / 正式路由 / Registry / DSH 配置，不运行 build、不重启宿主。没有执行登录、退出、撤权或写入飞书业务数据。

配方版本变为 1.0.1，这只是配方修订，不是 Capability Center 的里程碑升级。配方是本仓库编写的，source.level 改为 community；不能因使用官方 CLI，就把自编 Recipe 宣称为官方代码。

## 命令依据与真实只读观察

已读取 lark-shared 的身份权限、输出契约参考，并实际运行：

```text
lark-cli auth status --help
lark-cli auth status --json --verify
```

当前 CLI 帮助明确列出 --json、--verify，且标注 Risk: read；--verify 需要联网向服务端验证。

本轮真实探测的最小非敏感结果：

| 字段 | 观察 |
|---|---|
| 进程退出码 | 0 |
| JSON 解析 | 成功 |
| identity | bot |
| verified | true |
| identities.user.tokenStatus | expired |
| identities.user.status | 不在探测工具的已知枚举内，未输出原值 |

认证状态命令使用定制的顶层字段，而不是通用 OpenAPI 成功信封；本次没有顶层 ok。**退出码 0 / verified=true 不能证明 user 身份已连接。当前观察不能作为飞书用户接入成功。** 未返回应用标识、用户标识、姓名、scope 列表或任何令牌。

注意：该真实探测通过当前会话策略下的 shell Service 执行；尚未通过仓库 RecipeEngine 执行完整的现场验证链路。测试中的“local observation shape”是上述脱敏观察的回放，不是第二次真实端到端探测。

## 已修复

### 飞书 Recipe

- connect 明确断言 found===true，不再用 exists(false) 判断安装成功。
- connect / verify / 正常 reauthorize 恢复路径均使用已核实的 auth status --json --verify。
- 删除未经证实的 user me 命令。
- 所有验证断言无 when 条件，不因缺字段而跳过。
- 同时要求退出码 0、identity=user、verified=true、userStatus 为 logged_in/ready、tokenStatus=valid。needs_refresh、expired、bot、空数据和缺字段不算成功。
- 只投影 identity、verified、userStatus、tokenStatus 与 exitCode，避免把完整命令 JSON、用户标识或令牌写入步骤输出。
- 重新授权仍只产生用户交接，不自动执行命令；终端确认后必须再验证。--recommend 只是当前交接指令，正式发布前仍需按真实业务审查最小 scope。

### 通用执行器

- 断言为 false 返回 terminal_failure，阻止整个 Recipe 继续完成。
- command.json 对空/畸形 JSON、未知退出码、截断、超时和取消失败关闭；不再将这些情况返回 completed。
- 不返回原始 stdout/stderr，不把异常详情拼进可见错误；保留稳定错误码。
- select 只允许 own-property 标量路径，拒绝原型路径与整棵对象投影。未使用 select 的其他配方仍需自行审查 JSON 数据范围。
- signal 传到 shell 请求，执行前后均检查取消；不自动重试不明幂等性的命令。
- executable.resolve 不再拼接 shell 回退命令；要求宿主提供可执行文件查询服务。

### 静态 ChildProcessHost

- 读取真实 error.code，而不是不存在的 error.status；基础设施错误保持未知退出码 null。
- 区分取消、超时和 maxBuffer 截断；传递 AbortSignal。
- executable 查找使用 execFile + argv，不使用 execSync 拼接 shell。
- 测试使用模拟 OS 边界，仅证明结果映射和 signal/限制参数传递。**未证明 Windows 子进程树完全终止或 callback 返回时所有后代已退出**，不能据此放开安全切换门控。

## 测试记录

1. 先补失败路径：全仓库 145 项中 57 失败、88 通过。失败包含过期/缺字段误成功、原始输出泄露、未知退出码默认为 0 等。
2. 修改配方与执行器后：145/145 通过。
3. 增加 11 项子进程结果映射测试后：8 个测试文件，156/156 通过。
4. 类型检查先发现 Node exec 的 code 类型声明只包含 number，而运行时还可能是基础设施字符串错误码；改用 unknown 并运行时收窄后，tsc --noEmit 退出码 0。

```text
node node_modules/vitest/vitest.mjs run
node node_modules/typescript/bin/tsc --noEmit
```

其中飞书配方测试 35 项，通用执行器测试 24 项，子进程映射测试 11 项。所有仓库测试使用模拟数据，不进行真实登录或业务写操作。真实 CLI 探测与这些测试分开报告。

## 尚未满足的发布门槛

- 当前真实用户令牌过期，未取得真实 user 认证成功证据；健康字段枚举的成功路径目前只在测试数据中验证。
- 未证明具体业务 scope 足够；登录验证成功也不等于能发消息、收事件或读取任意资源。
- 当前严格要求 identity=user；若默认身份为 bot，但另外存在有效用户凭据，需要继续核实显式用户验证方式，不能直接放宽条件。
- 尚未把该源码生成同源动态 Host 后端，也未接管现有 API / Registry；运行中的开发工具不是正式业务后端。
- RecipeEngine 的检查点仍是可变结构，未实现绑定/一次性令牌；非法 checkpoint 可能绕过步骤。正常恢复测试不等于检查点安全验收，暂不可作为生产授权接口。
- 老 UI 将 202 当普通成功，现有 /resume 不是 Recipe 恢复；不能只接上新 Recipe 就宣布交接体验完成。
- 通用条件/表达式结构校验、运行态恢复、多账号身份键、真实撤权与凭据存储仍有历史缺口；本轮没有假称修复这些问题。
- 静态 Node runner 不保证子进程树取消；动态业务承载必须使用带会话策略和明确生命周期语义的宿主服务。

下一步优先：同源加载并执行现场只读 Recipe 验证，给第二个实际应用补同类真实证据；授权需要时先向用户明确业务范围，不自动重登录或扩权。
