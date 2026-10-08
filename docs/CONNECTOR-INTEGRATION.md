# 三个连接器的阶段性接线与现场证据（未部署）

用户已确认连接中心的三个卡片是：`feishu`（CLI 用户）、`github`（CLI 用户）、`lark-im`（dsh-im 托管飞书 IM）。它们不是同一身份/同一提供者，飞书 CLI bot 配方也不得冒充 lark-im。**项目仍在开发中、不支持安装；本次只是本地源码修改和隔离探针，不代表现有 GUI 已更新。**

## 当前实测

只读动态探针在当前 DSH 进程、当前会话策略下运行：

- GitHub：`gh api --hostname github.com --method GET user`，退出码 0、解析出数值用户 ID 与类型 User，通过身份验证；未返回或保存账号 ID、login、token。不能据此推断仓库写入/PR/Issue 权限。
- 飞书用户：`lark-cli auth status --json --verify`，退出码 0，但有效身份为 bot、用户 tokenStatus=expired，用户身份验证失败。不能自动登录，也不能用 bot 身份代表用户。
- 飞书 IM：当前进程可发现 `dshIm` 服务对象，但动态探针对 `listBots` 方法的访问触发代理不变量错误；修复后的探针将其报告为 `methodAccessible=false`、`verified=false`。Inspect 当前没有该服务的公开方法契约。**不能据此声称 IM Bot 已连接。**

以上检查都不是正式 `/api/capability-center` 请求；没有部署、切换路由、修改凭据或重启 DSH。

## 本轮源码改动

- `recipe-bindings.ts` 将两个现有 CLI 卡片绑定到经过审查的用户身份配方，拒绝方法 ID 错配、条件跳过最终断言等；`lark-im` 明确由 Provider 管，不作为 CLI 用户的别名。`src/index.ts` 不再使用旧的 GitHub PAT 配方。
- Registry 在发现刷新时重新执行真实 `verify` 配方，CLI adapter 的启发式 `connected` 不再覆盖这两个用户身份。缓存中跨进程的 CLI 已连接状态不得直接复用；连接/验证必须看到明确的最终 `assert.expression` 证据才标记健康。失败不持久化虚构的用户实例；未审查的断开/再次授权路径拒绝而不是调用旧 logout/返回 HTTP 202。
- 飞书 IM 推荐卡片不再把 preset 名称或类似服务名当作服务已安装；Provider 不再用硬编码 packageVersion 假装运行中。若确有可用 Provider 列表，只有 `connected === true`、`configured !== false` 且有真实 botId 的条目才标记已连接；仅文本状态 ready/connected 或 available 标志不能替代。

## 测试与剩余验收

- 归档前全仓库 15 文件，218/218 测试通过；`tsc --noEmit` 退出码 0。新增跨进程旧缓存状态不可信及缺少执行器时拒绝回退的测试。
- Registry 新测试覆盖：同源 GitHub connect/verify、飞书 bot 不冒充用户、非零退出码、虚假 CLI discovery、断开/授权拒绝、缺少断言拒绝。飞书 IM 新测试覆盖：preset 冒充服务、空列表、文字状态冒充连接、畸形/异常列表。全部为隔离测试，不能替代实际提供者调用。
- 尚需核对 dsh-im 在正式静态插件上下文的**真实公开读取接口**，确定该服务的连接状态方法与输出，保证 `lark-im` 卡片而非另起重复卡片呈现真实聚合状态。宿主动态代理错误不是验证成功。
- 仍需验证旧 Registry 缓存对 IM 状态的影响、HTTP 操作契约与原客户端的失败呈现、会话沙箱/取消和应用权限探针，再安全部署到原 URL 并刷新页面核对。
- 截至归档前，此轮源码和测试未构建或部署；归档提交可在 Git 历史中查看。README 的“开发中、不支持安装”声明仍有效。
