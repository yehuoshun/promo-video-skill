# 一把过：把散着的检查串成一条命令，交付前只跑这一个。
#
# 为什么要有它：到 P6 为止已经有八个闸门（环境、时间轴、素材、配乐、同步、静帧、排版、成片），
# 但它们分散在 docs 和 AGENTS 的阶段表里，靠人记住「这一步该跑哪三个」。
# 忘一条就等于没有——所以合成一条，一条命令出结论，任一 ERROR 就 exit 1。
# 现在串了十一道（多出编码规整、layout 注册校验并进了 check_timing、以及离线渲染素材）。
# 第 11 道是离线渲染素材（public/offline/）：没有这个目录就 SKIP，老项目不受影响。
#
# 用法：
#   scripts-win\verify.cmd .                      # 体检当前目录这个项目
#   scripts-win\verify.cmd ..\my-video -AllowShort # demo 片短于 45 秒也算过
#   scripts-win\verify.cmd . -Html 样帧.html       # 指定要探针的样帧
#   scripts-win\verify.cmd . -Html a.html,b.html  # 多个用逗号隔开（也吃通配符 a\*.html）
#   scripts-win\verify.cmd -Self                  # 体检工具本身（加编码检查 + examples/ 里的样帧）
#
# 参数：
#   -Project        项目目录（位置 0，默认 .）
#   -Html           要跑排版探针的 HTML，可写多个（相对路径也行，脚本自己转绝对）；默认扫项目根目录的 *.html
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
# 子脚本（doctor.ps1 / probe.ps1 / fix-encoding.ps1）要另起一个 PowerShell 进程跑，这里选解释器。
# 注意：不能用 `Join-Path $PSHOME 'powershell.exe'` —— $PSHOME 是「当前宿主」的家目录，
# 用 pwsh 7 跑本脚本时那里只有 pwsh.exe，拼出来的路径不存在，Invoke-Proc 立刻报
# 「术语 '…\powershell.exe' 不会被识别」，最后那道「编码」直接崩（verify.cmd 走 PS 5.1 才一直没暴露）。
# 所以按可用性探测：powershell.exe（PS 5.1，本仓库既定口径）优先，退 pwsh.exe；
# 两个都没有就记一句中文 ERROR、跳过这几个子检查，不抛未捕获异常。
# 也不直接用 'powershell' 这个裸命令 —— 有的机器 PATH 里有个同名的 0 字节文件会抢先命中，
# 报「无法在管道中间运行文档」；Get-Command 拿到的 .Source 是全路径。
$psExe = ''
foreach ($cand in @('powershell.exe', 'pwsh.exe')) {
    $cmd = Get-Command $cand -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($cmd) { $psExe = $cmd.Source; break }
}
$psMissing = '找不到 powershell.exe 也找不到 pwsh.exe，起不了子进程；这一道没法检查（装个 PowerShell 再跑）'

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

# ---------- 先确认这是个片子工程，不是随便一个目录 ----------
# 目录传错时立刻停：否则第 1 步报「缺 timing.json」，后面九道闸门各报一串错，
# 最后「失败项」列一长串，真正的原因（目录错了）反而看不见。
$mustHave = @('timing.json', 'src\scenes')
$missingTop = @($mustHave | Where-Object { -not (Test-Path -LiteralPath (Join-Path $root $_)) })
if ($missingTop.Count) {
    Write-Host ''
    Write-Host ("这不是片子工程目录：" + $root) -ForegroundColor Red
    Write-Host ("缺 " + ($missingTop -join '、') + "。") -ForegroundColor Red
    Write-Host "新建工程用 scripts-win\new-project.cmd；体检已有片子请把目录指对。" -ForegroundColor Red
    exit 1
}

