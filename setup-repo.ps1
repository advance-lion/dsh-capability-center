# DSH Capability Center — GitHub 仓库创建 & 推送脚本
# 在项目根目录运行: powershell -File setup-repo.ps1

$ErrorActionPreference = "Stop"
$repoName = "dsh-capability-center"
$repoDesc = "Unified capability discovery, installation, configuration, authorization and runtime management for DeepSeek Harness"

Write-Host "=== DSH Capability Center — 仓库初始化 ===" -ForegroundColor Cyan

# 1. Git init
Write-Host "`n[1/5] 初始化 Git 仓库…" -ForegroundColor Yellow
git init
git branch -M main

# 2. Git config (if not set)
$userName = git config user.name
if (-not $userName) {
    git config user.name "advance-lion"
    Write-Host "  设置 user.name = advance-lion"
}
$userEmail = git config user.email
if (-not $userEmail) {
    git config user.email "advance-lion@users.noreply.github.com"
    Write-Host "  设置 user.email"
}

# 3. Add & commit
Write-Host "`n[2/5] 添加文件并提交…" -ForegroundColor Yellow
git add -A
git commit -m "feat: initial project scaffold

- Core: Capability types, Catalog, Registry, Provider interfaces
- Adapters: SkillAdapter (ctx.skills), MCPAdapter (dsh-mcp-client),
  CLIAdapter, IMRecommendationAdapter
- Host: Cordis plugin entry, HTTP routes, RPC protocol
- Client: React main-panel UI with tabs, search, categories, cards, detail
- Connector: Feishu/Lark CLI manifest with sourceUrl
- Build: tsdown dual-entry (host ESM + client CJS), wrap-client.mjs
- Config: tsconfig, tsdown.config, cordis.patch.yml, package.json"

# 4. Create GitHub repo
Write-Host "`n[3/5] 创建 GitHub 仓库…" -ForegroundColor Yellow
gh repo create $repoName --public --description $repoDesc --source=. --remote=origin

# 5. Push
Write-Host "`n[4/5] 推送到 GitHub…" -ForegroundColor Yellow
git push -u origin main

Write-Host "`n[5/5] 完成！" -ForegroundColor Green
Write-Host "仓库地址: https://github.com/advance-lion/$repoName" -ForegroundColor Cyan
Write-Host "`n接下来: cd dsh-capability-center && pnpm install && pnpm run typecheck" -ForegroundColor Gray
