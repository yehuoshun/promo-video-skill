# 环境体检（Windows / PowerShell）
# 用法：powershell -File scripts-win/doctor.ps1
#       缺什么会给出安装建议；有 FAIL 时退出码 1。

param([switch]$Quiet)

$ErrorActionPreference = 'Continue'
$results = New-Object System.Collections.Generic.List[object]

function Add-Result {
    param([string]$Name, [string]$Status, [string]$Detail, [string]$Fix = '')
    $results.Add([pscustomobject]@{
            Item   = $Name
            Status = $Status
            Detail = $Detail
            Fix    = $Fix
        })
}

function Get-CmdPath {
    param([string]$Name)
    $c = Get-Command $Name -ErrorAction SilentlyContinue
    if ($c) { return $c.Source } else { return $null }
}

# ---------- Node ----------
$node = Get-CmdPath 'node'
if (-not $node) {
    Add-Result 'Node.js' 'FAIL' '未安装' 'winget install OpenJS.NodeJS.LTS'
}
else {
    $ver = (& node -v) -replace '^v', ''
    $major = [int]($ver.Split('.')[0])
    if ($major -ge 18) { Add-Result 'Node.js' 'OK' "v$ver ($node)" }
    else { Add-Result 'Node.js' 'FAIL' "v$ver 太旧（需 ≥18）" 'winget upgrade OpenJS.NodeJS.LTS' }
}

$npm = Get-CmdPath 'npm'
if ($npm) { Add-Result 'npm' 'OK' ((& npm -v) 2>&1 | Select-Object -First 1) }
else { Add-Result 'npm' 'WARN' '未找到（Remotion 需要）' '随 Node.js 一起安装' }

# ---------- Python ----------
$py = Get-CmdPath 'python'
if (-not $py) {
    Add-Result 'Python' 'FAIL' '未安装（或只有 py 启动器）' 'winget install Python.Python.3.12'
}
else {
    $pv = (& python -c "import sys;print('%d.%d.%d'%sys.version_info[:3])") 2>&1
    Add-Result 'Python' 'OK' "$pv ($py)"
    $pil = (& python -c "import PIL;print(PIL.__version__)") 2>&1
    if ($LASTEXITCODE -eq 0) { Add-Result 'Pillow' 'OK' $pil }
    else { Add-Result 'Pillow' 'FAIL' '未安装（拼对比图、审图统计要用）' 'python -m pip install pillow' }
}

# ---------- ffmpeg ----------
$ff = Get-CmdPath 'ffmpeg'
if ($ff) {
    $fv = (& ffmpeg -version 2>&1 | Select-Object -First 1)
    Add-Result 'ffmpeg' 'OK' $fv
}
else {
    Add-Result 'ffmpeg' 'WARN' '未安装：混音、成片抽帧、换音轨会用到' 'winget install Gyan.FFmpeg'
}

# ---------- 浏览器 ----------
$chromeCandidates = @(
    @(
        (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
        (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe'),
        (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe')
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
)

if ($chromeCandidates.Count -gt 0) {
    Add-Result 'Chrome/Edge' 'OK' $chromeCandidates[0]
}
else {
    Add-Result 'Chrome/Edge' 'FAIL' '未找到：截样帧与静帧都要用' 'winget install Google.Chrome'
}

# ---------- Git ----------
$git = Get-CmdPath 'git'
if ($git) { Add-Result 'git' 'OK' ((& git --version) 2>&1) }
else { Add-Result 'git' 'WARN' '未安装' 'winget install Git.Git' }

# ---------- 中文字体 ----------
$fonts = @(
    (Join-Path $env:WINDIR 'Fonts\msyh.ttc'),
    (Join-Path $env:WINDIR 'Fonts\msyhbd.ttc'),
    (Join-Path $env:WINDIR 'Fonts\simhei.ttf')
) | Where-Object { Test-Path -LiteralPath $_ }
if ($fonts.Count -gt 0) { Add-Result '中文字体' 'OK' ((Split-Path -Leaf $fonts[0])) }
else { Add-Result '中文字体' 'WARN' '未找到微软雅黑/黑体，渲染中文会缺字' '' }

# ---------- 磁盘 ----------
$free = [math]::Round((Get-PSDrive -Name ($env:SystemDrive -replace ':', '')).Free / 1GB, 1)
if ($free -ge 10) { Add-Result '磁盘剩余' 'OK' "$free GB" }
else { Add-Result '磁盘剩余' 'WARN' "$free GB（4K 渲染与中间帧很吃空间）" '清理磁盘' }

# ---------- 输出 ----------
if (-not $Quiet) {
    $results | Format-Table -AutoSize -Wrap Item, Status, Detail
    $fixes = $results | Where-Object { $_.Fix -ne '' }
    if ($fixes) {
        Write-Host "`n可执行的修复建议：" -ForegroundColor Yellow
        $fixes | ForEach-Object { Write-Host ("  [{0}] {1}" -f $_.Item, $_.Fix) -ForegroundColor DarkYellow }
    }
}

$fail = @($results | Where-Object { $_.Status -eq 'FAIL' }).Count
$warn = @($results | Where-Object { $_.Status -eq 'WARN' }).Count
$ok = $results.Count - $fail - $warn
Write-Host ""
$color = if ($fail -gt 0) { 'Red' } elseif ($warn -gt 0) { 'Yellow' } else { 'Green' }
Write-Host ("体检结果：{0} OK / {1} WARN / {2} FAIL" -f $ok, $warn, $fail) -ForegroundColor $color

exit $(if ($fail -gt 0) { 1 } else { 0 })
