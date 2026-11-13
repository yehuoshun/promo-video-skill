# 排版探针：打开一张 HTML，在真浏览器的排版结果上查四件事——文字被裁、图片变形、出画、字体缺失。
# 用法：
#   powershell -File scripts-win/probe.ps1 -Html examples/card.html
#   powershell -File scripts-win/probe.ps1 examples/card.html -Strict -Json
#
# 和 check_*.py 的分工：那些脚本看的是文件（尺寸、码率、时间轴），这个看的是**渲染后的 DOM**，
# 所以能抓到「图片被拉扁」「文字溢出容器」这类只有在浏览器里才成立的问题。
# 需要 Chrome / Edge，不需要 Playwright。

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)][string]$Html,
    [int]$Width = 1920,
    [int]$Height = 1080,
    [int]$WaitMs = 2500,
    [switch]$Strict,
    [switch]$Json,
    [string]$Chrome = ''
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $Html)) { throw "找不到 HTML：$Html" }
$htmlPath = (Resolve-Path -LiteralPath $Html).Path
$dir = Split-Path -Parent $htmlPath
$base = [System.IO.Path]::GetFileNameWithoutExtension($htmlPath)
$probeJs = Join-Path $PSScriptRoot 'probe.js'
if (-not (Test-Path -LiteralPath $probeJs)) { throw "找不到探针脚本：$probeJs" }

if (-not $Chrome) {
    $Chrome = @(
        (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
        (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe'),
        (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe')
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
}
if (-not $Chrome) { throw '找不到 Chrome / Edge，请用 -Chrome 指定可执行文件路径' }

$utf8 = New-Object System.Text.UTF8Encoding($false)
$htmlText = [System.IO.File]::ReadAllText($htmlPath, $utf8)
$js = [System.IO.File]::ReadAllText($probeJs, $utf8)

$snippet = "<script>/* dsh-probe */`nwindow.__DSH_CANVAS = { w: $Width, h: $Height };`n$js`n</script>"
$idx = $htmlText.LastIndexOf('</body>', [System.StringComparison]::OrdinalIgnoreCase)
if ($idx -ge 0) { $patched = $htmlText.Insert($idx, $snippet) } else { $patched = $htmlText + $snippet }

# 探针副本必须落在原文件同目录：页面里的相对路径（public/xxx.png）才不会断
$probeHtml = Join-Path $dir (".probe-" + $base + ".html")
[System.IO.File]::WriteAllText($probeHtml, $patched, $utf8)

$uri = ([System.Uri]::new($probeHtml)).AbsoluteUri
$chromeArgs = @(
    '--headless=new'
    '--disable-gpu'
    '--no-sandbox'
    '--hide-scrollbars'
    "--window-size=$Width,$Height"
    "--virtual-time-budget=$WaitMs"
    '--dump-dom'
    $uri
)

$sw = [System.Diagnostics.Stopwatch]::StartNew()
try {
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $dom = (& $Chrome @chromeArgs 2>$null | Out-String)
    $ErrorActionPreference = $prevEap
} finally {
    if (Test-Path -LiteralPath $probeHtml) { Remove-Item -LiteralPath $probeHtml -Force }
}
$sw.Stop()

if (-not $dom -or $dom -notmatch 'id="dsh-probe"') {
    throw "探针没跑起来（页面里没找到 dsh-probe 标记）。多半是页面 CSP 拦了内联脚本，或 Chrome 不支持 --dump-dom。"
}
if ($dom -notmatch 'data-b64="([^"]+)"') {
    throw '探针跑到了，但没吐出结果（data-b64 为空）'
}

$probeJson = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($Matches[1]))
$r = $probeJson | ConvertFrom-Json

$errors = @()
$warns = @()

foreach ($s in @($r.stretch)) {
    $errors += ("图片变形：{0}  渲染 {1}，原图 {2}（差 {3}%）" -f $s.sel, $s.drawn, $s.natural, $s.drift)
}
foreach ($c in @($r.clip)) {
    $errors += ("文字被裁：{0}  {1}超出 {2}px  内容「{3}」" -f $c.sel, $c.axis, $c.over, $c.text)
}
foreach ($b in @($r.bleed)) {
    $line = ("出画：{0}  超出画布 {1}px" -f $b.sel, $b.over)
    if ($Strict) { $errors += $line } else { $warns += $line }
}
foreach ($f in @($r.fonts)) {
    $warns += ("字体缺失：字体栈里的「{0}」本机没有，Chrome 会静默回退成别的字体（渲染出的字不是你设计的那套）" -f $f.family)
}

if ($Json) {
    $out = [ordered]@{
        html   = $htmlPath
        vw     = $r.vw
        vh     = $r.vh
        probe  = "$($r.ms)ms"
        errors = $errors
        warnings = $warns
        raw    = $r
    }
    $out | ConvertTo-Json -Depth 6
} else {
    Write-Host ("探针：{0}  {1}×{2}  用时 {3:N0} ms" -f ([System.IO.Path]::GetFileName($htmlPath)), $r.vw, $r.vh, $sw.Elapsed.TotalMilliseconds)
    if ($errors.Count -eq 0 -and $warns.Count -eq 0) {
        Write-Host '排版检查：文字没被裁、图片没变形、没有元素出画、字体齐全' -ForegroundColor Green
    }
    if ($warns.Count) {
        Write-Host ("`n[WARN] {0} 条" -f $warns.Count) -ForegroundColor Yellow
        foreach ($w in $warns) { Write-Host "  - $w" -ForegroundColor Yellow }
    }
    if ($errors.Count) {
        Write-Host ("`n[ERROR] {0} 条" -f $errors.Count) -ForegroundColor Red
        foreach ($e in $errors) { Write-Host "  - $e" -ForegroundColor Red }
    }
    $color = if ($errors.Count) { 'Red' } elseif ($warns.Count) { 'Yellow' } else { 'Green' }
    Write-Host ("`n结果：{0} ERROR / {1} WARN" -f $errors.Count, $warns.Count) -ForegroundColor $color
}

if ($errors.Count) { exit 1 } else { exit 0 }
