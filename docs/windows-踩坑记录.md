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

## 10. 执行策略不只管 `.ps1`，连 `npm` 一起拦

第 1 条说过 `.ps1` 会被 `Restricted` 挡住，加 `.cmd` 包装解决。**同样的错误也会出现在 `npm` 上**：

```
npm : 无法加载文件 C:\Program Files\nodejs\npm.ps1，因为在此系统上禁止运行脚本。
```

PowerShell 找 `npm` 时优先匹配 `npm.ps1`，于是又被拦。两条路：

- 命令里直接写 `npm.cmd run render`；
- 或用 node 自带的完整路径，例如 `E:\DevelopmentEnvironment\nvm\nodejs\npm.cmd run render`（本机上 nvm 装的 node 在这里）。

## 11. Remotion 第一次跑会自己下载浏览器和编码器

- 第一次 `remotion still` / `render` 会下载 Headless Shell（本机实测 **131.1MB**），之后再跑才快；
- 它**自带 ffmpeg 编码**，本机没装 ffmpeg 也能出 mp4——`doctor.cmd` 报 ffmpeg WARN 不影响出片，只影响混音、抽帧、换音轨；
- `npm install` 时 esbuild 的 postinstall 可能被 `allowScripts` 拦下并告警，实测不影响渲染，不必处理。

## 12. 4K 用 `zoom`，不要用 `transform: scale()`

`transform: scale(2)` 是把 1080p 的画面整体放大，文字边缘会糊、细线会虚；CSS `zoom` 会重新布局并按新分辨率重新栅格化，小字是真的清晰（代价：1px 边框变成 2px，需要的话用 `0.5px` 或改细）。

本项目的做法是在 `template/src/Root.tsx` 里 `const zoom = width / WIDTH`，把整个舞台包一层 `zoom`，场景组件只写 1920×1080 一套坐标。校验方式是裁 4K 静帧里最小的那行字看边缘，而不是看整体缩放比。

## 13. `.cmd` 换行必须是 CRLF，否则 cmd.exe 会错行执行

这条最阴。`.cmd` / `.bat` 用 LF（Unix 换行）写出来，`cmd.exe` 照样能跑、退出码还是 0，但会莫名其妙多出几行 stderr：

```
The system cannot find the drive specified.
The system cannot find the path specified.
```

实测过程：直接 `Start-Process powershell -File new-project.ps1` 没有这些行；套一层 `.cmd` 就有了；把 `.cmd` 单行拆开逐条试，`robocopy` 和 `powershell` 都是干净的。最后查换行——三个 `.cmd` 全是裸 LF（`CRLF=0 裸LF=5`）。原因是 cmd.exe 按字节读批处理，LF 结尾时会把 `.cmd` 里的注释和下一行拼在一起解析，拼出来的碎片被当成命令执行（那些碎片里有 `E:\...` 的路径片段，于是报"找不到指定的驱动器"）。

修法（PowerShell）：

```powershell
$t = [System.IO.File]::ReadAllText($f) -replace "`r`n", "`n" -replace "`n", "`r`n"
[System.IO.File]::WriteAllText($f, $t, (New-Object System.Text.UTF8Encoding($false)))
```

仓库里 `.gitattributes` 已经把 `*.cmd`、`*.ps1` 设为 `eol=crlf`，但**那只管 git 检出**；新写的 `.cmd` 落盘时就得是 CRLF，否则本地先踩一遍。

## 14. 变量名不区分大小写，局部变量会覆盖同名参数

`probe.ps1` 里写了 `param([switch]$Json, ...)`，脚本中间又写 `$json = ...GetString(...)`。PowerShell 的变量名**不区分大小写**，`$json` 和 `$Json` 是同一个变量，而 `[switch]` 参数是「受类型约束的变量」，往里塞字符串直接抛：

```
Cannot convert the "{"vw":1904,...}" value of type "System.String" to type
"System.Management.Automation.SwitchParameter".
    + CategoryInfo   : MetadataError: (:) [probe.ps1], ArgumentTransformationMetadataException
```

