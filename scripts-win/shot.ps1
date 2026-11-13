# 把一张 HTML 截成 PNG（headless Chrome，支持 2x 设备像素）
# 用法：
#   powershell -File scripts-win/shot.ps1 -Html examples/card.html -Out out/frame.png
#   powershell -File scripts-win/shot.ps1 -Html a.html -Out out/a.png -Width 1920 -Height 1080 -Scale 2
#
# 输出尺寸 = Width*Scale x Height*Scale（默认 1920x1080@2x = 3840x2160）。

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)][string]$Html,
    [Parameter(Mandatory = $true, Position = 1)][string]$Out,
    [int]$Width = 1920,
    [int]$Height = 1080,
    [int]$Scale = 2,
    [int]$WaitMs = 3000,
    [string]$Chrome = ''
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $Html)) { throw "找不到 HTML：$Html" }
$htmlPath = (Resolve-Path -LiteralPath $Html).Path
$outPath = [System.IO.Path]::GetFullPath($Out)
$outDir = Split-Path -Parent $outPath
if (-not (Test-Path -LiteralPath $outDir)) { New-Item -ItemType Directory -Force -Path $outDir | Out-Null }

if (-not $Chrome) {
    $Chrome = @(
        (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
        (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe'),
        (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe')
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
}
if (-not $Chrome) { throw '找不到 Chrome / Edge，请用 -Chrome 指定可执行文件路径' }

$uri = ([System.Uri]::new($htmlPath)).AbsoluteUri
$chromeArgs = @(
    '--headless=new'
    '--disable-gpu'
    '--no-sandbox'
    '--hide-scrollbars'
    '--run-all-compositor-stages-before-draw'
    '--default-background-color=00000000'
    "--force-device-scale-factor=$Scale"
    "--window-size=$Width,$Height"
    "--virtual-time-budget=$WaitMs"
    "--screenshot=$outPath"
    $uri
)

if (Test-Path -LiteralPath $outPath) { Remove-Item -LiteralPath $outPath -Force }

$sw = [System.Diagnostics.Stopwatch]::StartNew()
# Chrome 把「N bytes written to file」写到 stderr，$ErrorActionPreference=Stop 会把它当致命错误，
# 所以这里临时降级，只看文件是否生成。
$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
& $Chrome @chromeArgs 2>&1 | Out-Null
$ErrorActionPreference = $prevEap
$sw.Stop()

for ($i = 0; $i -lt 20 -and -not (Test-Path -LiteralPath $outPath); $i++) { Start-Sleep -Milliseconds 150 }

if (-not (Test-Path -LiteralPath $outPath)) { throw "截图失败：$outPath 未生成（Chrome 参数不被支持时也会这样）" }

$size = (Get-Item -LiteralPath $outPath).Length
$dim = ''
$py = Get-Command python -ErrorAction SilentlyContinue
if ($py) {
    $dim = (& python -c "from PIL import Image;im=Image.open(r'$outPath');print('%dx%d' % im.size)" 2>$null)
}

Write-Host ("已生成 {0}  ({1:N0} 字节, {2})  用时 {3:N0} ms" -f $outPath, $size, $(if ($dim) { $dim } else { '尺寸未知' }), $sw.Elapsed.TotalMilliseconds) -ForegroundColor Green
