# 用本机 Chrome 抓真实网页截图（可复用登录态）
#
# 为什么不用 Playwright：这个仓库的原则是「只依赖 Node / Python / Chrome 三样」，
# 装一个浏览器驱动要多下 130MB，而且 Windows 上还要处理驱动版本对不上。
# Chrome 自带的 --screenshot 足够抓「整屏」——需要更长的页面就把 -Height 调大。
#
# 两步走：
#   1) 先登录（只会打开一次可见窗口，登录态存进 UserData 目录）
#        scripts-win\grab.cmd "https://www.yuque.com/dashboard" -UserData tmp\yuque-profile -Login
#   2) 之后无头抓图，复用同一个 UserData
#        scripts-win\grab.cmd "https://www.yuque.com/xxx" out\shot.png -UserData tmp\yuque-profile -Height 2600
#
# 注意：同一个 UserData 目录不能被两个 Chrome 同时占用。抓图前把登录窗口关掉。

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)][string]$Url,
    [Parameter(Position = 1)][string]$Out = '',
    [string]$UserData = 'tmp\chrome-profile',
    [switch]$Login,
    [int]$Width = 1920,
    [int]$Height = 1080,
    [int]$Scale = 2,
    [int]$WaitMs = 5000,
    [string]$Chrome = ''
)

$ErrorActionPreference = 'Stop'

if (-not $Chrome) {
    $Chrome = @(
        (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
        (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe'),
        (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe')
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
}
if (-not $Chrome) { throw '找不到 Chrome / Edge，请用 -Chrome 指定路径' }

$profilePath = [System.IO.Path]::GetFullPath($UserData)
if (-not (Test-Path -LiteralPath $profilePath)) { New-Item -ItemType Directory -Force -Path $profilePath | Out-Null }

$common = @(
    "--user-data-dir=$profilePath"
    '--no-first-run'
    '--no-default-browser-check'
    '--disable-features=Translate,MediaRouter'
    "--window-size=$Width,$Height"
)

if ($Login) {
    # 可见窗口：用户扫码登录，登录态落进 profile。关掉窗口后再跑抓图。
    Write-Host '正在打开浏览器，请完成登录；登录后把这个窗口关掉，再回来抓图。' -ForegroundColor Cyan
    & $Chrome @($common + @('--new-window', $Url))
    exit 0
}

if (-not $Out) { throw '抓图模式需要 -Out 指定输出 PNG 路径' }

# 同一个 UserData 被占用时，Chrome 会静默不截图——必须提前拦住并说清楚
$busy = @(Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine.Contains("--user-data-dir=$profilePath") })
if ($busy.Count -gt 0) {
    throw ("UserData 正被 $($busy.Count) 个 Chrome 进程占用（登录窗口还开着？）：`n  pid " +
        (($busy | Select-Object -First 3 -ExpandProperty ProcessId) -join ', ') +
        "`n把那个窗口关掉再抓图；同一个 UserData 不能被两个 Chrome 同时使用。")
}
$outPath = [System.IO.Path]::GetFullPath($Out)
$outDir = Split-Path -Parent $outPath
if (-not (Test-Path -LiteralPath $outDir)) { New-Item -ItemType Directory -Force -Path $outDir | Out-Null }
if (Test-Path -LiteralPath $outPath) { Remove-Item -LiteralPath $outPath -Force }

$args2 = $common + @(
    '--headless=new'
    '--disable-gpu'
    '--hide-scrollbars'
    '--run-all-compositor-stages-before-draw'
    "--force-device-scale-factor=$Scale"
    "--virtual-time-budget=$WaitMs"
    "--screenshot=$outPath"
    $Url
)

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
& $Chrome @args2 2>&1 | Out-Null
$ErrorActionPreference = $prevEap
$sw.Stop()

for ($i = 0; $i -lt 30 -and -not (Test-Path -LiteralPath $outPath); $i++) { Start-Sleep -Milliseconds 150 }
if (-not (Test-Path -LiteralPath $outPath)) { throw "截图失败：$outPath 未生成" }

$size = (Get-Item -LiteralPath $outPath).Length
$dim = ''
$py = Get-Command python -ErrorAction SilentlyContinue
if ($py) { $dim = (& python -c "from PIL import Image;im=Image.open(r'$outPath');print('%dx%d' % im.size)" 2>$null) }
Write-Host ("已生成 {0}  ({1:N0} 字节, {2})  用时 {3:N0} ms" -f $outPath, $size, $(if ($dim) { $dim } else { '尺寸未知' }), $sw.Elapsed.TotalMilliseconds) -ForegroundColor Green