坑在于**报错位置很误导**：`-File` 方式运行只给脚本名和行号，看着像是「参数绑定失败」，于是先怀疑 `.cmd` 的 `%*` 展开、执行策略、当前目录——都不是。真正定位靠这一招：把调用包进 try/catch 打印 `$_.ScriptStackTrace`，一次拿到行号。

```powershell
$inner = "try { & '.\scripts-win\probe.ps1' -Html '.\examples\card.html' } catch { 'ERR: ' + `$_.Exception.Message; 'STACK: ' + `$_.ScriptStackTrace }"
$enc = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($inner))
cmd /c "powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand $enc > out.txt 2>&1"
```

修法：局部变量一律加前缀（`$probeJson`），不要和参数表里的名字撞。同理，`$args`、`$input`、`$error`、`$host`、`$matches`、`$profile` 这些自动变量也不能接。

## 15. Chrome 的 `--window-size` 不等于 `innerWidth/innerHeight`

`--window-size=1920,1080` 跑 headless，页面里读到的 `window.innerWidth/innerHeight` 是 **1904/985**（滚动条、窗口边框占掉了）。后果是「整帧容器」被误判出画：`div.bg`、`div.grid`、`div.stage` 这种 `position:absolute; inset:0` 的元素被报「超出画布 95px」，一屏十几条假警报，真问题就被淹了。

修法：别信 `innerWidth`，把画布尺寸从调用方传进来。

