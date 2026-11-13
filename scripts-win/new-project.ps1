# 从 template/ 复制出一个新项目，装好依赖，打印下一步
# 用法：
#   scripts-win\new-project.ps1 我的宣传片
#   scripts-win\new-project.ps1 我的宣传片 -Dest D:\work -SkipInstall

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)][string]$Name,
    [string]$Dest = '',
    [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'

$template = Join-Path (Split-Path -Parent $PSScriptRoot) 'template'
if (-not (Test-Path -LiteralPath (Join-Path $template 'package.json'))) {
    throw "找不到模板：$template"
}

if (-not $Dest) { $Dest = (Get-Location).Path }
if (-not (Test-Path -LiteralPath $Dest)) {
    New-Item -ItemType Directory -Force -Path $Dest | Out-Null
}
$target = Join-Path $Dest $Name

if (Test-Path -LiteralPath $target) {
    $existing = Get-ChildItem -LiteralPath $target -Force
    if ($existing) { throw "目标目录已存在且不为空：$target" }
} else {
    New-Item -ItemType Directory -Force -Path $target | Out-Null
}

# 复制模板，跳过 node_modules / out / .git
$null = robocopy $template $target /E /XD node_modules out .git /NFL /NDL /NJH /NJS /NP
if ($LASTEXITCODE -ge 8) { throw "复制失败（robocopy exit $LASTEXITCODE）" }

$out = Join-Path $target 'out'
$public = Join-Path $target 'public'
foreach ($d in @($out, $public)) {
    if (-not (Test-Path -LiteralPath $d)) { New-Item -ItemType Directory -Force -Path $d | Out-Null }
}

# 改包名，避免两个项目在 npm 里同名
# 注意：PowerShell 5.1 不支持 -Encoding utf8NoBOM，必须显式用 UTF8Encoding($false)
$pkgPath = Join-Path $target 'package.json'
$pkg = Get-Content -LiteralPath $pkgPath -Raw -Encoding UTF8 | ConvertFrom-Json
$pkg.name = ($Name -replace '[^A-Za-z0-9._-]', '-')
$json = $pkg | ConvertTo-Json -Depth 20
[System.IO.File]::WriteAllText($pkgPath, $json, (New-Object System.Text.UTF8Encoding($false)))

Write-Host "已创建：$target" -ForegroundColor Green

if (-not $SkipInstall) {
    Write-Host "安装依赖（约 2 分钟，首次还要下载 Remotion 的 Headless Shell ~130MB）..." -ForegroundColor Cyan
    Push-Location $target
    # 注意用 npm.cmd：npm.ps1 会被执行策略拦下
    & npm.cmd install --no-audit --no-fund
    $code = $LASTEXITCODE
    Pop-Location
    if ($code -ne 0) { throw "npm install 失败（exit $code）" }
}

Write-Host ""
Write-Host "下一步：" -ForegroundColor Yellow
Write-Host "  1. 读 references\需求问询.md，两轮提问，写成 $Name\需求确认.md"
Write-Host "  2. 改 $Name\timing.json（唯一的时间真相）"
Write-Host "  3. cd $target; npm run render"