# ---------- -Html 允许相对路径、逗号列表、通配符 ----------
# 两件事常踩：
# 1) 探针是另起进程跑的，工作目录不确定，相对路径到那边就找不到文件，
#    报出来的却是「找不到 HTML」这种离原因很远的错。这里先转成绝对路径。
# 2) 从 verify.cmd 调用走的是 powershell -File，cmd.exe 把 a.html,b.html 当成
#    一个字符串塞进来，[string[]] 参数不会替你按逗号拆 —— 于是它去查一个叫
#    「a.html,b.html」的文件，报「找不到 HTML」。所以这里自己拆，顺带展开通配符。
if ($Html.Count) {
    $want = @()
    foreach ($h in $Html) {
        foreach ($piece in ($h -split ',')) {
            $t = $piece.Trim()
            if ($t) { $want += $t }
        }
    }
    if (-not $want.Count) { $want = @() }
    $resolvedHtml = @()
    foreach ($h in $want) {
        $tries = @($h)
        if (-not [System.IO.Path]::IsPathRooted($h)) {
            $tries += (Join-Path $root $h)
            $tries += (Join-Path $PWD.Path $h)
        }
        $hit = @()
        foreach ($c in $tries) {
            if ($c -match '[\*\?]') {
                $hit = @(Get-ChildItem -Path $c -File -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
            } else {
                $hit = @($c | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf })
            }
            if ($hit.Count) { break }
        }
        if (-not $hit) {
            Write-Host ''
            Write-Host ("找不到 HTML：$h") -ForegroundColor Red
            Write-Host ("试过：" + ($tries -join '  ')) -ForegroundColor DarkGray
            exit 1
        }
        foreach ($one in $hit) { $resolvedHtml += (Resolve-Path -LiteralPath $one).Path }
    }
    $Html = $resolvedHtml
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

function Invoke-PsChild([string]$what, [string[]]$argList) {
    # 跑子脚本（doctor / probe / fix-encoding）的统一入口。$psExe 空着的时候不能硬调 ——
    # `& '' @argList` 在 $ErrorActionPreference='Stop' 下会抛未捕获异常，把整份体检打断；
    # 这里返回一个「跑不起来」的假结果（退出码 127 + 一句中文），Verdict 会判成 ERROR，
    # 明细里就是那句原话，汇总里正常计数、exit 1，没说谎也没崩。
    if (-not $psExe) {
        $msg = "跳过{0}：{1}" -f $what, $psMissing
        return [pscustomobject]@{ Code = 127; Lines = @($msg); Text = $msg; Ms = 0.0 }
    }
    return Invoke-Proc $psExe $argList
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
        if ($v.Warn -gt 0) { return ("{0} 条警告" -f $v.Warn) }
        # 退出码非 0，但输出里没有「N ERROR / M WARN」这种汇总行（fix-encoding 就只列不合规文件）。
        # 这时候不能再写「0 条警告」——真正的原因在明细里，取第一行，抓不到就退回退出码。
        $first = @($v.Detail | Where-Object { $_ -ne '' }) | Select-Object -First 1
        if ($first) { return ($first.Trim() -replace '[:：]\s*$', '') }
        return ("退出码 {0}" -f $proc.Code)
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
    $p = Invoke-PsChild '环境体检' @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $doctor)
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

# ---------- 离线素材（第 11 道闸门） ----------

# 位置：紧跟「4. 素材」。两者是同一个口径（public/ 下的交付素材），读日志时「素材不达标」
# 和「离线序列不达标」连在一起看最省事；check_assets.py 已经整体跳过 public/offline/**，
# 这两条正好互补，不会同一批 PNG 被两套规则各报一遍。
# 编号仍沿用方案文档里的「第 11 道」：既有十道的编号、顺序、判定一个字没动。
# 没有 public/offline/ 就 SKIP —— 没走外部渲染器的老项目不该因为这道闸门变红。
$offlineDir = Join-Path $publicDir 'offline'
if (-not (Test-Path -LiteralPath $offlineDir)) {
    Report '离线素材' 'SKIP' 0 '没有 public/offline/（没用外部渲染器）'
} else {
    $sw.Restart()
    $p = Invoke-Proc $py @((Join-Path $here 'check_offline.py'), $offlineDir)
    $sw.Stop()
    $v = Verdict $p
    Report '离线素材' $v.Status $sw.Elapsed.TotalMilliseconds (VerdictText $v $p) $v.Detail
}

# ---------- 5. 配乐 ----------

# 只查「配乐本身对不对」：时长、电平、拍点是否落在 timing.json 声明的网格上。
# 成片里到底有没有声音，是第 9 步 check_video.py 的事（它读 MP4 的 soun 轨）。
$bgmPath = $null
$bgmName = 'bgm.wav'
if (Test-Path -LiteralPath $timingPath) {
    try {
        $tj = Get-Content -LiteralPath $timingPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($tj.audio -and $tj.audio.bgm) { $bgmName = [string]$tj.audio.bgm }
    } catch { }
}
if (Test-Path -LiteralPath $publicDir) {
    $try = Join-Path $publicDir $bgmName
    if (Test-Path -LiteralPath $try) {
        $bgmPath = $try
    } else {
        $cand = Get-ChildItem -LiteralPath $publicDir -Filter 'bgm.*' -File -ErrorAction SilentlyContinue |
                Select-Object -First 1
        if ($cand) { $bgmPath = $cand.FullName }
    }
}

if (-not $bgmPath) {
    Report '配乐' 'SKIP' 0 '没有背景音乐（public/bgm.*）'
} elseif ($bgmPath -notmatch '\.wav$') {
    # check_audio.py 只读 WAV（mp3/m4a 要 ffmpeg 才能解），不装 ffmpeg 就只做存在性提示
    $sz = (Get-Item -LiteralPath $bgmPath).Length
    Report '配乐' 'SKIP' 0 ("非 WAV 配乐，跳过波形检查：" + [System.IO.Path]::GetFileName($bgmPath) + " $([math]::Round($sz/1KB))KB")
} else {
    $argList = @((Join-Path $here 'check_audio.py'), $bgmPath)
    if (Test-Path -LiteralPath $timingPath) { $argList += @('--timing', $timingPath) }
    $sw.Restart()
    $p2 = Invoke-Proc $py $argList
    $sw.Stop()
    $v = Verdict $p2
    Report '配乐' $v.Status $sw.Elapsed.TotalMilliseconds (VerdictText $v $p2) $v.Detail
}

# ---------- 6. 同步（音画字三对齐） ----------

# 画面看 scenes、字幕看 voiceLines、声音看 public/vo/*.wav——三者错位是别的闸门查不到的缝：
# 话没说完画面就切了、两句字幕同屏、CTA 落地是哑的、改了字幕没重新合成。
$sw.Restart()
$p = Invoke-Proc $py @((Join-Path $here 'check_sync.py'), '-Project', $root)
$sw.Stop()
$v = Verdict $p
Report '同步' $v.Status $sw.Elapsed.TotalMilliseconds (VerdictText $v $p) $v.Detail

# ---------- 7. 静帧 ----------

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

# ---------- 8. 排版探针（HTML 样帧） ----------

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
        $p = Invoke-PsChild '排版' $argList
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

# ---------- 9. 成片 ----------

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

# ---------- 10. 编码（只在 -Self 时查工具仓库自己） ----------

if ($Self) {
    $fix = Join-Path $here 'fix-encoding.ps1'
    if (Test-Path -LiteralPath $fix) {
        $sw.Restart()
        $p = Invoke-PsChild '编码' @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $fix, $toolRepo, '-Check')
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