```powershell
# probe.ps1 注入时先定好画布
$snippet = "<script>`nwindow.__DSH_CANVAS = { w: $Width, h: $Height };`n$js`n</script>"
```

```js
var cv = window.__DSH_CANVAS || { w: innerWidth, h: innerHeight };
```

同理，`getBoundingClientRect()` 量出来的坐标一律对着这个尺寸比，不要对着 `innerWidth` 比。

### 顺带一条：别用「文字宽度」判断字体在不在

想知道字体栈里某个族名本机有没有，量文字宽度是最直觉的做法，但它会骗人：中文字符是全角，**任何字体下 5 个字的宽度都一样**，`"Noto Sans SC"`、`"PingFang SC"`、以及一个随便编的假名字，三者量出来的宽度完全相同（实测都是 480/427px）。`document.fonts.check()` 更不可靠，本机实测对所有族名都返回 `true`。

可靠做法是把字画进 canvas 比像素：同一段文字，字形不同就是不同字体，1 个像素的差别都能看出来。
## 16. 「修编码的脚本」自己也会被改坏（BOM 的鸡生蛋）

`edit` 这类工具写回 `.ps1` 时会丢 BOM，PowerShell 5.1 于是按 GBK 解析：中文变乱码、整个脚本语法报错。我为此加了 `scripts-win\fix-encoding.cmd`，结果第一次改它自己就踩了同一个坑——`fix-encoding.ps1` 连运行都运行不了，自然救不了自己。

判断有没有坏：**首字节不是 `239,187,191`**（也就是文件不以 `EF BB BF` 开头）。

救法不依赖任何工具，直接字节级补：

```powershell
$p = "scripts-win\fix-encoding.ps1"
$t = [System.IO.File]::ReadAllText($p, [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText($p, $t, (New-Object System.Text.UTF8Encoding($true)))
```

省事的规矩：**凡是 `.ps1`，改完立刻跑 `scripts-win\fix-encoding.cmd`，别等下一轮**；只有改的正好是 `fix-encoding.ps1` 本身时，才用上面的字节级写法。
## 17. `C:\Windows\System32\powershell` 是个 0 字节文件，会抢先命中

`verify.ps1` 要调子脚本收输出，写成 `& 'powershell' -File ... | Out-String`，得到这么一句：

```
无法在管道中间运行文档: C:\Windows\system32\powershell。
```

原因跟管道语法无关：这台机器的 `C:\Windows\System32\` 下有一个**0 字节、没有扩展名**的 `powershell` 文件（2026-10-25 写入），PowerShell 解析裸命令名时优先命中了它。更迷惑的是 `Get-Command powershell` 返回的 `.Source` 就是 `C:\Windows\system32\powershell` —— 命令解析本身已经指到这个假文件上了。

- `cmd.exe` 不认没有扩展名的文件（只按 PATHEXT 找），所以 `.cmd` 包装器一直没出过事；只有 PowerShell 里互相调用才会踩。
- 不接管道时它「成功」返回空字符串、不报错，第一眼看不出问题；一接管道就变成上面那句莫名其妙的话。
- 修法：用当前宿主自己的路径 `$psExe = Join-Path $PSHOME 'powershell.exe'`；`.cmd` 里一律写带扩展名的 `powershell.exe`。`$PSHOME` 就是正在跑的这个 PowerShell（本机 `C:\Windows\System32\WindowsPowerShell\v1.0`），比硬编码路径稳。
## 18. 生成的音乐「听着对」，拍点却差 150 ms

给 demo 合成配乐时踩了两个连着的坑，都属于「用耳朵听不出来、必须拿脚本量」的那类。

**坑一：小节线没落在拍网格上。** 第一版按 `t0 = i * bar` 铺和声（0、2.4、4.8…），而 `timing.json` 的拍网格是 `offset + k * beat`（从 0.15s 起算）。两者差 0.15 秒：底鼓踩在拍上，pad 和贝斯却在半拍外换和弦，整条音乐听起来「一直差半口气」。改成 `t0 = offset + i * bar`，所有「第几小节」的判定也跟着写 `int(max(0.0, tt - offset) // bar)`。**规则：只要 timing.json 有 offset，任何按小节/按拍的排布都从 offset 起算，不要从 0 起算。**

**坑二：拍点检测被开头的淡入骗了。** `check_audio.py` 第一版用全频段短时能量找起音，测出来相位 0.00s（真值 0.15s）——开头 0.12s 的淡入是全曲起音最猛的地方，任何一拍的底鼓都比不过它。两个修法一起上：

- 只取 40~120 Hz（底鼓频段）做 FFT 带通，pad、镲、拨弦都在这个频段之外；
- 评分时跳过前 0.2 秒（`detect_grid(env, hop, skip=0.2)`）。

改完同一份音频立刻测出 0.13s / 100.0 BPM。判据也没写成绝对相等：BPM 差 >2、相位差 >60 ms 才 ERROR，给「一帧之内的渲染误差」留余量。

## 19. 读 WAV 头算时长，别写死 data 块的偏移

`say.ps1` 合成旁白后想报个时长，第一版手写偏移：`Position=40; ReadInt32()` 当 data 长度。结果打印出「时长：-37,760.65s」。

WAV 头不是固定 44 字节：`fmt ` 之后可能还有 `fact`、`LIST` 等块，写死偏移就会把别的字段当长度读。改成按 chunk 走：

```powershell
$pos = 12
while ($pos + 8 -le $bytes.Length) {
    $id = [System.Text.Encoding]::ASCII.GetString($bytes, $pos, 4)
    $sz = [BitConverter]::ToInt32($bytes, $pos + 4)
    if ($id -eq 'fmt ') { $ch = [BitConverter]::ToInt16($bytes, $pos + 10); $sr = [BitConverter]::ToInt32($bytes, $pos + 12) }
    elseif ($id -eq 'data') { ...; break }
    $pos += 8 + $sz + ($sz % 2)   # 块按偶数对齐
}
```

顺带记两个 SAPI 的事实：`Microsoft Huihui Desktop` 输出的是 **22.05 kHz 单声道 16-bit**（不是 44.1k），`Rate` 的有效范围 -10~10，中文宣传片旁白用 -2 ~ 0 比较稳。

另外，旁白拿去做 `check_audio.py` 时要加 `--narration`：说话本来就有停顿，按音乐的阈值（>1.0s 无声判 ERROR）量旁白，一句一停就全是误报。旁白模式只抓「单段空白 ≥1.6s」和「整段一半以上是静音」。

## 20. SAPI 合成的中文旁白，句尾带将近一秒空白

`say.cmd` 合成出来的 wav，时长比实际说的话长一大截：实测三句分别 3.16 / 3.84 / 2.82 秒，掐掉首尾空白后是 2.21 / 2.89 / 1.93 秒——每句尾巴都有 **0.89~0.96 秒**的静音。

看着无害，放到字幕上就是灾难：字幕条的显示窗等于「这句的 wav 长度 + 留白」，于是每条字幕都比它说的话长出三分之一；下一条的起点也被推到 3.5 秒开外，整片节奏立刻拖沓。做过一版没掐静音的 demo，`check_sync.py` 报「语速 2.98 字/秒」（正常中文 4~5），就是这个原因。

修法：`gen_vo.py` 里按 -48 dBFS（0.004）找第一和最后一个有效样本，两头各留 50 ms 再裁，原地重写 wav。阈值别调太低，会把换气声也留下；别调太高，会把「的」「了」这种轻声削掉。

## 21. `json.dump` 在 Windows 上写出 CRLF，`fix-encoding -Check` 当场拦下

`path.write_text(json.dumps(...))` 用的是文本模式，Windows 下 `\n` 会被翻译成 `\r\n`，于是 `timing.json` 变成 CRLF——仓库规矩是「只有 .ps1/.cmd 用 CRLF，其余一律 LF」，`verify.cmd -Self` 的第 10 步立刻 FAIL：

```
编码：编码不合规 1 个：
  - template\timing.json（换行不是 \n）
```

修法：`write_text(..., newline="\n")`。这类「写文件」的脚本都要加，不然每次生成完都要跑一次 `fix-encoding.cmd`。

顺带记一条同时踩到的：把场景切点挪到拍点（4.35s）后，`check_timing.py` 报「不落在整帧上（130.500 帧）」。100 BPM @30fps 一拍 18 帧，但 offset 0.15s = 4.5 帧，拍网格本身就在半帧上——**踩拍和整帧不能同时满足**，只能把 offset 挪到整帧（0.1s = 第 3 帧）。`check_audio.py` 现在会主动提示这条整除关系，别等到切点报错才发现。

### 14. `npm run` 之前，`npm` 本身也要写成 `npm.cmd`

执行策略连 `npm.ps1` 一起拦（`因为在此系统上禁止运行脚本`）。`npm run typecheck` 同样得写 `npm.cmd run typecheck`，否则诊断输出里一条 TS 错误都看不到。

### 15. Remotion 里 `public/` 的图必须过 `staticFile()`

`<Img src="terminal.png" />` 在 `remotion still` 下会抛一长串 `dispatchEventForPluginEventSystem` 栈，看起来像 React 崩了，实际是图片找不到。写成 `<Img src={staticFile("terminal.png")} />` 立刻好。`render` 有时能侥幸通过，别拿它当验证手段。

### 16. `check_audio.py` 只吃 WAV，而本机 ffmpeg 不在 PATH

两条连着的坑：拿去测的是 mp4，脚本读不了；`ffmpeg` 命令也找不到。可用的是 Remotion 自带的那个：

```
examples\<项目>\node_modules\@remotion\compositor-win32-x64-msvc\ffmpeg.exe
```

抽音轨再测：

```
& <上面那个 ffmpeg> -y -i out\demo-1080p.mp4 -vn -ac 1 -ar 44100 out\mix.wav
python scripts-win\check_audio.py out\mix.wav --timing timing.json
```

交付前的 loudnorm 也用同一个 exe，并且**必须加 `-ar 48000`**：不加会输出 96 kHz 音轨，`check_video.py` 打印 `mp4a 2ch 0Hz`，很容易误判成坏文件。

### 17. SAPI 旁白的 RMS 只有 -26 dBFS，混完必然「人声被音乐盖」

SAPI 峰值不低、平均电平低，直接混音后实测人声只比纯音乐段高 5.3 dB，规范要求 ≥8 dB。`gen_vo.py` 里加了 `normalize_rms()`：按 RMS 归一到 -18 dBFS，用 tanh 软限幅把峰值压到 -1.5 dBFS（时长不变，字幕时间轴不动），复测人声 -21 / 音乐 -31，差 10.0 dB。归一化不能放进混音脚本——放进去，`voiceLines` 的 `dur` 就和实际播出的长度对不上了。
