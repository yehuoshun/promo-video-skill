# 按时间轴批量截帧，产出审片用的 out/stills/。
#
# 为什么要有这条命令：AGENTS 第 8 阶段要求「静帧审查 out/stills/」，红线 1 还规定了
# 「每个场景至少截 2 帧（35% / 85% 处）」，check_stills.py 和 verify.ps1 第 7 步也都
# 盯这个目录，但 template 里只有单帧的 npm run still。缺了这一步，每个人都要手写
# 一串 npx remotion still --frame=N，帧号挑得随心，文件名排序还不一定等于时间顺序——
# 最后 check_stills 比出来的「相邻差值」是假的。
#
# 用法（在项目目录下）：
#   ..\scripts-win\stills.cmd .                # 每场景 35% / 85% + 首尾帧（默认；最后一段只截 35%）
#   ..\scripts-win\stills.cmd . -Mid           # 每个场景只截中点，帧数减半
#   ..\scripts-win\stills.cmd . -Step 0.5      # 每 0.5 秒一帧（长片审节奏用）
#   ..\scripts-win\stills.cmd . -Keep          # 不清理已有静帧（增量补）
#   ..\scripts-win\stills.cmd . -Composition Main4k
#
# 输出：<项目>\out\stills\f0000.png
#   文件名补零，按名字排序 == 时间顺序；check_stills.py 的 frame_no() 取文件名里
#   最后一串数字当帧号，所以前缀和补零位数都别乱改。

param(
    [Parameter(Position = 0)][string]$Project = ".",
    [double]$Step = 0,
    [switch]$Mid,
    [string]$Composition = "Main",
    [string]$Prefix = "f",
    [switch]$Keep,
    [switch]$Quiet
)

$ErrorActionPreference = "Stop"

function Fail([string]$message) {
    Write-Host ""
    Write-Host $message -ForegroundColor Red
    exit 1
}

function RoundFrame([double]$value) {
    # 用四舍五入（.NET 的 Math.Round 默认是银行家舍入，0.5 会往偶数靠，这里不用）
    return [int][Math]::Floor($value + 0.5)
}

if (-not (Test-Path -LiteralPath $Project)) { Fail "找不到目录：$Project" }
$proj = (Resolve-Path -LiteralPath $Project).Path

$timingPath = Join-Path $proj "timing.json"
if (-not (Test-Path -LiteralPath $timingPath)) {
    Fail "这不是片子工程目录：$proj`n缺 timing.json。新建工程用 scripts-win\new-project.cmd。"
}

try {
    $timing = Get-Content -LiteralPath $timingPath -Raw -Encoding UTF8 | ConvertFrom-Json
} catch {
    Fail "timing.json 不是合法 JSON：$timingPath`n$($_.Exception.Message)"
}

$fps = [double]$timing.fps
if ($fps -le 0) { Fail "timing.json 里的 fps 是空的或不是正数：$($timing.fps)" }
$duration = [double]$timing.duration
if ($duration -le 0) { Fail "timing.json 里的 duration 是空的或不是正数：$($timing.duration)" }
$scenes = @($timing.scenes)

# ---- 算哪几帧 ----
$picks = New-Object System.Collections.ArrayList

function AddPick([int]$frame, [string]$why) {
    if ($frame -lt 0) { return }
    foreach ($p in $script:picks) {
        if ($p.Frame -eq $frame) { return }
    }
    [void]$script:picks.Add([pscustomobject]@{ Frame = $frame; Why = $why })
}

