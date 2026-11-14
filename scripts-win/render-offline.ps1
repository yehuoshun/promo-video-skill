# 离线渲染通道：把外部渲染器（Manim / Blender / 任何能吐 PNG 序列的工具）的产物
# 归一成 <项目>/public/offline/<Name>/frame_0000.png… + meta.json，供 Remotion 用
# staticFile 内嵌（方案 docs/效果扩容方案.md 4.3 与第 7 节第 4 条）。
#
# 为什么要有它：外渲器的文件名、帧号、输出目录各不相同（manim 自己写 Scene00123.png
# 到 media/ 下，帧号还不稳定），Remotion 那边必须只认一个口径 —— frame_%04d.png。
# 统一改名、写 meta、校验数量与尺寸都收在这一条命令里，否则每个镜头都要手搓一遍，
# 手搓就会漏（少一帧、尺寸不一致，渲染出来是空白或跳帧）。
#
# 用法（在项目目录下）：
#   ..\scripts-win\render-offline.cmd . demo -Frames 60 -Width 1820 -Height 1000 `
#       -Renderer "C:\tools\manim.exe" `
#       -Args "--format=png-sequence,-t,-qh,scene.py,Scene" `
#       -Source "scene.py 里的推导镜头" -License "自研（本片原创脚本）"
#
#   -Frames          必填：这段会渲出的总帧数（时长秒数 × fps）。渲完按它校验渲染器实际
#                    产出 —— 少一半帧也能写出一份「自洽」的 meta，只有帧数对得上才靠得住。
#                    少了判 ERROR（画面会短一截），多了同样判 ERROR（先弄清到底该渲多少帧，
#                    别让「渲多少算多少」决定时间轴）。
#   -Width/-Height   都不给就按首帧实际尺寸写 meta
#   -DisplayWidth / -DisplayHeight  必填：这块素材在 1x 布局里的显示尺寸（px），由场景作者
#                    显式给出（Remotion 侧 <Img width={display_width}> 按它排）。写进
#                    meta.display_width / display_height，第 11 道闸门用它查
#                    「出图宽、高都要 ≥ 显示尺寸 × 2」——4K 是 1x 布局 zoom 2 倍，
#                    宽或高哪个方向不够都会糊。不许猜：闸门缺了这两个字段会直接 ERROR。
#   -Keep            不清理目标目录里的上一版帧（增量补帧用；帧数变了会留旧帧）
#
# 渲染器契约（两条，选一条）：
#   1) 把帧写进当前工作目录（render-offline 已经把 cwd 切到中间目录）；
#   2) 写进 $env:OFFLINE_OUT_DIR 指向的目录。
#   另外会透传 OFFLINE_FRAMES / OFFLINE_WIDTH / OFFLINE_HEIGHT / OFFLINE_FPS 四个环境变量，
#   渲染器想自己算时长可以用。
# 出完帧后：按文件名里的数字自然排序 → 改名 frame_0000.png 起 → 校验尺寸与帧数 → 写 meta.json。
#
# 产物落 public/offline/<Name>/：帧是几十上百 MB 的二进制，`.gitignore` 按后缀忽略
# `public/offline/**/*.png`（靠这条命令重建）；meta.json 要走仓库 —— 新 clone 下来也得能查
# 「这段素材哪来的、能不能商用」。

param(
    [Parameter(Position = 0)][string]$Project = ".",
    [Parameter(Position = 1)][string]$Name = "",
    [int]$Frames = 0,
    [int]$Width = 0,
    [int]$Height = 0,
    [string]$Renderer = "",
    [string[]]$Args = @(),
    [string]$Source = "",
    [string]$License = "",
    [int]$Fps = 0,
    [int]$DisplayWidth = 0,
    [int]$DisplayHeight = 0,
    [string]$Command = "",
    [switch]$Keep,
    [switch]$Quiet
)

$ErrorActionPreference = "Stop"

function Fail([string]$message) {
    Write-Host ""
    Write-Host $message -ForegroundColor Red
    exit 1
}

function Say([string]$message, [string]$color = "Gray") {
    if (-not $Quiet) { Write-Host $message -ForegroundColor $color }
}

# ---- 参数 ----

if (-not (Test-Path -LiteralPath $Project)) { Fail "找不到目录：$Project" }
$proj = (Resolve-Path -LiteralPath $Project).Path

