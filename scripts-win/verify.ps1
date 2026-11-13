# 一把过：把散着的检查串成一条命令，交付前只跑这一个。
#
# 为什么要有它：到 P3 为止已经有六个闸门（环境、时间轴、素材、静帧、排版、成片），
# 但它们分散在 docs 和 AGENTS 的阶段表里，靠人记住「这一步该跑哪三个」。
# 忘一条就等于没有——所以合成一条，一条命令出结论，任一 ERROR 就 exit 1。
#
# 用法：
#   scripts-win\verify.cmd .                      # 体检当前目录这个项目
#   scripts-win\verify.cmd ..\my-video -AllowShort # demo 片短于 45 秒也算过
#   scripts-win\verify.cmd . -Html 样帧.html       # 指定要探针的样帧
#   scripts-win\verify.cmd -Self                  # 体检工具本身（加编码检查 + examples/ 里的样帧）
#
# 参数：
#   -Project        项目目录（位置 0，默认 .）
#   -Html           要跑排版探针的 HTML，可写多个；默认扫项目根目录的 *.html
#   -Video          指定要验收的 mp4；默认按 final-4k → final-1080p → final → demo-* → 最新
#   -RequireAssets  至少要有几张真实素材（默认 0 不要求；正式片按 AGENTS 写 8）
#   -MinAssetWidth  素材最小宽度（默认 1280）
#   -AllowShort     不检查总时长是否在 45~60 秒
#   -Strict         探针把「带文字元素出画」也当 ERROR
#   -SkipEnv        跳过环境体检
#   -Self           体检工具仓库本身（多查编码规整、examples/ 下所有样帧）
#   -Quiet          只打结论，不打中间输出

param(
    [Parameter(Position = 0)][string]$Project = ".",
    [string[]]$Html = @(),
    [string]$Video = '',
    [int]$RequireAssets = 0,
    [int]$MinAssetWidth = 1280,
    [switch]$AllowShort,
    [switch]$Strict,
    [switch]$SkipEnv,
    [switch]$Self,
    [switch]$Quiet,
    [string]$Chrome = ''
)

$ErrorActionPreference = 'Stop'
$swAll = [System.Diagnostics.Stopwatch]::StartNew()

$here = $PSScriptRoot
$toolRepo = Split-Path -Parent $here          # 工具仓库根（scripts-win 的上一层）
$py = 'python'
# 注意：不要直接用 'powershell' —— 有的机器 PATH 里有个同名的 0 字节文件会抢先命中，
# 报「无法在管道中间运行文档」。用 $PSHOME 下的全路径最稳。
$psExe = Join-Path $PSHOME 'powershell.exe'

function Resolve-Dir([string]$p) {
    if (-not (Test-Path -LiteralPath $p)) { throw "找不到目录：$p" }
    return (Resolve-Path -LiteralPath $p).Path
}
$root = Resolve-Dir $Project
if ($Self -and $Project -eq '.') {
    # -Self 是「体检工具自己」：项目那半截默认拿 template/ 当样本，
    # 否则在仓库根跑会先报一堆「缺 timing.json、缺 src\scenes」，把真问题淹掉。
    $tpl = Join-Path $toolRepo 'template'
    if (Test-Path -LiteralPath $tpl) { $root = (Resolve-Path -LiteralPath $tpl).Path }
}

# ---------- 显示宽度（中文占两格，不然表格会歪） ----------

function Get-DispWidth([string]$s) {
    $w = 0
    foreach ($ch in $s.ToCharArray()) {
        $c = [int]$ch
        if (($c -ge 0x2E80 -and $c -le 0xA4CF) -or
            ($c -ge 0xAC00 -and $c -le 0xD7A3) -or
            ($c -ge 0xF900 -and $c -le 0xFAFF) -or
            ($c -ge 0xFE30 -and $c -le 0xFE6F) -or
            ($c -ge 0xFF00 -and $c -le 0xFF60) -or
            ($c -ge 0xFFE0 -and $c -le 0xFFE6) -or
            $c -eq 0x2329 -or $c -eq 0x232A) { $w += 2 } else { $w += 1 }
    }
    return $w
}

function Pad([string]$s, [int]$w) {
    $d = $w - (Get-DispWidth $s)
    if ($d -lt 1) { return $s }
    return $s + (' ' * $d)
}

# ---------- 跑一个外部命令，拿回退出码和全部输出 ----------

function Invoke-Proc([string]$exe, [string[]]$argList) {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $lines = New-Object System.Collections.ArrayList
    & $exe @argList 2>&1 | ForEach-Object { [void]$lines.Add("$_") }
    $code = $LASTEXITCODE
    $sw.Stop()
    return [pscustomobject]@{
        Code = $code
        Lines = @($lines)
        Text = ($lines -join "`n")
        Ms = $sw.Elapsed.TotalMilliseconds
    }
}

