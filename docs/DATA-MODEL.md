# Capability Center 数据模型与持久化设计

## 1. 单库逻辑分区原则

V0.x 使用**一个物理 SQLite 数据库**，Catalog 和 Runtime 作为逻辑分区（表前缀 + 外键）。这样 Recipe 发布、Run 创建、版本快照和 migration 可以在单事务内完成，避免跨库外键缺失和历史孤儿。未来只有在出现独立远程 Catalog 服务或跨设备分发需求时才评估物理拆库。

- `catalog_*` 表：可发布、可审核的应用知识、官方来源和 Recipe。
- `runtime_*` 表：本机连接实例、运行轨迹、Evidence 和 Learned Override。
- Secret 不进入数据库。
- SQLite 使用 WAL、foreign keys、busy timeout 和事务 migration。

建议数据库元信息：

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
```

维护 `schema_migrations(version, applied_at, checksum)`。备份必须使用 SQLite backup API 或受控 checkpoint，不可只复制 `.sqlite` 主文件而遗漏 WAL。

## 2. Catalog Schema v1

```sql
CREATE TABLE integrations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  vendor TEXT,
  description TEXT,
  icon TEXT,
  homepage_url TEXT,
  status TEXT NOT NULL CHECK (status IN ('active','deprecated','blocked')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE connection_methods (
  id TEXT PRIMARY KEY,
  integration_id TEXT NOT NULL REFERENCES integrations(id),
  name TEXT NOT NULL,
  transport_type TEXT NOT NULL,
  identity_type TEXT,
  owner_kind TEXT NOT NULL CHECK (owner_kind IN ('recipe','provider')),
  owner_ref TEXT NOT NULL,
  source_level TEXT NOT NULL,
  recommended_priority INTEGER NOT NULL DEFAULT 100,
  supported_platforms_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE official_sources (
  id TEXT PRIMARY KEY,
  connection_method_id TEXT NOT NULL REFERENCES connection_methods(id),
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  source_type TEXT,
  source_level TEXT NOT NULL,
  published_at TEXT,
  verified_at TEXT,
  review_due_at TEXT,
  content_fingerprint TEXT,
  http_status INTEGER,
  status TEXT NOT NULL DEFAULT 'verified'
);

CREATE TABLE capabilities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  risk_level TEXT,
  description TEXT
);

CREATE TABLE method_capabilities (
  connection_method_id TEXT NOT NULL REFERENCES connection_methods(id),
  capability_id TEXT NOT NULL REFERENCES capabilities(id),
  support_level TEXT NOT NULL,
  required_scopes_json TEXT NOT NULL DEFAULT '[]',
  verification_probe_json TEXT,
  PRIMARY KEY (connection_method_id, capability_id)
);

CREATE TABLE recipes (
  id TEXT PRIMARY KEY,
  connection_method_id TEXT NOT NULL REFERENCES connection_methods(id),
  name TEXT NOT NULL,
  current_version_id TEXT,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE recipe_versions (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES recipes(id),
  version TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  source_type TEXT NOT NULL,
  change_summary TEXT,
  created_at TEXT NOT NULL,
  verified_at TEXT,
  verification_state TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  UNIQUE (recipe_id, version)
);

CREATE TABLE recipe_steps (
  id TEXT PRIMARY KEY,
  recipe_version_id TEXT NOT NULL REFERENCES recipe_versions(id),
  phase TEXT NOT NULL,
  position INTEGER NOT NULL,
  step_type TEXT NOT NULL,
  parameters_json TEXT NOT NULL,
  risk_level TEXT NOT NULL DEFAULT 'read',
  requires_user INTEGER NOT NULL DEFAULT 0,
  timeout_ms INTEGER,
  retry_policy_json TEXT,
  compensation_json TEXT,
  UNIQUE (recipe_version_id, position)
);

CREATE TABLE catalog_change_candidates (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  operation TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_url TEXT,
  before_json TEXT,
  proposed_json TEXT NOT NULL,
  diff_json TEXT,
  validation_json TEXT,
  status TEXT NOT NULL DEFAULT 'candidate',
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  review_note TEXT
);

CREATE TABLE import_batches (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_path TEXT,
  source_sha256 TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL,
  UNIQUE (source_type, source_sha256)
);

CREATE TABLE import_rows (
  batch_id TEXT NOT NULL REFERENCES import_batches(id),
  source_locator TEXT NOT NULL,
  external_id TEXT,
  row_hash TEXT NOT NULL,
  candidate_id TEXT,
  status TEXT NOT NULL,
  error TEXT,
  PRIMARY KEY (batch_id, source_locator)
);
```

## 3. Runtime Schema v1

```sql
CREATE TABLE connection_instances (
  id TEXT PRIMARY KEY,
  integration_id TEXT NOT NULL,
  connection_method_id TEXT NOT NULL,
  owner_kind TEXT NOT NULL CHECK (owner_kind IN ('recipe','provider')),
  owner_provider TEXT,
  external_instance_id TEXT,
  display_name TEXT,
  account_subject_hash TEXT,
  workspace_hash TEXT,
  credential_ref TEXT,
  normalized_status TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 0,
  provider_version TEXT,
  last_verified_at TEXT,
  last_successful_run_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (owner_provider, external_instance_id)
);

CREATE TABLE connection_runs (
  id TEXT PRIMARY KEY,
  connection_instance_id TEXT,
  integration_id TEXT NOT NULL,
  connection_method_id TEXT NOT NULL,
  recipe_version_id TEXT,
  provider_id TEXT,
  provider_version TEXT,
  intent TEXT NOT NULL,
  status TEXT NOT NULL,
  idempotency_key TEXT,
  environment_fingerprint TEXT,
  current_step_position INTEGER,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  error_code TEXT,
  error_summary TEXT,
  UNIQUE (idempotency_key)
);

CREATE TABLE connection_step_runs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES connection_runs(id),
  recipe_step_id TEXT,
  position INTEGER NOT NULL,
  status TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 1,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  output_json TEXT,
  error_code TEXT,
  error_summary TEXT,
  user_action TEXT,
  UNIQUE (run_id, position, attempt)
);

CREATE TABLE verification_evidence (
  id TEXT PRIMARY KEY,
  connection_instance_id TEXT REFERENCES connection_instances(id),
  run_id TEXT REFERENCES connection_runs(id),
  evidence_type TEXT NOT NULL,
  result TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  expires_at TEXT,
  producer_id TEXT NOT NULL,
  producer_version TEXT
);

CREATE TABLE learned_overrides (
  id TEXT PRIMARY KEY,
  integration_id TEXT NOT NULL,
  connection_method_id TEXT NOT NULL,
  recipe_version_id TEXT,
  environment_fingerprint TEXT NOT NULL,
  override_type TEXT NOT NULL,
  patch_json TEXT NOT NULL,
  source_run_id TEXT NOT NULL REFERENCES connection_runs(id),
  verification_count INTEGER NOT NULL DEFAULT 1,
  trust_state TEXT NOT NULL DEFAULT 'candidate',
  created_at TEXT NOT NULL,
  last_verified_at TEXT
);

CREATE TABLE provider_snapshots (
  provider_id TEXT NOT NULL,
  external_instance_id TEXT NOT NULL,
  provider_version TEXT,
  normalized_status TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  expires_at TEXT,
  PRIMARY KEY (provider_id, external_instance_id)
);

CREATE TABLE account_switch_runs (
  id TEXT PRIMARY KEY,
  integration_id TEXT NOT NULL,
  method_id TEXT NOT NULL,
  from_instance_id TEXT,
  to_instance_id TEXT,
  strategy TEXT NOT NULL,
  run_id TEXT REFERENCES connection_runs(id),
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
```

## 4. JSON 字段约束

所有 `*_json` 字段在 Repository 层进行 Schema 校验。数据库中的 JSON 不是无约束垃圾桶。

- `parameters_json`：只允许对应 Step Executor 的输入 Schema；
- `output_json`：只允许 Executor 声明的可持久化字段；
- `snapshot_json`：只允许 Provider Summary Schema；
- `patch_json`：只允许安全 Override 操作；
- `validation_json`：包含结构校验、来源检查和风险检查，不包含 Secret。

## 5. Repository 边界

```ts
interface CatalogRepository {
  listIntegrations(query?: IntegrationQuery): Promise<Integration[]>
  getIntegration(id: string): Promise<Integration | undefined>
  getPublishedRecipe(methodId: string): Promise<RecipeVersion | undefined>
  createCandidate(input: CatalogCandidateInput): Promise<CatalogChangeCandidate>
  publishCandidate(id: string, expectedRevision: number): Promise<void>
}

interface RuntimeRepository {
  upsertProviderSnapshot(snapshot: ProviderSnapshot): Promise<void>
  createRun(input: ConnectionRunInput): Promise<ConnectionRun>
  appendStepResult(runId: string, result: StepRunResult): Promise<void>
  checkpoint(runId: string, checkpoint: RunCheckpoint): Promise<void>
  completeRun(runId: string, evidence: VerificationEvidence[]): Promise<void>
  saveLearnedOverride(input: LearnedOverrideCandidate): Promise<void>
}
```

Repository 使用事务保证：

- Step 成功与 checkpoint 原子写入；
- Instance 状态与最后 Evidence 原子更新；
- Migration 失败时不部分升级；
- Candidate 发布时 RecipeVersion、Steps 和 current pointer 原子提交。

## 6. Migration 策略

- 读兼容 N-2，写当前 N；
- migration 文件不可修改，带 checksum；
- migration 前创建可恢复备份；
- 中断后可幂等重跑；
- 不安全 downgrade 直接拒绝；
- Provider Snapshot Schema 与 Provider compatibility range 独立版本化。

必须维护 golden fixtures：fresh、N-1、N-2、损坏、中断、未知字段和旧凭据引用。

## 7. Excel 导入映射

现有工作表 `接入台账` 映射：

| Excel 字段 | 目标 |
|---|---|
| ID | ConnectionMethod 或外部记录 ID |
| 应用名称、服务商 | Integration |
| 接入方式名称、接入类型、身份类型 | ConnectionMethod |
| 官方文章/项目/文档 URL | OfficialSource |
| 支持能力 | Capability + MethodCapability |
| 安装方式、鉴权方式 | Recipe Candidate，不直接发布 |
| 验证状态、核验日期、复查日期 | Source/Recipe verification metadata |
| 本机状态、Skill 路径 | Import note；不进入共享 Catalog 事实 |

导入器只创建 Candidate。含自然语言的安装/鉴权字段需要编译为 Recipe 时，必须经过 Step Schema 校验和审核。

## 8. 数据保留

建议：

- 成功 Run 摘要：长期保留；
- Step 输出：90 天，可配置；
- 失败 Run：180 天或达到条目上限；
- Provider 快照：每实例保留最新值，历史通过 Evidence；
- OAuth/QR challenge：完成或过期后立即删除敏感载荷；
- 导出默认不包含账号 subject hash 和路径，可显式选择脱敏诊断包。

## 9. Schema 完整性补充

以下约束必须在 Repository 层或 SQLite CHECK/Trigger 落实，不能仅靠应用代码约定。

### 9.1 乐观并发

`catalog_change_candidates`、`integrations`、`connection_methods`、`recipes` 和 `connection_instances` 必须包含 `revision INTEGER NOT NULL DEFAULT 1`。所有更新操作带 `WHERE revision = :expected` 并递增。`publishCandidate(id, expectedRevision)` 依赖此字段。

### 9.2 RecipeVersion 不可变

`recipe_versions` 和 `recipe_steps` 禁止 UPDATE/DELETE。通过 Repository 只暴露 INSERT 路径，并建议 SQLite Trigger：

```sql
CREATE TRIGGER recipe_versions_no_update
  BEFORE UPDATE ON recipe_versions
  BEGIN
    SELECT RAISE(ABORT, 'recipe_versions is immutable');
  END;

CREATE TRIGGER recipe_versions_no_delete
  BEFORE DELETE ON recipe_versions
  BEGIN
    SELECT RAISE(ABORT, 'recipe_versions is immutable');
  END;
```

`recipes.current_version_id` 必须指向同一 `recipe_id` 下的 `recipe_versions.id`，由 Repository 校验。

### 9.3 Owner 约束

`connection_instances` 按 `owner_kind` 施加不同约束：

```sql
-- recipe-owned 必须有 recipe_version_id
CHECK (
  (owner_kind = 'recipe' AND recipe_version_id IS NOT NULL)
  OR
  (owner_kind = 'provider' AND owner_provider IS NOT NULL AND external_instance_id IS NOT NULL)
)

-- provider-owned 唯一
CREATE UNIQUE INDEX idx_provider_instance
  ON connection_instances(owner_provider, external_instance_id)
  WHERE owner_kind = 'provider';

-- recipe-owned 唯一
CREATE UNIQUE INDEX idx_recipe_instance
  ON connection_instances(integration_id, connection_method_id, account_subject_hash)
  WHERE owner_kind = 'recipe' AND account_subject_hash IS NOT NULL;
```

### 9.4 Active 实例作用域

`active = 1` 在同一 `(integration_id, connection_method_id)` 下至多一条：

```sql
CREATE UNIQUE INDEX idx_active_per_method
  ON connection_instances(integration_id, connection_method_id)
  WHERE active = 1;
```

### 9.5 状态枚举

所有状态字段使用 CHECK 约束绑定到版本化词汇表。`connection_runs.status`、`connection_step_runs.status`、`normalized_status`、`evidence result/type`、`source_level`、`method status` 等不接受任意字符串。

### 9.6 幂等键作用域

`idempotency_key` 作用域为 `(caller, operation, target_instance_id)`，非全局唯一。带 TTL 和 request_hash 冲突语义：

```sql
CREATE UNIQUE INDEX idx_idempotency
  ON connection_runs(caller_id, intent, target_instance_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
```

### 9.7 Owner Lease 与 Fencing

`connection_instances` 和 `provider_snapshots` 包含 `owner_generation INTEGER`。Provider 回调或异步更新必须携带 generation；不匹配时拒绝写入，防止 stale callback 覆盖当前 Owner。

### 9.8 审计与审批

新增 `audit_records` 表：

```sql
CREATE TABLE audit_records (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  authority TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  plan_digest TEXT,
  decision TEXT NOT NULL,
  correlation_id TEXT,
  confirmed_at TEXT,
  created_at TEXT NOT NULL
);
```

所有破坏性确认、Candidate 审核和 Provider Action 执行必须产生审计记录。

### 9.9 Evidence 超替

`verification_evidence` 增加 `superseded_by TEXT`。新 Evidence 写入时在同一事务中将同实例同类型的旧 Evidence 标记为 superseded。Owner/Provider/Recipe 版本变化时相关 Evidence 自动失效。

### 9.10 Provider Snapshot 投影

`provider_snapshots.snapshot_json` 是可替换缓存，不是审计记录。规范投影规则：normalized 列是权威字段，`snapshot_json` 只保存额外 safeMetadata。每次写入计算 `snapshot_digest` 并递增 `snapshot_revision`。过期后 Aggregator 必须重新获取，不能使用缓存支撑 `connected`。

### 9.11 跨分区历史引用

每个 `connection_runs` 保存 `catalog_release_id`、`recipe_version_id`、`method_digest` 和 `recipe_digest`。即使未来 Catalog 废弃或物理拆库，历史 Run 仍可解释。Catalog GC 不得删除被 Runtime 引用的 RecipeVersion。