if ($Step -gt 0) {
    $t = 0.0
    while ($t -lt $duration) {
        AddPick (RoundFrame ($t * $fps)) ""
        $t += $Step
    }
} else {
    AddPick 0 "首帧"
    $valid = @($scenes | Where-Object { $null -ne $_.start -and $null -ne $_.end })
    $i = 0
    foreach ($sc in $valid) {
        $i++
        $s = [double]$sc.start
        $e = [double]$sc.end
        $who = $sc.id
        if (-not $who) { $who = $sc.layout }
        if ($Mid) {
            $m = ($s + $e) / 2
            AddPick (RoundFrame ($m * $fps)) ("{0} 中点 {1:N2}s" -f $who, $m)
        } else {
            # 红线 1：35% 处动效已到位、85% 处看退场和下一段怎么接上。
            # 最后一段没有「下一段」可接，它的 85% 会和末帧挤在同一个静止尾巴上
            # （实测 0.67s 内几乎零变化，check_stills 会把它当「这段没动」），所以只截 35%。
            $ratios = @(0.35, 0.85)
            if ($i -eq $valid.Count) { $ratios = @(0.35) }
            foreach ($r in $ratios) {
                $t = $s + ($e - $s) * $r
                AddPick (RoundFrame ($t * $fps)) ("{0} {1}% {2:N2}s" -f $who, ($r * 100), $t)
            }
        }
    }
    # 末帧 = 总帧数 - 1（remotion 的 frame 从 0 起，第 450 帧不存在，最大 449）
    AddPick ((RoundFrame ($duration * $fps)) - 1) "末帧"
}

$frames = @($picks | Sort-Object Frame)
if ($frames.Count -eq 0) {
    Fail "算不出要截的帧：检查 timing.json 的 duration 和 scenes[].start/end"
}

$outDir = Join-Path $proj "out\stills"
if (-not (Test-Path -LiteralPath $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

if (-not $Keep) {
    $stale = @(Get-ChildItem -LiteralPath $outDir -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Extension -match "^\.(png|jpg|jpeg|webp|bmp)$" })
    foreach ($f in $stale) { Remove-Item -LiteralPath $f.FullName -Force }
    if ($stale.Count -gt 0 -and -not $Quiet) {
        Write-Host ("清掉旧静帧 {0} 张（不清理会混进上一版的时间轴）" -f $stale.Count) -ForegroundColor DarkGray
    }
}

if (-not $Quiet) {
    Write-Host ("截 {0} 帧 → {1}" -f $frames.Count, $outDir) -ForegroundColor Cyan
    Write-Host ("  画布 {0}×{1} @ {2}fps，共 {3:N2}s" -f $timing.width, $timing.height, $fps, $duration) -ForegroundColor DarkGray
}

# ---- 逐帧截 ----
$index = 0
$started = Get-Date
foreach ($p in $frames) {
    $index++
    $name = "{0}{1:0000}.png" -f $Prefix, $p.Frame
    $rel = "out/stills/" + $name
    $sec = $p.Frame / $fps
    $tail = ""
    if ($p.Why) { $tail = "，" + $p.Why }
    if (-not $Quiet) {
        Write-Host ("  [{0}/{1}] 第 {2} 帧（{3:N2}s{4}）→ {5}" -f $index, $frames.Count, $p.Frame, $sec, $tail, $name)
    }
    $line = 'cd /d "' + $proj + '" && npx remotion still src/index.ts ' + $Composition + ' ' + $rel + ' --frame=' + $p.Frame + ' --log=error'
    & cmd.exe /c $line
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Fail ("截图失败：第 {0} 帧（{1}），退出码 {2}`n单独跑一次看完整报错：`n  cd /d `"{3}`" && npx remotion still src/index.ts {4} {5} --frame={0}" -f $p.Frame, $p.Why, $LASTEXITCODE, $proj, $Composition, $rel)
    }
}

$elapsed = ((Get-Date) - $started).TotalSeconds
Write-Host ""
Write-Host ("已截 {0} 张，用时 {1:N1}s：{2}" -f $frames.Count, $elapsed, $outDir) -ForegroundColor Green
Write-Host "下一步：" -ForegroundColor Cyan
Write-Host ("  python scripts-win\check_stills.py `"{0}`"" -f $outDir)
Write-Host ("  python scripts-win\sheet.py --dir `"{0}`" --out out\sheet.jpg --cols 3" -f $outDir)
Write-Host "  然后一张张看：静止的那段是不是该动的东西没接上 frame"
exit 0