# ---------- 结果收集 ----------

$results = New-Object System.Collections.ArrayList
$stepNo = 0

function Report {
    param(
        [string]$Name,
        [string]$Status,          # PASS / WARN / SKIP / ERROR
        [double]$Ms,
        [string]$Detail = '',
        [string[]]$Lines = @()
    )
    [void]$results.Add([pscustomobject]@{
        Name = $Name; Status = $Status; Ms = $Ms; Detail = $Detail; Lines = $Lines
    })
    $color = switch ($Status) {
        'PASS' { 'Green' } 'WARN' { 'Yellow' } 'SKIP' { 'DarkGray' } 'ERROR' { 'Red' } default { 'Gray' }
    }
    $tag = switch ($Status) {
        'PASS' { 'OK' } 'WARN' { 'WARN' } 'SKIP' { 'SKIP' } 'ERROR' { 'FAIL' } default { $Status }
    }
    $idx = "[{0,2}]" -f $results.Count
    Write-Host ("{0} {1} {2} {3,6:N1}s  {4}" -f $idx, (Pad $Name 12), (Pad $tag 4), ($Ms / 1000), $Detail) -ForegroundColor $color
    if ($Lines.Count -and $Status -in @('WARN', 'ERROR') -and -not $Quiet) {
        foreach ($l in $Lines) { Write-Host ("        " + $l) -ForegroundColor $color }
    }
    $script:stepNo = $results.Count
}

# 从闸门输出里提炼结论：退出码优先，其次看「N ERROR / M WARN」
function Verdict([pscustomobject]$proc) {
    $err = 0; $warn = 0
    if ($proc.Text -match '(\d+)\s*ERROR') { $err = [int]$Matches[1] }
    if ($proc.Text -match '(\d+)\s*WARN') { $warn = [int]$Matches[1] }
    $detail = Tail $proc.Lines
    if ($proc.Code -ne 0 -or $err -gt 0) {
        return [pscustomobject]@{ Status = 'ERROR'; Err = $err; Warn = $warn; Detail = $detail }
    }
    if ($warn -gt 0) {
        return [pscustomobject]@{ Status = 'WARN'; Err = $err; Warn = $warn; Detail = $detail }
    }
    return [pscustomobject]@{ Status = 'PASS'; Err = 0; Warn = 0; Detail = @() }
}

# 闸门输出的尾巴：去掉最后的「结果：…」汇总行（它已经进了表格），剩下的才是要给人看的明细。
# 按关键词筛（| Where-Object { $_ -match 'ERROR' }）不行：真正的错因行往往一个关键字都没有，
# 比如「时长 18.00s，期望 15.00s」，只有上面的「[ERROR] 1 条」标题带关键字。
function Tail([string[]]$lines, [int]$n = 6) {
    $keep = @($lines | ForEach-Object { $_.TrimEnd() } |
              Where-Object { $_ -ne '' -and $_ -notmatch '^\s*(结果|体检结果)[:：]' })
    if ($keep.Count -gt $n) { $keep = $keep[($keep.Count - $n)..($keep.Count - 1)] }
    return $keep
}

# 表格里那列「一句话结论」：不通过就给条数，通过就给闸门自己的汇总（去掉「结果：」前缀）。
function VerdictText([pscustomobject]$v, [pscustomobject]$proc) {
    if ($v.Status -ne 'PASS') {
        if ($v.Err -gt 0) { return ("{0} 个错误" -f $v.Err) }
        return ("{0} 条警告" -f $v.Warn)
    }
    foreach ($l in $proc.Lines) { if ($l -match '结果[:：]') { return ($l.Trim() -replace '^结果[:：]\s*', '') } }
    # 有些闸门（比如 fix-encoding）没有「结果：」这行，就给最后一句
    $tail = @($proc.Lines | Where-Object { $_ -ne '' })
    if ($tail.Count) { return $tail[$tail.Count - 1].Trim() }
    return '通过'
}
Write-Host ''
Write-Host ("体检目录：" + $root) -ForegroundColor Cyan
Write-Host ''

# ---------- 1. 目录结构 ----------

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$need = @('timing.json', 'src\scenes')
$missing = @($need | Where-Object { -not (Test-Path -LiteralPath (Join-Path $root $_)) })
$hasPublic = Test-Path -LiteralPath (Join-Path $root 'public')
$sw.Stop()
if ($missing.Count) {
    Report '目录结构' 'ERROR' $sw.Elapsed.TotalMilliseconds ("缺 " + ($missing -join '、') + "（先跑 new-project.cmd）")
} else {
    $desc = 'timing.json、src/scenes'
    if ($hasPublic) { $desc += '、public' }
    Report '目录结构' 'PASS' $sw.Elapsed.TotalMilliseconds $desc
}

