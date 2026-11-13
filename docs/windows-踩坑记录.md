# Windows 踩坑记录

本文件记录的是**实测踩过的坑**，每条都带现象、原因、改法。写新脚本前先扫一遍，能省半天。

环境：Windows 10（19041）、Windows PowerShell 5.1.19041、Node v24.21.0、Python 3.12.9、git 2.49.0。

## 1. `.ps1` 直接跑不动：因为在此系统上禁止运行脚本

现象：

```
& : 无法加载文件 ...\doctor.ps1，因为在此系统上禁止运行脚本。
    + FullyQualifiedErrorId : UnauthorizedAccess
```

原因：默认 `ExecutionPolicy` 是 `Restricted`，连本地脚本都不让执行。

改法：**不要**改系统设置（`Set-ExecutionPolicy` 需要管理员、还会影响别的项目）。建一个同名 `.cmd` 包装器：

```bat
@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0shot.ps1" %*
exit /b %ERRORLEVEL%
```

用法：`scripts-win\shot.cmd examples\card.html out\frame.png -Scale 1`——参数原样透传，跟直接跑 .ps1 一样。

## 2. 无 BOM 的 UTF-8 `.ps1` 会被当成 GBK 读，中文全乱并报语法错

现象（脚本里明明有中文注释）：

```
At ...\doctor.ps1:81 char:6
+ else { Add-Result 'git' 'WARN' '鏈畨瑁? 'winget install Git.Git' }
+      ~
Missing closing '}' in statement block or type definition.
The string is missing the terminator: '.
```

原因：Windows PowerShell 5.1 对**没有 BOM 的** `.ps1` 按系统 ANSI 代码页（中文系统 = cp936/GBK）解码。UTF-8 的中文字节被按 GBK 解释，末尾字节还可能吃掉右引号，于是"乱码 + 语法错"一起出现。

改法：`.ps1` 存成 **UTF-8 with BOM**（前三个字节 `239,187,191`）。`.py` / `.md` / `.html` / `.json` 继续用无 BOM，别的地方不需要 BOM，加了反而碍事。

```powershell
$t = [System.IO.File]::ReadAllText($p, [System.Text.UTF8Encoding]::new($false)).TrimStart([char]0xFEFF)
[System.IO.File]::WriteAllText($p, $t, (New-Object System.Text.UTF8Encoding($true)))
```

注意：很多编辑器/生成器（包括 agent 的 `write`/`edit`）默认写无 BOM。**每次改完 .ps1 都要重跑一遍上面的三行**，否则下次运行又炸。

## 3. 对「单个字符串」取 `[0]`，拿到的是第一个字符

```powershell
$chrome = @('C:\a\chrome.exe','D:\b\chrome.exe') | Where-Object { Test-Path $_ }
$chrome[0]   # 只匹配到一个候选时，这里是 'C'
```

原因：管道只返回一个对象时，PowerShell 不包成数组，`$chrome` 是字符串；字符串索引 `[0]` = 首字符。表现为体检表里 Chrome 路径显示成 `C`。

改法：用 `@( ... )` 强制包成数组：

```powershell
$chrome = @( @('C:\a\chrome.exe','D:\b\chrome.exe') | Where-Object { Test-Path $_ } )
```

## 4. `-f` 和算术运算符抢优先级，格式化直接报错

```powershell
"体检结果：{0} OK / {1} WARN / {2} FAIL" -f $results.Count - $fail - $warn, $warn, $fail
# Error formatting a string: Index (zero based) must be greater than or equal to zero
```

原因：`-f` 绑得比 `-` 紧，实际是「先格式化再相减」，参数列表被切碎。

改法：先算好变量再格式化。

```powershell
$ok = $results.Count - $fail - $warn
"体检结果：{0} OK / {1} WARN / {2} FAIL" -f $ok, $warn, $fail
```

## 5. 命令成功了，脚本却以 exit 1 结束

现象：截图文件明明生成了，`shot.ps1` 仍抛错：

```
chrome.exe : 2800542 bytes written to file ...\out\frame-4k.png
    + FullyQualifiedErrorId : NativeCommandError
```

原因：Chrome 把「写了多少字节」写到 **stderr**；脚本里有 `$ErrorActionPreference = 'Stop'` 时，原生程序往 stderr 写的任何东西都会被升级成终止性错误。

改法：调用原生程序前后临时降级，只以「产物是否存在」判断成败。

```powershell
$prev = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
& $Chrome @args 2>&1 | Out-Null
$ErrorActionPreference = $prev
if (-not (Test-Path -LiteralPath $out)) { throw "截图失败：$out 未生成" }
```

## 6. Python 打印中文变乱码

现象：`python check_timing.py x.json` 输出「14 ����������52.0s」。

原因：Python 在 Windows 控制台按 cp936 编码 stdout，终端按 UTF-8 解。

改法：脚本里 import 之后加一次（比让用户设 `PYTHONIOENCODING` 可靠）：

```python
if sys.platform == "win32":
    for _s in (sys.stdout, sys.stderr):
        try:
            _s.reconfigure(encoding="utf-8")
        except Exception:
            pass
```

## 7. 这台机器上 `powershell` 就是 5.1，别假设有 `pwsh`

`$PSVersionTable.PSVersion` 实测是 `5.1.19041.6456`。所以：

- 不要用 `&&`、`||` 串联命令（PS 7 才支持）；
- 不要用 `??`、三元 `? :`；
- `Get-ChildItem -File`、`-Depth` 在 5.1 上有，但 `ForEach-Object -Parallel` 没有；
- 需要 7 的特性时先检测版本，或改写。

## 8. 路径与文件名

- 一律 `Join-Path`，不要手拼 `$dir + '\' + $name`。
- 含中文或空格的路径必须加引号：`& python "scripts-win\check_timing.py" "D:\我的 项目\timing.json"`。
- 写文件用 `[System.IO.File]::WriteAllText`，别用 `Out-File`（默认会带 BOM 或改编码，PS 5.1 的 `-Encoding utf8` 也是带 BOM 的）。

## 9. 一次体检就能发现大部分环境问题

`scripts-win\doctor.cmd` 会把 Node / npm / Python / Pillow / Chrome / git / 中文字体 / ffmpeg / 磁盘剩余一次列清并给出修复建议。**先跑它，再排错**，能省掉一半「为什么命令找不到」的来回。
