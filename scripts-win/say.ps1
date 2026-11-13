# 离线配音：用 Windows 自带的 SAPI 念一段中文，存成 WAV。
#
# 为什么不用在线 TTS：这条工具链的前提是「不联网也能出片」。SAPI 的音色不如
# ElevenLabs 自然，但胜在零成本、零延迟、不传数据——先出片，觉得声音不行再换。
#
# 用法：
#   scripts-win\say.cmd -List
#   scripts-win\say.cmd "把流程写成规范，不是提示词，是施工图" -Out public\voice.wav
#   scripts-win\say.cmd -File 旁白.txt -Out public\voice.wav -Rate -1
#
# 参数：
#   -Text      要念的文字（位置 0）
#   -File      从 UTF-8 文本文件读（整篇一口气念；分句请自己按行合成再拼）
#   -Out       输出 WAV（默认 out\voice.wav）
#   -Voice     音色名（默认自动挑第一个中文音色）
#   -Rate      -10~10，负数更慢。中文宣传片旁白一般 -2 ~ 0
#   -Volume    0~100，默认 100
#   -List      只列本机可用音色
#
# 念完记得跑一遍：
#   python scripts-win\check_audio.py public\voice.wav --voice public\bgm.wav

param(
    [Parameter(Position = 0)][string]$Text = '',
    [string]$File = '',
    [string]$Out = '',
    [string]$Voice = '',
    [int]$Rate = 0,
    [int]$Volume = 100,
    [switch]$List
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer

if ($List) {
    $zh = $false
    foreach ($v in $synth.GetInstalledVoices()) {
        $info = $v.VoiceInfo
        $isZh = $info.Culture.Name -like 'zh*'
        if ($isZh) { $zh = $true }
        $mark = if ($isZh) { '  ← 中文' } else { '' }
        Write-Host ("{0}  [{1}]  {2}{3}" -f $info.Name, $info.Culture.Name, $info.Gender, $mark)
    }
    if (-not $zh) {
        Write-Host ''
        Write-Host '本机没有中文音色。装一个：设置 → 时间和语言 → 语音 → 添加语音，选「中文（简体）」' -ForegroundColor Yellow
    }
    exit 0
}

if ($File) {
    if (-not (Test-Path -LiteralPath $File)) { Write-Error "找不到文本文件：$File"; exit 2 }
    $Text = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $File).Path, [System.Text.UTF8Encoding]::new($false))
}
if (-not $Text.Trim()) {
    Write-Host '没有要念的文字。用 -Text "..." 或 -File 旁白.txt' -ForegroundColor Yellow
    exit 2
}

# 音色：没指定就挑第一个中文音色；一个都没有就报错，别让它用英文音色念中文
if (-not $Voice) {
    $zhVoices = @($synth.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like 'zh*' })
    if ($zhVoices.Count -eq 0) {
        Write-Host '本机没有中文音色，念出来会是乱码一样的调子。先跑 -List 看看有什么。' -ForegroundColor Red
        Write-Host '装语音包：设置 → 时间和语言 → 语音 → 添加语音 → 中文（简体）' -ForegroundColor Yellow
        exit 2
    }
    $Voice = $zhVoices[0].VoiceInfo.Name
}

try {
    $synth.SelectVoice($Voice)
} catch {
    Write-Host "选不了音色「$Voice」：$($_.Exception.Message)" -ForegroundColor Red
    exit 2
}
$synth.Rate = [Math]::Max(-10, [Math]::Min(10, $Rate))
$synth.Volume = [Math]::Max(0, [Math]::Min(100, $Volume))

if (-not $Out) { $Out = 'out\voice.wav' }
$outPath = if ([System.IO.Path]::IsPathRooted($Out)) { $Out } else { Join-Path (Get-Location).Path $Out }
$outDir = Split-Path -Parent $outPath
if ($outDir -and -not (Test-Path -LiteralPath $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

$synth.SetOutputToWaveFile($outPath)
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$synth.Speak($Text)
$synth.SetOutputToNull()
$synth.Dispose()
$sw.Stop()

$item = Get-Item -LiteralPath $outPath
# 读 WAV 头算时长：按 chunk 走，别假设 data 一定从第 40 字节开始。
# 有些工具会先插 fact / LIST 块，硬编码偏移就会读出一段负数的「时长」。
$sec = 0.0
try {
    $bytes = [System.IO.File]::ReadAllBytes($outPath)
    $ch = 0; $sr = 0; $dataLen = 0
    $pos = 12
    while ($pos + 8 -le $bytes.Length) {
        $id = [System.Text.Encoding]::ASCII.GetString($bytes, $pos, 4)
        $sz = [BitConverter]::ToInt32($bytes, $pos + 4)
        if ($id -eq 'fmt ') {
            $ch = [BitConverter]::ToInt16($bytes, $pos + 10)
            $sr = [BitConverter]::ToInt32($bytes, $pos + 12)
        } elseif ($id -eq 'data') {
            if ($sz -gt 0 -and ($pos + 8 + $sz) -le $bytes.Length) { $dataLen = $sz }
            else { $dataLen = $bytes.Length - $pos - 8 }
            break
        }
        if ($sz -le 0) { break }
        $pos += 8 + $sz + ($sz % 2)
    }
    if ($ch -gt 0 -and $sr -gt 0) { $sec = $dataLen / (2.0 * $ch * $sr) }
} catch { }
Write-Host ("输出：{0}" -f $outPath)
Write-Host ("音色：{0}   语速 {1}" -f $Voice, $Rate)
Write-Host ("时长：{0:N2}s   大小 {1:N0} KB   合成耗时 {2:N1}s" -f $sec, ($item.Length / 1KB), $sw.Elapsed.TotalSeconds)
Write-Host ''
Write-Host '下一步：把这段旁白放进 timing.json 的 audio.voice，再跑'
Write-Host '  python scripts-win\check_audio.py public\voice.wav --voice public\bgm.wav'