$timingPath = Join-Path $root 'timing.json'
$timing = $null
if (Test-Path -LiteralPath $timingPath) {
    try { $timing = Get-Content -LiteralPath $timingPath -Raw -Encoding UTF8 | ConvertFrom-Json } catch { $timing = $null }
}
$pw = 1920; $ph = 1080
if ($timing -and $timing.PSObject.Properties['width'] -and $timing.width) { $pw = [int]$timing.width }
if ($timing -and $timing.PSObject.Properties['height'] -and $timing.height) { $ph = [int]$timing.height }

# ---------- 2. 环境体检 ----------

if (-not $SkipEnv) {
    $doctor = Join-Path $here 'doctor.ps1'
    $sw.Restart()
    $p = Invoke-Proc $psExe @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $doctor)
    $sw.Stop()
    $v = Verdict $p
    $line = ($p.Lines | Where-Object { $_ -match '体检结果' } | Select-Object -Last 1)
    if (-not $line) { $line = ($p.Lines | Select-Object -Last 1) }
    Report '环境' $v.Status $sw.Elapsed.TotalMilliseconds "$line".Trim() $v.Detail
}

# ---------- 3. 时间轴 ----------

if (-not (Test-Path -LiteralPath $timingPath)) {
    Report '时间轴' 'SKIP' 0 '没有 timing.json'
} else {
    $argList = @((Join-Path $here 'check_timing.py'), $timingPath)
    if ($AllowShort) { $argList += '--allow-duration' }
    $sw.Restart()
    $p = Invoke-Proc $py $argList
    $sw.Stop()
    $v = Verdict $p
    Report '时间轴' $v.Status $sw.Elapsed.TotalMilliseconds (VerdictText $v $p) $v.Detail
}

# ---------- 4. 素材 ----------

$publicDir = Join-Path $root 'public'
if (-not (Test-Path -LiteralPath $publicDir)) {
    Report '素材' 'SKIP' 0 '没有 public/ 目录'
} else {
    $argList = @((Join-Path $here 'check_assets.py'), $publicDir, '--min-width', "$MinAssetWidth")
    if ($RequireAssets -gt 0) { $argList += @('--require', "$RequireAssets") }
    $sw.Restart()
    $p = Invoke-Proc $py $argList
    $sw.Stop()
    $v = Verdict $p
    Report '素材' $v.Status $sw.Elapsed.TotalMilliseconds (VerdictText $v $p) $v.Detail
}

# ---------- 5. 静帧 ----------

$stillsDir = Join-Path $root 'out\stills'
if (-not (Test-Path -LiteralPath $stillsDir)) {
    Report '静帧' 'SKIP' 0 '没有 out/stills/（还没截帧）'
} else {
    $sw.Restart()
    $p = Invoke-Proc $py @((Join-Path $here 'check_stills.py'), $stillsDir)
    $sw.Stop()
    $v = Verdict $p
    Report '静帧' $v.Status $sw.Elapsed.TotalMilliseconds (VerdictText $v $p) $v.Detail
}

# ---------- 6. 排版探针（HTML 样帧） ----------

if (-not $Html -or $Html.Count -eq 0) {
    $cand = @(Get-ChildItem -LiteralPath $root -Filter '*.html' -File -ErrorAction SilentlyContinue)
    if ($Self) {
        $ex = Join-Path $toolRepo 'examples'
        # examples\bad.html 是「故意做错」的反例，留着它会让 -Self 永远红。
        # 想跑反例就显式指定：verify.cmd -Html examples\bad.html
        if (Test-Path -LiteralPath $ex) {
            $cand += @(Get-ChildItem -LiteralPath $ex -Filter '*.html' -File | Where-Object { $_.Name -notlike 'bad*' })
        }
    }
    $Html = @($cand | ForEach-Object { $_.FullName })
}

