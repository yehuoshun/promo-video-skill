# 展品证据来源（data/ 下每个文件怎么来的）

成片里出现的每一行字都必须能在真输出里找到原话，这里记下复现命令。
重跑一遍就会覆盖同名文件，画面上的数字随之变化——这是有意的，避免「图是几个月前截的」。

| 文件 | 复现命令 | 说明 |
|---|---|---|
| `verify-open.txt` | `cd examples/self-promo; ..\..\scripts-win\verify.cmd .` | 工程刚建好、还没填素材时的第一次体检（真跑） |
| `verify-green.txt` | 同上，渲染完成后再跑一次 | 交付前的体检（真跑） |
| `probe-bad.txt` | `scripts-win\probe.cmd <bad.html>`（bad.html 取自 `git show 600feb7:examples/bad.html`） | 真浏览器量出来的 2 ERROR / 2 WARN |
| `gates.txt` | 从 `scripts-win/verify.ps1` 里 `Report '<名称>'` 调用按出现顺序提取 | 十一道闸门的名字与顺序 |
| `timing-snippet.txt` | `Get-Content timing.json -TotalCount 16` | 本片真实时间轴前 16 行 |
| `tree.txt` | `Get-ChildItem` 真实列目录 | 工程骨架 |

`build.py` 只做一件事：把这些文字重新排版成「打印件」PNG，**内容一个字不改**。
波形图 `exhibit-bgm-wave.png` 由 `public/bgm.wav` 的真实采样画出来，红线是按
`timing.json` 的 `beats.bpm / beats.offset` 算的拍点（与画面、音效同一份数据）。