if (-not $Name) {
    Fail "缺 -Name：这条离线片段叫什么？`n它会变成 public/offline/<Name>/，Remotion 侧写 staticFile(`"offline/<Name>/frame_0000.png`")。"
}
# 名字要进 URL 和 <Img src>，中文/空格在 Windows + staticFile 下容易翻车，直接禁掉
if ($Name -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*$') {
    Fail "片段名只允许字母/数字/点/下划线/短横线，且不能以符号开头：$Name"
}
if ($Frames -le 0) {
    Fail ("缺 -Frames：写这段会渲出的总帧数（时长秒数 × fps），渲完要按它校验渲染器实际产出。`n例如 2 秒 30fps：`n  ..\scripts-win\render-offline.cmd . demo -Frames 60 -Width 1820 -Height 1000 -DisplayWidth 910 -DisplayHeight 500 -Renderer `"C:\tools\manim.exe`" -Args `"--format=png-sequence,-t,-qh,scene.py,Scene`" -Source `"…`" -License `"…`"`n（以前不给 -Frames 就不过问帧数：渲染器少渲一半，meta 里照样写「自洽」的 frames，第 11 道闸门看不出来。）")
}
if (($Width -le 0) -ne ($Height -le 0)) {
    Fail "-Width 和 -Height 要一起给（现在是 Width=$Width Height=$Height）；都不给就按首帧实际尺寸写 meta。"
}
if ($DisplayWidth -lt 0) { Fail "-DisplayWidth 不能是负数：$DisplayWidth" }
if (-not $Source) { Fail "缺 -Source：这批素材从哪来（生成脚本 / 场景名 / 素材站链接）？`nmeta.json 要记录来源，第 11 道闸门会查空值。" }
if (-not $License) { Fail "缺 -License：授权是什么（如 自研 / CC-BY-4.0 / 客户授权）？`n第三方模型和模板常禁止商用，第 11 道闸门会查空值。" }

# 显示尺寸必须显式给：meta.display_width/display_height 是「出图宽 ≥ 显示宽×2」的唯一依据，
# 缺了闸门直接 ERROR。这里不许拿 -Width 回填（那就成了自己跟自己比），也不许猜。
if ($DisplayWidth -le 0 -or $DisplayHeight -le 0) {
    Fail ("缺 -DisplayWidth / -DisplayHeight：这块素材在 1x 布局里显示多大（px）？`n" +
        "  例：-DisplayWidth 900 -DisplayHeight 500（Remotion 里 <Img width={900} height={500}> 那两个数）`n" +
        "它要写进 meta.display_width/display_height，第 11 道闸门靠它查「出图宽 ≥ 显示宽×2」；`n" +
        "不许回填成 -Width/-Height —— 那样这条检查就变成自己跟自己比，4K 糊了也查不出来。")
}

if (-not $Renderer) {
    Fail "缺 -Renderer：要跑哪个外部渲染器？`n例：-Renderer `"C:\tools\manim.exe`" -Args `"--format=png-sequence,-t,scene.py,Scene`""
}
$rendererPath = $null
if (Test-Path -LiteralPath $Renderer -PathType Leaf) {
    $rendererPath = (Resolve-Path -LiteralPath $Renderer).Path
} else {
    # 允许直接写命令名（manim / blender）；PATH 里也没有就把收到的原文原样报出来
    $found = Get-Command $Renderer -ErrorAction SilentlyContinue
    if ($found) {
        $rendererPath = $found.Source
    } else {
        Fail ("渲染器不存在：{0}`n（既不是现有文件，PATH 里也没有这个命令。用 Get-Command <名字> 查到绝对路径再传进来）" -f $Renderer)
    }
}

# 透传参数：每个元素是一个 argv；写成 "-a,-b" 这种按逗号拆（cmd 包装器下只能这么给）
$argList = @()
foreach ($a in $Args) {
    if ($null -eq $a) { continue }
    foreach ($piece in ($a -split ',')) {
        $t = $piece.Trim()
        if ($t) { $argList += $t }
    }
}

# fps：默认跟项目 timing.json 走（离线素材要跟片子同帧率，不然嵌进去会抖）
$timingPath = Join-Path $proj "timing.json"
$projFps = 30
if (Test-Path -LiteralPath $timingPath) {
    try {
        $timing = Get-Content -LiteralPath $timingPath -Raw -Encoding UTF8 | ConvertFrom-Json
    } catch {
        Fail "timing.json 不是合法 JSON：$timingPath`n$($_.Exception.Message)"
    }
    if ($timing.fps -and [int]$timing.fps -gt 0) { $projFps = [int]$timing.fps }
}
$fps = $projFps
if ($Fps -gt 0) { $fps = $Fps }

if (-not $Command) {
    $shown = @()
    foreach ($a in $argList) {
        if ($a -match '\s') { $shown += ('"' + $a + '"') } else { $shown += $a }
    }
    $Command = (('"' + $rendererPath + '"') + ' ' + ($shown -join ' ')).Trim()
}

# ---- 中间目录（每次全新，避免上一轮的残留帧混进来） ----

$offlineRoot = Join-Path $proj "public\offline"
$finalDir = Join-Path $offlineRoot $Name
# 带毫秒：失败后立刻重跑是常事，只精确到秒会复用同一个目录，上一轮的残留帧就混进来了
$staging = Join-Path $proj ("out\offline-staging\" + $Name + "-" + (Get-Date).ToString("yyyyMMdd-HHmmss-fff"))
New-Item -ItemType Directory -Path $staging -Force | Out-Null

if (-not $Quiet) {
    Write-Host ("离线渲染：{0}" -f $Name) -ForegroundColor Cyan
    Write-Host ("  渲染器 {0}" -f $rendererPath) -ForegroundColor DarkGray
    Write-Host ("  参数   {0}" -f ($argList -join ' ')) -ForegroundColor DarkGray
    Write-Host ("  中间目录 {0}" -f $staging) -ForegroundColor DarkGray
}

# ---- 跑渲染器 ----

$env:OFFLINE_OUT_DIR = $staging
$env:OFFLINE_FRAMES = "$Frames"
$env:OFFLINE_WIDTH = "$Width"
$env:OFFLINE_HEIGHT = "$Height"
$env:OFFLINE_FPS = "$fps"
# 渲染器多半是 Python（manim 就是），默认按本地 GBK 往管道写，中文日志到这层全是问号；
# 强制子进程输出 UTF-8、本进程也按 UTF-8 解码，退出码非 0 时的「原话」才真的看得懂。
$env:PYTHONIOENCODING = "utf-8"
$oldOutEnc = [Console]::OutputEncoding
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch { }

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$outLines = New-Object System.Collections.ArrayList
Push-Location $staging
# 5.1 的坑（qa 实测出来的）：本脚本开头 $ErrorActionPreference = "Stop"，而 Windows PowerShell
# 5.1 会把原生命令往 stderr 写的**每一行**变成终止性 NativeCommandError —— 脚本在走到下面
# if ($code -ne 0) 之前就死了，一帧不出、还看不出是渲染器的问题。manim / ffmpeg / blender
# 全都往 stderr 写进度与警告，所以这里必须临时降成 Continue：stderr 照样进 $outLines（原话
# 不丢），成不成功只认退出码。pwsh 7 默认没有这个行为，所以只在 5.1 下才会炸。
$__eap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
    & $rendererPath @argList 2>&1 | ForEach-Object {
        [void]$outLines.Add("$_")
        if (-not $Quiet) { Write-Host ("    " + $_) -ForegroundColor DarkGray }
    }
    $code = $LASTEXITCODE
} finally {
    $ErrorActionPreference = $__eap
    Pop-Location
    try { [Console]::OutputEncoding = $oldOutEnc } catch { }
}
$sw.Stop()

if ($code -ne 0) {
    # 铁律：渲染器的原话要打出来，别吞成「渲染失败」
    Write-Host ""
    Write-Host ("渲染器退出码 {0}（非 0），已停在 {1}" -f $code, $staging) -ForegroundColor Red
    Write-Host "渲染器原话（最后 20 行）：" -ForegroundColor Red
    foreach ($l in @($outLines | Select-Object -Last 20)) { Write-Host ("  " + $l) -ForegroundColor Red }
    exit 1
}

# ---- 收集产出的 PNG ----

$pngs = @(Get-ChildItem -LiteralPath $staging -Recurse -File -Filter '*.png' -ErrorAction SilentlyContinue)
if (-not $pngs.Count) {
    Fail ("渲染器退出码 0，但 {0} 下一个 PNG 都没找到。`n渲染器要把帧写进当前工作目录（render-offline 已经把 cwd 切过去），或者写进 $env:OFFLINE_OUT_DIR。`n（Manim 记得用 --format=png-sequence：写 --format=png 只会得到最后一帧。）" -f $staging)
}

# 帧号取文件名里最后一串数字（manim 是 Scene0000.png，blender 是 0001.png，都吃）
function Get-FrameNo([string]$file) {
    $m = [regex]::Match([System.IO.Path]::GetFileNameWithoutExtension($file), '(\d+)(?!.*\d)')
    if ($m.Success) { return [int]$m.Groups[1].Value }
    return [int]::MaxValue
}

$sorted = @($pngs | Sort-Object @{ Expression = { Get-FrameNo $_.FullName } }, @{ Expression = { $_.FullName } })
$numbered = @($sorted | Where-Object { (Get-FrameNo $_.FullName) -ne [int]::MaxValue })
if ($numbered.Count -lt $sorted.Count) {
    Say ("注意：{0} 个文件名里没有数字，只能按文件名排序" -f ($sorted.Count - $numbered.Count)) "Yellow"
}

# 上游帧号不连续：渲染器自己丢帧（manim 偶尔因为某个 object 前几帧没出现就从 0006 起编号）时，
# 下面「按顺序重排成 frame_0000 起」会把这段证据抹平 —— 总帧数照样对得上，内容却整体前移。
# 判定仍交给 -Frames 与人工，这里只把证据喊出来。
$upNums = @($numbered | ForEach-Object { Get-FrameNo $_.FullName } | Sort-Object)
for ($k = 0; $k -lt $upNums.Count; $k++) {
    if ($upNums[$k] -ne $k) {
        Write-Host ("警告：上游帧号不是从 0 连续（第 {0} 帧的编号是 {1}）—— 已按顺序重排成 frame_0000 起；`n  若渲染器丢了开头几帧，画面内容会整体前移、跟时间轴对不上（-Frames 只能保证总帧数）。" -f $k, $upNums[$k]) -ForegroundColor Yellow
        break
    }
}

$dups = @($numbered | Group-Object @{ Expression = { Get-FrameNo $_.FullName } } | Where-Object { $_.Count -gt 1 })
if ($dups.Count) {
    $pairs = @()
    foreach ($g in $dups) {
        $paths = @($g.Group | ForEach-Object { $_.FullName })
        $pairs += ($paths -join '  /  ')
    }
    Fail ("渲染器产出的帧号有重复，没法确定顺序：`n  " + ($pairs -join "`n  "))
}

$count = $sorted.Count
if ($count -ne $Frames) {
    Fail ("渲染器产出 {0} 帧，与 -Frames {1} 不一致（已停在 {2}，可以进去看实际产出）。`nManim 的常见坑：--format 写成 png 只出最后一帧，要 png-sequence；场景时长 × fps 也要对得上。" -f $count, $Frames, $staging)
}
if ($count -gt 9999) {
    Fail ("帧数 {0} 超过 9999，frame_%04d 命名放不下。`n（这个长度不该走离线通道：方案 4.3 里离线只做局部的短镜头。）" -f $count)
}

# ---- 读尺寸（只读 PNG 的 IHDR，不解码；几百帧也是瞬间） ----

function Get-PngSize([string]$path) {
    $fs = [System.IO.File]::Open($path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
    try {
        $buf = New-Object byte[] 26
        $got = 0
        while ($got -lt 26) {
            $n = $fs.Read($buf, $got, 26 - $got)
            if ($n -le 0) { break }
            $got += $n
        }
    } finally {
        $fs.Close()
    }
    if ($got -lt 26) { throw ("文件太短，只有 {0} 字节" -f $got) }
    if ($buf[0] -ne 0x89 -or $buf[1] -ne 0x50 -or $buf[2] -ne 0x4E -or $buf[3] -ne 0x47) { throw "不是 PNG（文件头不对）" }
    $w = [long]$buf[16] * 16777216 + [long]$buf[17] * 65536 + [long]$buf[18] * 256 + [long]$buf[19]
    $h = [long]$buf[20] * 16777216 + [long]$buf[21] * 65536 + [long]$buf[22] * 256 + [long]$buf[23]
    return @([int]$w, [int]$h, [int]$buf[25])
}

$firstSize = $null
$off = @()
foreach ($f in $sorted) {
    try {
        $s = Get-PngSize $f.FullName
    } catch {
        Fail ("帧读不出尺寸：{0}`n{1}" -f $f.FullName, $_.Exception.Message)
    }
    if ($null -eq $firstSize) { $firstSize = $s }
    if ($Width -gt 0) {
        if ($s[0] -ne $Width -or $s[1] -ne $Height) { $off += ("{0} 是 {1}×{2}" -f $f.Name, $s[0], $s[1]) }
    } elseif ($s[0] -ne $firstSize[0] -or $s[1] -ne $firstSize[1]) {
        $off += ("{0} 是 {1}×{2}" -f $f.Name, $s[0], $s[1])
    }
}

$tw = $Width; $th = $Height
if ($tw -le 0) { $tw = $firstSize[0]; $th = $firstSize[1] }
# 提前把「糊」这件事喊出来：闸门（第 11 道）会判 ERROR，但等到那一步才说，
# 中间已经白渲了整段。宽、高两个方向都要过 2 倍 —— 只盯宽度的话，900×500 的显示配
# 1800×100 的出图能混过去（宽刚好 2 倍，高只剩五分之一）。
# 判定口径仍只在 check_offline.py 一处，这里只是同一公式的提前播报。
$needW = [int][math]::Ceiling($DisplayWidth * 2)
$needH = [int][math]::Ceiling($DisplayHeight * 2)
$tooSmall = @()
if ($tw -lt $needW) { $tooSmall += ("宽 {0} < {1}" -f $tw, $needW) }
if ($th -lt $needH) { $tooSmall += ("高 {0} < {1}" -f $th, $needH) }
if ($tooSmall.Count) {
    # -Quiet 只压进度噪音，这种「渲完也过不了闸门」的警告照样要打出来
    Write-Host ("警告：出图尺寸不够显示尺寸的 2 倍（{0}），4K 下放大就糊（第 11 道闸门会判 ERROR）。`n  重渲：-Width {1} -Height {2} -DisplayWidth {3} -DisplayHeight {4}；确实只要 1080p 就别放进 4K 片。" -f ($tooSmall -join '、'), $needW, $needH, $DisplayWidth, $DisplayHeight) -ForegroundColor Yellow
}
if ($off.Count) {
    $shown = @($off | Select-Object -First 3)
    $tail = ""
    if ($off.Count -gt 3) { $tail = (" 等 {0} 帧" -f $off.Count) }
    Fail ("{0} 帧尺寸不对（应为 {1}×{2}）：{3}{4}`n同一个镜头里尺寸必须一致 —— Remotion 按 meta 尺寸定位，错一帧就跳。" -f $off.Count, $tw, $th, ($shown -join '、'), $tail)
}

# ---- 落到 public/offline/<Name>/ ----

if (Test-Path -LiteralPath $finalDir) {
    if ($Keep) {
        Say ("目标目录已存在，-Keep 保留旧帧：$finalDir（帧数变了会留旧帧，第 11 道闸门会报多帧）") "DarkGray"
    } else {
        $ours = $false
        $oldMeta = Join-Path $finalDir "meta.json"
        if (Test-Path -LiteralPath $oldMeta) {
            try {
                $old = Get-Content -LiteralPath $oldMeta -Raw -Encoding UTF8 | ConvertFrom-Json
                if ($old.generatedBy -and ([string]$old.generatedBy) -match 'render-offline') { $ours = $true }
            } catch {
                $ours = $false
            }
        }
        if (-not $ours) {
            Fail ("目标目录已存在，而且不是 render-offline 生成的（没有 meta.json，或 generatedBy 对不上）：`n  {0}`n换个 -Name，或者自己确认后把它删掉再跑 —— 这个脚本不替你删不认识的东西。" -f $finalDir)
        }
        # 只清自己产的那两种文件，目录里别的东西不碰
        $oldFiles = @(Get-ChildItem -LiteralPath $finalDir -File | Where-Object { $_.Name -match '^frame_\d{4}\.png$' -or $_.Name -eq 'meta.json' })
        foreach ($f in $oldFiles) { Remove-Item -LiteralPath $f.FullName -Force }
        Say ("清掉上一版 {0} 个文件：{1}" -f $oldFiles.Count, $finalDir) "DarkGray"
    }
} else {
    New-Item -ItemType Directory -Path $finalDir -Force | Out-Null
}

$i = 0
foreach ($f in $sorted) {
    $dst = Join-Path $finalDir ("frame_{0:0000}.png" -f $i)
    Move-Item -LiteralPath $f.FullName -Destination $dst -Force
    $i++
}

# ---- 写 meta.json（UTF-8 无 BOM；字段给第 11 道闸门查） ----

function Json-Escape([string]$s) {
    $sb = New-Object System.Text.StringBuilder
    foreach ($ch in $s.ToCharArray()) {
        $c = [string]$ch
        if ($c -eq '"') { [void]$sb.Append('\"') }
        elseif ($c -eq '\') { [void]$sb.Append('\\') }
        elseif ($c -eq "`r") { [void]$sb.Append('\r') }
        elseif ($c -eq "`n") { [void]$sb.Append('\n') }
        elseif ($c -eq "`t") { [void]$sb.Append('\t') }
        elseif ([int]$ch -lt 32) { [void]$sb.Append(('\u{0:x4}' -f [int]$ch)) }
        else { [void]$sb.Append($ch) }
    }
    return $sb.ToString()
}

$alpha = ($firstSize[2] -eq 6 -or $firstSize[2] -eq 4)
$meta = New-Object System.Collections.Specialized.OrderedDictionary
$meta["name"] = $Name
$meta["frames"] = $count
$meta["fps"] = $fps
$meta["width"] = $tw
$meta["height"] = $th
# 显示尺寸：必填，原样写进去，不做任何回填/推断（闸门靠它算「出图宽够不够 2 倍」）
$meta["display_width"] = $DisplayWidth
$meta["display_height"] = $DisplayHeight
$meta["alpha"] = $alpha
$meta["renderer"] = $rendererPath
$meta["command"] = $Command
$meta["license"] = $License
$meta["source"] = $Source
$meta["createdAt"] = (Get-Date).ToString("yyyy-MM-ddTHH:mm:sszzz")
$meta["generatedBy"] = "scripts-win/render-offline.ps1"

$lines = @()
foreach ($k in $meta.Keys) {
    $v = $meta[$k]
    if ($v -is [bool]) {
        if ($v) { $val = "true" } else { $val = "false" }
    } elseif ($v -is [double] -or $v -is [single]) {
        $val = $v.ToString([System.Globalization.CultureInfo]::InvariantCulture)
    } elseif ($v -is [int] -or $v -is [int64]) {
        $val = [string]$v
    } else {
        $val = '"' + (Json-Escape ([string]$v)) + '"'
    }
    $lines += ('  "' + $k + '": ' + $val)
}
$json = "{`n" + ($lines -join ",`n") + "`n}`n"
$metaPath = Join-Path $finalDir "meta.json"
[System.IO.File]::WriteAllText($metaPath, $json, (New-Object System.Text.UTF8Encoding($false)))

$totalBytes = (Get-ChildItem -LiteralPath $finalDir -File | Measure-Object -Property Length -Sum).Sum

# ---- 结论 ----

Write-Host ""
Write-Host ("离线片段就绪：{0}" -f $finalDir) -ForegroundColor Green
Write-Host ("  {0} 帧 {1}×{2} @ {3}fps，{4:N2}s，{5:N1}MB，用时 {6:N1}s" -f $count, $tw, $th, $fps, ($count / $fps), ($totalBytes / 1MB), $sw.Elapsed.TotalSeconds) -ForegroundColor DarkGray
Write-Host ("  meta.json：{0}" -f $metaPath) -ForegroundColor DarkGray
Write-Host ("  布局显示 {0}×{1}，出图是它的 宽 {2:0.0} 倍 / 高 {3:0.0} 倍" -f $DisplayWidth, $DisplayHeight, ($tw / $DisplayWidth), ($th / $DisplayHeight)) -ForegroundColor DarkGray
Write-Host ("  中间目录留在 {0}（out/ 不进 git，可随手删）" -f $staging) -ForegroundColor DarkGray
Write-Host "下一步：" -ForegroundColor Cyan
Write-Host ("  python scripts-win\check_offline.py `"{0}`"" -f $offlineRoot)
# 这段带字面花括号，不能用 -f 拼（-f 会把 {staticFile 当占位符解析，直接报 FormatException）
$sample = '<Img src={staticFile("offline/' + $Name + '/frame_0000.png")} width={' + $DisplayWidth + '} height={' + $DisplayHeight + '} />'
Write-Host ("  Remotion 里：" + $sample)
exit 0