if ($Html.Count -eq 0) {
    Report '排版' 'SKIP' 0 '没有 HTML 样帧可探（用 -Html 指定）'
} else {
    $probe = Join-Path $here 'probe.ps1'
    $worst = 'PASS'; $totalMs = 0.0; $detailLines = @(); $names = @()
    foreach ($h in $Html) {
        $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $probe, $h, '-Width', "$pw", '-Height', "$ph", '-Json')
        if ($Strict) { $argList += '-Strict' }
        if ($Chrome) { $argList += @('-Chrome', $Chrome) }
        $sw.Restart()
        $p = Invoke-Proc $psExe $argList
        $sw.Stop()
        $totalMs += $sw.Elapsed.TotalMilliseconds
        $names += [System.IO.Path]::GetFileName($h)
        $nErr = 0; $nWarn = 0
        try {
            $j = $p.Text | ConvertFrom-Json
            $nErr = @($j.errors).Count
            $nWarn = @($j.warnings).Count
            foreach ($e in @($j.errors)) { if ($e) { $detailLines += "错误 " + [System.IO.Path]::GetFileName($h) + "：" + $e } }
            foreach ($w in @($j.warnings)) { if ($w) { $detailLines += "警告 " + [System.IO.Path]::GetFileName($h) + "：" + $w } }
        } catch {
            if ($p.Code -ne 0) { $nErr = 1; $detailLines += [System.IO.Path]::GetFileName($h) + "：探针运行失败" }
        }
        if ($nErr -gt 0) { $worst = 'ERROR' }
        elseif ($nWarn -gt 0 -and $worst -eq 'PASS') { $worst = 'WARN' }
    }
    $detail = "$($Html.Count) 张：" + (($names | Select-Object -First 3) -join '、')
    if ($names.Count -gt 3) { $detail += ' 等' }
    Report '排版' $worst $totalMs $detail @($detailLines | Select-Object -First 8)
}

# ---------- 7. 成片 ----------

$outDir = Join-Path $root 'out'
$mp4 = $null
if ($Video) {
    if (-not (Test-Path -LiteralPath $Video)) { throw "找不到视频：$Video" }
    $mp4 = (Resolve-Path -LiteralPath $Video).Path
}
# 顺序有讲究：先交付物、再 demo，最后才「目录里最新的 mp4」。
# 直接取最新会把样板间 out/effects.mp4（18 秒，本来就对不上 timing.json）误判成成片。
if (-not $mp4) {
    foreach ($n in 'final-4k.mp4', 'final-1080p.mp4', 'final.mp4', 'demo-4k.mp4', 'demo-1080p.mp4', 'demo.mp4') {
        $cand = Join-Path $outDir $n
        if (Test-Path -LiteralPath $cand) { $mp4 = $cand; break }
    }
}
if (-not $mp4 -and (Test-Path -LiteralPath $outDir)) {
    $mp4 = (Get-ChildItem -LiteralPath $outDir -Filter '*.mp4' -File -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
}

if (-not $mp4) {
    Report '成片' 'SKIP' 0 '没有 out/*.mp4（还没渲染）'
} else {
    $argList = @((Join-Path $here 'check_video.py'), $mp4)
    if (Test-Path -LiteralPath $timingPath) { $argList += @('--timing', $timingPath) }
    $sw.Restart()
    $p = Invoke-Proc $py $argList
    $sw.Stop()
    $v = Verdict $p
    Report '成片' $v.Status $sw.Elapsed.TotalMilliseconds (($([System.IO.Path]::GetFileName($mp4)) + '  ' + (VerdictText $v $p))) $v.Detail
}

# ---------- 8. 编码（只在 -Self 时查工具仓库自己） ----------

if ($Self) {
    $fix = Join-Path $here 'fix-encoding.ps1'
    if (Test-Path -LiteralPath $fix) {
        $sw.Restart()
        $p = Invoke-Proc $psExe @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $fix, $toolRepo, '-Check')
        $sw.Stop()
        $v = Verdict $p
        Report '编码' $v.Status $sw.Elapsed.TotalMilliseconds (VerdictText $v $p) $v.Detail
    }
}

# ---------- 汇总 ----------

$swAll.Stop()
$pass = @($results | Where-Object { $_.Status -eq 'PASS' }).Count
$warn = @($results | Where-Object { $_.Status -eq 'WARN' }).Count
$fail = @($results | Where-Object { $_.Status -eq 'ERROR' }).Count
$skip = @($results | Where-Object { $_.Status -eq 'SKIP' }).Count

Write-Host ''
Write-Host ('-' * 66) -ForegroundColor DarkGray
$line = "结果：{0} 通过 / {1} 警告 / {2} 失败 / {3} 跳过（{4:N1} 秒）" -f $pass, $warn, $fail, $skip, ($swAll.Elapsed.TotalSeconds)
$color = if ($fail -gt 0) { 'Red' } elseif ($warn -gt 0) { 'Yellow' } else { 'Green' }
Write-Host $line -ForegroundColor $color

if ($fail -gt 0) {
    Write-Host "`n失败项：" -ForegroundColor Red
    foreach ($r in $results) {
        if ($r.Status -eq 'ERROR') { Write-Host ("  - " + $r.Name + "：" + $r.Detail) -ForegroundColor Red }
    }
    Write-Host "`n修完再跑一次这条命令。" -ForegroundColor Red
    exit 1
}
if ($warn -gt 0) {
    Write-Host "`n警告不拦交付，但交付前逐条看一眼。" -ForegroundColor Yellow
}
exit 0
