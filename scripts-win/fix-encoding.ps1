# 编码规整：把仓库里的文本文件统一成「该有的换行和 BOM」。
#
# 为什么需要它：Windows PowerShell 5.1 读 .ps1 时，没有 BOM 就按 GBK 解析，
# 中文全变乱码并报语法错（`The string is missing the terminator`）。而大多数
# 编辑器/AI 写文件时不加 BOM，于是一改 .ps1 就坏。改完跑一次这个脚本即可。
#
# 用法：
#   scripts-win\fix-encoding.cmd                 # 修复当前目录
#   scripts-win\fix-encoding.cmd ..\template     # 修复指定目录
#   scripts-win\fix-encoding.cmd -Check          # 只检查，有问题 exit 1（可以进 CI）

# 注意：不要用会丢 BOM 的工具改这个文件——它自己坏的时候救不了自己（实测踩过）。
# 真改坏了（首字节不是 239,187,191）就字节级补回来：
#   $p = "scripts-win\fix-encoding.ps1"
#   $t = [IO.File]::ReadAllText($p, [Text.UTF8Encoding]::new($false))
#   [IO.File]::WriteAllText($p, $t, (New-Object Text.UTF8Encoding($true)))
param(
    [Parameter(Position = 0)]
    [string]$Path = ".",
    [switch]$Check
)

$ErrorActionPreference = 'Stop'

# 后缀 → (要不要 BOM, 换行)
$Rules = @{
    '.ps1'  = @{ Bom = $true;  Eol = "`r`n" }
    '.psm1' = @{ Bom = $true;  Eol = "`r`n" }
    '.cmd'  = @{ Bom = $false; Eol = "`r`n" }   # cmd.exe 遇到 BOM 可能把首行命令吃掉
    '.bat'  = @{ Bom = $false; Eol = "`r`n" }
    '.py'   = @{ Bom = $false; Eol = "`n" }
    '.js'   = @{ Bom = $false; Eol = "`n" }
    '.mjs'  = @{ Bom = $false; Eol = "`n" }
    '.ts'   = @{ Bom = $false; Eol = "`n" }
    '.tsx'  = @{ Bom = $false; Eol = "`n" }
    '.json' = @{ Bom = $false; Eol = "`n" }
    '.md'   = @{ Bom = $false; Eol = "`n" }
    '.html' = @{ Bom = $false; Eol = "`n" }
    '.css'  = @{ Bom = $false; Eol = "`n" }
    '.yml'  = @{ Bom = $false; Eol = "`n" }
}

$SkipDirs = @('node_modules', 'out', '.git', 'dist', '__pycache__', '.remotion')
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$Utf8Bom = New-Object System.Text.UTF8Encoding($true)

$root = Resolve-Path -LiteralPath $Path
$fixed = @()
$bad = @()

$files = Get-ChildItem -LiteralPath $root -Recurse -File | Where-Object {
    $rule = $Rules[$_.Extension.ToLower()]
    if (-not $rule) { return $false }
    foreach ($d in $SkipDirs) {
        if ($_.FullName -match "[\\/]$([regex]::Escape($d))[\\/]") { return $false }
    }
    return $true
}

foreach ($f in $files) {
    $rule = $Rules[$f.Extension.ToLower()]
    $bytes = [System.IO.File]::ReadAllBytes($f.FullName)
    $hasBom = $bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF
    $text = $Utf8NoBom.GetString($bytes).TrimStart([char]0xFEFF)
    $crlf = ([regex]::Matches($text, "`r`n")).Count
    $bareLf = ([regex]::Matches($text, "(?<!`r)`n")).Count
    $bareCr = ([regex]::Matches($text, "`r(?!`n)")).Count

    $eolBad = if ($rule.Eol -eq "`r`n") { $bareLf -gt 0 } else { $crlf -gt 0 -or $bareCr -gt 0 }
    $bomBad = $hasBom -ne $rule.Bom

    if (-not ($eolBad -or $bomBad)) { continue }

    $rel = $f.FullName.Substring($root.Path.Length).TrimStart('\', '/')
    $why = @()
    if ($bomBad) { $why += if ($rule.Bom) { '缺 BOM' } else { '多了 BOM' } }
    if ($eolBad) { $why += "换行不是 $($rule.Eol.Replace("`r", '\r').Replace("`n", '\n'))" }

    if ($Check) {
        $bad += "$rel（$($why -join '、')）"
        continue
    }

    $norm = $text -replace "`r`n", "`n" -replace "`r", "`n"
    if ($rule.Eol -eq "`r`n") { $norm = $norm -replace "`n", "`r`n" }
    $enc = if ($rule.Bom) { $Utf8Bom } else { $Utf8NoBom }
    [System.IO.File]::WriteAllText($f.FullName, $norm, $enc)
    $fixed += "$rel（$($why -join '、')）"
}

if ($Check) {
    if ($bad.Count -eq 0) {
        Write-Host "编码检查：$($files.Count) 个文本文件全部合规" -ForegroundColor Green
        exit 0
    }
    Write-Host "编码不合规 $($bad.Count) 个：" -ForegroundColor Yellow
    foreach ($b in $bad) { Write-Host "  - $b" }
    Write-Host "`n跑 scripts-win\fix-encoding.cmd 修"
    exit 1
}

if ($fixed.Count -eq 0) {
    Write-Host "编码检查：$($files.Count) 个文本文件全部合规，没改任何东西" -ForegroundColor Green
    exit 0
}
Write-Host "已修复 $($fixed.Count) / 检查 $($files.Count) 个文件：" -ForegroundColor Green
foreach ($x in $fixed) { Write-Host "  - $x" }
