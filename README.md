# promo-video-skill

把「做一支产品宣传片」拆成 AI 能照着执行的规范，配一套可跑的 Remotion 骨架和会 fail 的校验闸门。

- **谁在执行**：DeepSeek（本机 agent）为主，Cursor / Claude Code 也能跑
- **跑在哪**：Windows 优先（PowerShell），Linux / macOS 兼容
- **现在到哪了**：P5 完成——能合成配乐、能查「音乐真的踩在 `timing.json` 的拍上吗」、成片有没有音轨也纳入了体检；七道闸门仍收在一条 `scripts-win\verify.cmd` 里。P1 的 demo、P2 的六个效果组件、P3 的三道新闸门都在，从样帧到成片的每一步都有脚本能判真假

## 为什么有这个项目

看了 [liyupi/ai-promo-video-maker](https://github.com/liyupi/ai-promo-video-maker)：它证明了「整条短片流程可以写成规范让 AI 执行」，但它是给 Cursor + 生图模型 + ElevenLabs 那套工具链写的——Windows 跑不通（脚本里全是 `python3`、`mkdir -p`、`bash -o pipefail`）、要生图、要配音、30KB 规范常驻上下文。

我想要的是同一套方法，在我自己的条件下能跑：没有生图、没有 ElevenLabs、Windows、上下文预算有限。

所以这个项目的定位是：**借它的结构，换它的手脚**。哪些借、怎么改、哪些不借，全部写在 [docs/借鉴清单.md](docs/借鉴清单.md)。

## 一句话原则

> 抄约束，不抄代码。规范里每一条都必须能用「截图 / 脚本输出 / 秒数」判定真假；不能判定的就不是规范，是许愿。

## 目录结构

```
AGENTS.md              常驻规范，4.7KB（对方是 30KB）
references/            按需加载的长文档，AI 只在对应阶段读
  需求问询.md           两轮提问清单 + 需求确认模板
  节奏.md               镜头时长底线 + 信息密度 + timing.json 结构
  校验清单.md           自动闸门 / 审图 / 交付前三层
  素材.md               截图规格、版权边界、降级顺序
scripts-win/           Windows 可跑的脚本（.cmd 包装 + .ps1 + .py）
  doctor.ps1/.cmd       环境体检：Node/npm/Python/Pillow/Chrome/git/中文字体/ffmpeg/磁盘
  shot.ps1/.cmd         HTML 截图，默认 1920×1080@2x = 3840×2160
  new-project.ps1/.cmd  复制 template 建新项目 + 装依赖
  check_timing.py       分镜结构、时长底线、版式重复、时间轴连续性
  check_assets.py       素材宽度、比例、重名、中文文件名、疑似小图放大
  check_stills.py       静帧体检：相邻截图差值，抓「时间轴在走、画面不动」
  check_video.py        成片体检：分辨率、时长、码率（不依赖 ffmpeg）
  probe.ps1/.cmd/.js    排版探针：headless Chrome 量 DOM，查文字被裁 / 图片变形 / 出画 / 缺字体
  verify.ps1/.cmd       一键体检：目录/环境/时间轴/素材/静帧/排版/成片/编码 八步汇总成一张表，有 ERROR 就 exit 1
  fix-encoding.ps1/.cmd 编码规整：.ps1 补 BOM + CRLF、.cmd 转 CRLF、其余 LF（-Check 只查不改）
  sheet.py              把一目录静帧拼成对比图（审图用）
template/              可复制的 Remotion 工程
  timing.json           分镜与时间（唯一真相）
  src/Root.tsx          1080p / 4K 两套 Composition + layout 路由
  src/lib/timing.ts     秒↔帧换算、节拍相位
  src/lib/anim.ts       ramp / keys / impulse / shake / typed / beatAt + 缓动，全部「帧 → 值」
  src/effects/          六个效果组件：网格渐变底 / 颗粒+暗角 / 光扫 / 动态大字 / 等距卡片 / 数字滚动
  src/components/       Backdrop（径向光 + 网格 + 暗角 + 随拍呼吸）
  src/scenes/           Hook / Showcase / Cta / EffectsLab（样板间）
examples/
  card.html             1920×1080 样张，换配色只改 3 个 CSS 变量
  bad.html              故意做错的样张（拉伸图 / 裁字 / 出画 / 缺字体），用来验证探针真的会 fail
  timing.example.json   52 秒 / 60fps / 14 场景的示例分镜（含两段快切蒙太奇）
docs/                  给人看的：借鉴清单、踩坑记录、样帧
out/                   静帧、对比图、成片（不进 git）
```

## P0 验收结果（本机实测）

![P0 静帧](docs/img/p0-frame.png)

| 命令 | 结果 |
|---|---|
| `scripts-win\doctor.cmd` | 8 OK / 1 WARN / 0 FAIL，exit 0（WARN = 本机没装 ffmpeg） |
| `python scripts-win\check_timing.py examples\timing.example.json` | 0 ERROR / 0 WARN，14 场景 52.0s @60fps |
| `scripts-win\shot.cmd examples\card.html out\frame-4k.png` | 3840×2160 PNG，2,793,234 字节，2.3 秒 |
| `scripts-win\shot.cmd examples\card.html out\frame-1080.png -Scale 1` | 1920×1080 PNG，1.4 秒 |
| `python scripts-win\sheet.py --dir out --cols 2` | 1848×564 对比图，103KB |
| `python scripts-win\check_assets.py out --min-width 1920` | 0 ERROR / 2 WARN（扫到的对比图本身不是 16:9，预期噪音） |

必要条件：Node 18+、Python 3.9+（Pillow）、Chrome 或 Edge。ffmpeg 只在混音、抽帧、换音轨时需要。

## P1 验收结果（本机实测）

![P1 十五秒 demo 的展示镜头](docs/img/p1-frame.png)

一支 15 秒、3 场景（大字钩子 → 浏览器框数据展示 → 落点网址）的 demo，全部由 `timing.json` 驱动：

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run render` | 450 帧 / 1920×1080 / 3.4MB / 28.6 秒 |
| `npm run render4k` | 450 帧 / 3840×2160 / 8.7MB / 79 秒 |
| `python scripts-win\check_video.py template\out\demo-1080p.mp4 --timing template\timing.json` | 15.00s / 1.80 Mbps / 1920×1080 / 0 ERROR |
| `python scripts-win\check_video.py template\out\demo-4k.mp4 --timing template\timing.json` | 15.00s / 4.66 Mbps / 3840×2160 / 0 ERROR（自动识别 2× 超采样） |
| `python scripts-win\check_timing.py template\timing.json` | 0 ERROR / 1 WARN（WARN = 15 秒不在 45~60 秒默认区间，demo 正常） |
| `scripts-win\new-project.cmd demo-video -Dest <空目录>` → `npm install` → `npm run render` | 端到端验过：全新目录建项目、装依赖、出片，`check_video.py` 0 ERROR |

两条实现取舍：

- **4K 用 CSS `zoom`**（`Root.tsx` 里 `zoom = width / WIDTH`），不是把 1080p 放大。裁 4K 静帧看地址栏小字，是按 4K 重新排版渲染的清晰文字；代价是 1px 边框会变 2px。
- **Remotion 自带编码器**，本机没装 ffmpeg 也能出 mp4；`check_video.py` 也不依赖 ffprobe，直接读 MP4 box。

## P2 验收结果（本机实测）

![六个效果的样板间：六段各 3 秒](docs/img/p2-effects.jpg)

`template/src/effects/` 里六个组件，`npm run render:effects` 出一段 18 秒样板间，每段 3 秒演一个效果（第 5 段是「左半边有颗粒、右半边没有」的对照）：

| 组件 | 做什么 | 配上什么语义才不空转 |
|---|---|---|
| `GradientMesh` | 会呼吸的多点渐变底 | 所有片段的底，替代纯黑 |
| `FilmLook` | 颗粒 + 暗角 | 压住"AI 味"，让画面像拍出来的 |
| `LightSweep` | 一条斜向亮带扫过 | 品牌登场、场景切换、按钮被点亮 |
| `BigType` | 动态大字（`slam` 砸出 / `mask` 擦出） | 痛点、结论、口号 |
| `IsometricCards` | 等距视差卡片阵列 | 功能矩阵、模块全景、定价档位 |
| `CountUp` | 数字滚动到位 | 数据卖点（用户数、准确率、耗时） |

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run render:effects` | 540 帧 / 1920×1080 / 5.5MB / 39.4 秒 |
| `python scripts-win\check_video.py template\out\effects.mp4 --duration 18` | 18.00s / 2.55 Mbps / 1920×1080 / 0 ERROR |

三条实现取舍：

- **颗粒不每帧重算**：一张 200×200 的 SVG `feTurbulence` 噪点板，三块轮换（`Math.floor(frame / 2) % 3`）+ 子像素抖动，`mixBlendMode: overlay`。每帧换 seed 要重新栅格化整块区域，4K 下渲染时间翻几倍；实测带颗粒的 540 帧 39.4 秒，摊到每帧只比 P1 不带颗粒的 demo 贵 14%。
- **效果组件不自己读 `useCurrentFrame`**，`frame` 由场景传进来。这样既能嵌进 `Sequence`，也能在样板间里并排比较、单独抽任意一帧渲染——这是「必须能 seek」那条硬规矩的具体做法。
- **三处是审图改出来的**（先看截图才发现，靠想象发现不了）：光扫 `strength` 1.25→0.62、带宽 620→480（1.25 时白成一整面墙，不像"扫过"）；等距卡片 `cardWidth` 300→330 加整体 `translate(4%, 6%)`（原来视觉重心偏左上、右下空一大块）；颗粒对照段用 `clipPath: inset(0 50% 0 0)` 只叠左半边，坐标仍按整帧算，不缩放折半——否则两半内容会错位。

## P3 验收结果（本机实测）

这一阶段补的是「靠肉眼看不出来的错」。原来的闸门只看文件：宽高对不对、时长对不对、码率够不够——于是「截图被拉扁了 4%」「标题第二个字被容器切掉了半截」「这一段三秒钟画面没动」全部能过。

**排版探针 `probe.cmd`**：不用 Playwright，headless Chrome 加 `--dump-dom` 就够——注入一段脚本量完盒子，把结果 base64 塞进一个 `<div>` 的属性里，dump 出来再解码。四类判定，每一条都是真人眼容易漏的：

| 检查 | 判定方式 | 级别 |
|---|---|---|
| 文字被裁 | 有文字的元素 `overflow` 非 `visible` 时，`scrollWidth/scrollHeight` 比客户区大出多少像素 | ERROR |
| 图片变形 | `<img>`/`<video>` 的原始长宽比 vs 渲染长宽比，偏差 > 2% | ERROR |
| 出画 | 带文字的元素超出画布多少像素（纯装饰的渐变光斑出血不算） | WARN（`-Strict` 升 ERROR） |
| 缺字体 | 把字画进 canvas 比像素，和「不存在的字体」渲染结果一致就是没有 | WARN |

| 命令 | 结果 |
|---|---|
| `scripts-win\probe.cmd examples\card.html` | 0 ERROR / 3 WARN，1.3 秒（WARN = 字体栈里的 PingFang SC / Noto Sans SC / Cascadia Mono 本机没有） |
| `scripts-win\probe.cmd examples\bad.html` | **2 ERROR / 3 WARN，exit 1**：`img` 渲染 404×404 而原图 400×100（差 75%）、`.clipped` 纵向超出 132px、`.bleed` 出画 90px、两个缺字体 |

**静帧体检 `check_stills.py`**：`check_video.py` 能证明「片子是 18 秒」，证明不了「这 18 秒里有几百个不同画面」。

| 命令 | 结果 |
|---|---|
| `python scripts-win\check_stills.py`（3 张真实静帧） | 11.71 / 6.82，0 ERROR / 0 WARN |
| 同上，多塞一张重复帧 | 差值 0.00 → **1 ERROR，exit 1**：「两张截图完全一样：f246 → f297，动画没生效」 |

**素材放大检测 `check_assets.py`**：判的是细节而不是尺寸。把图缩到一半再放大回来，原生图会掉细节、放大图几乎无损；像素复制式放大还有成对的重复行列。用合成的标定样本量出来的阈值：

| 样本 | 缩半往返误差 | 重复行列 | 判定 |
|---|---|---|---|
| 原生 1920×1080 静帧 | 0.93 | 0% | 过 |
| 双三次 2× 放大 | 0.12 | 74% | 报 |
| 双三次 3× 放大 | 0.13 | 74% | 报 |
| NEAREST 2× 放大 | 0.49 | 87% | 报 |

阈值取「误差 < 0.30 或 重复行列 > 65%」，并要求图本身有内容（标准差 > 10，否则纯渐变背景会误伤）。六个样本（3 张合成放大 + 2 张原生静帧 + 1 张 JPEG 拼图）跑下来三张放大全部报出、三张原生全部没误报。

三条实现取舍：

- **不引 Playwright**：只为了量盒子装一个几十 MB 的浏览器驱动不值，Chrome 本来就在（`shot.ps1` 已在用），`--dump-dom` + base64 通道足够把结构化结果带回来。
- **字体靠像素比对，不靠宽度**：中文全角，任何字体下 5 个字的宽度都一样，`PingFang SC`、`Noto Sans SC` 和随便编的假名字量出来完全相同（实测都是 480px）。`document.fonts.check()` 更假——本机对所有族名都返回 `true`。
- **探针只对 HTML 有效**：Remotion 场景是 TSX，量不到 DOM。所以它的位置是「样帧 / 素材页 / 浏览器框里的页面」进 Remotion 之前那道闸；Remotion 自己的画面靠 `check_stills.py` 抓静止帧。

## P4 验收结果（本机实测）

六道闸门各自都能 fail，但它们散在六个脚本里，全靠人记得挨个跑。`verify.cmd` 把它们串成一条命令，输出一张表：哪一步 OK / WARN / FAIL / SKIP、耗时多少、以及失败项原来的那句话。

```powershell
scripts-win\verify.cmd my-video             # 体检一个项目
scripts-win\verify.cmd template -Self       # 体检本仓库自己（会跑 examples\*.html）
scripts-win\verify.cmd ..\proj -Video ..\proj\out\final-4k.mp4 -Strict -Quiet
```

八步：目录结构 → 环境（doctor）→ 时间轴（check_timing）→ 素材（check_assets）→ 静帧（check_stills）→ 排版（probe，逐个 HTML）→ 成片（check_video）→ 编码（fix-encoding，只在 -Self 时跑）。

| 命令 | 结果 |
|---|---|
| `scripts-win\verify.cmd template` | 3 通过 / 2 警告 / 0 失败 / 2 跳过，3.0s，exit 0（警告 = 本机没装 ffmpeg、15 秒不在 45~60 秒区间） |
| `scripts-win\verify.cmd -Self` | 5 通过 / 2 警告 / 0 失败 / 1 跳过，5.0s，exit 0 |
| 故意做坏的项目（静帧重复 + 小图放大 + bad.html + 15 秒） | 2 通过 / 3 警告 / 2 失败，4.1s，**exit 1** |

坏项目里它逐条点名（原样输出）：

```
[ 4] 素材         WARN    0.5s  1 条警告
      - 疑似小图放大：shot-fake.png —— 缩半再放大误差 0.03，重复行列 88%，4K 下会糊，换大图或改用矢量/截图
[ 5] 静帧         FAIL    0.5s  1 个错误
      - 两张截图完全一样（差 0.00）：f060.png → f140.png —— 动画没生效，或在播同一帧
[ 6] 排版         FAIL    1.3s  1 张：bad.html
      错误 bad.html：图片变形：div.stage > img.stretched  渲染 404x404，原图 400x100（差 75%）
      警告 bad.html：字体全缺：字体栈「"PingFang SC", "Noto Sans SC", sans-serif」里的 PingFang SC、Noto Sans SC 本机都没有，浏览器用的是默认字体

结果：2 通过 / 3 警告 / 2 失败 / 0 跳过（4.1 秒）

失败项：
  - 静帧：1 个错误
  - 排版：1 张：bad.html
```

四条实现取舍：

- **判定规则留在各闸门里，verify 只调度和判词**：一旦把阈值抄进 verify，两边就会悄悄漂移。verify 拿到的是子脚本的 exit code 和输出原文。
- **WARN 不拦交付，FAIL 才 exit 1**：`-Strict` 把「看情况算不算错」的项（出画、时长）升级成失败。
- **成片的挑选顺序**：`final-4k` → `final-1080p` → `final` → `demo-4k` → `demo-1080p` → `demo` → `out/` 里最新的 mp4。少了这个顺序，`template/out/effects.mp4` 那条 18 秒样板间会被当成立片，报「时长 18.00s，期望 15.00s」。
- **`-Self` 会把根切到 `template/`**：在仓库根跑，第一步就会报「缺 timing.json」，把真问题淹掉；同时也排除 `examples\bad*.html` 这类故意做坏的反例，保证自检本身是绿的。

**字体判定的修正**（P3 的一个教训）：原来按「每个族名」判，`"Microsoft YaHei","PingFang SC","Noto Sans SC",sans-serif` 这种跨平台字体栈掉了一两个族名就告警——可这本来就是正确写法。现在按**整条栈**判：栈里一个族名都命中不了才报（那时浏览器用的是默认字体，字形完全不是你设计的那套）。改完 `examples\card.html` 从 3 WARN 变 0 WARN，`bad.html` 的「字体全缺」仍然抓得住。
## P5 验收结果（本机实测）

| 命令 | 实测 |
|---|---|
| `python scripts-win\gen_music.py template\timing.json --out template\public\bgm.wav` | 1292 KB / 15.00s / 峰值 -3.1 dBFS / RMS -19.0 dBFS |
| `python scripts-win\gen_sfx.py` | whoosh 0.55s、click 0.09s、riser 1.2s |
| `python scripts-win\check_audio.py template\public\bgm.wav --timing template\timing.json` | 实测 100.0 BPM / 相位 0.13s（偏差 +0.0 BPM、-20 ms）/ 0 ERROR |
| `scripts-win\say.cmd "把流程写成规范，不是提示词，是施工图。" -Out tmp\voice.wav -Rate -2` | 6.85s / 295 KB / Microsoft Huihui Desktop（zh-CN） |
| `python scripts-win\check_audio.py tmp\voice.wav --narration` | 0 ERROR（旁白模式：句间自然停顿不算毛病） |
| `npm run render` | 3.80 MB，音轨 `mp4a 2ch 48kHz` |
| `scripts-win\verify.cmd -Self` | 7 通过 / 2 警告 / 0 失败 / 0 跳过（11.7 秒） |

![P5 配乐的波形与频谱，红线是按 timing.json 画的拍点](docs/img/p5-bgm.png)

上图是 `check_audio.py --png` 顺手画出来的：上半是波形，下半是频谱，红线按 `timing.json` 的 BPM / offset 画——红线刚好压在每次起音上，就说明音乐踩对了拍。这张图比听十遍都直观：第一版的小节线错开 0.15 秒时，红线正是歪在起音缝里的。

为什么自己合成音乐而不是找素材：**版权**（宣传片是要商用的）和**可复现**（同一份 timing.json 每次生成的 wav 逐字节相同，改完 BPM 重跑一次就好）。`gen_music.py` 读 `timing.json` 的 `beats.bpm/offset` 和 `duration`，A 小调六小节 Am Am F F C G，pad + 贝斯 + 底鼓 + 镲 + 十六分拨弦，单声道 44.1kHz。这是「能用」的占位，不是成品配乐——真做商业片把这一轨换成买来的音乐，其余一个字不用改。

三条实现取舍：

- **小节线必须落在拍网格上**：第一版写 `t0 = i * bar`（0、2.4、4.8…），而拍网格从 `offset=0.15` 起算，整条音乐的小节和拍点错开 0.15 秒——听感上是「一直差半口气」，看波形看不出来，是 `check_audio.py` 报「相位差 -150 ms」才暴露的。
- **拍点检测只看底鼓频段**：宽带起音曲线会被开头淡入骗到（那一下比任何一拍都猛），实测把相位拽到 0.00s。改成 FFT 带通 40~120 Hz + 跳过前 0.2 秒，同一份音频立刻测出 0.13s（真值 0.15s）。判据也不是「绝对相等」：BPM 差 >2 或相位差 >60 ms 才 ERROR。
- **有没有声音分两层查**：`check_audio.py` 查音频文件本身（时长、电平、拍点位置），`check_video.py` 查成片里有没有 `soun` 轨。Remotion 的 `<Audio>` 路径写错会**静默跳过**——片子照常渲染，只是没声；现在 timing.json 配了 `audio.bgm` 而成片无音轨，直接 ERROR。

音轨在 `template/src/Soundtrack.tsx`：背景音乐用帧回调算音量包络（淡入 0.2s / 淡出 0.9s），音效按 `audio.sfx[].at` 插在场景切点，全部读 `timing.json`。旁白是可选的一条轨（`audio.voice`），先用 `say.cmd` 合成再丢进 `public/`。
## 怎么用

```powershell
# 0. 先体检（Node / Python / Chrome / 字体 / ffmpeg / 磁盘 一次看清）
scripts-win\doctor.cmd

# 1. 复制骨架建项目：拷 template、改包名、装依赖
scripts-win\new-project.cmd my-video -Dest ..

# 2. 改 timing.json 定节奏，改 src/scenes/ 做画面（每个场景一个组件）

# 3. 配乐（可选）：从 timing.json 的 BPM 生成一条占位 BGM，再用生成器补齐音效
python ..\scripts-win\gen_music.py timing.json --out public\bgm.wav
python ..\scripts-win\gen_sfx.py --out-dir public\sfx

# 4. 出片
npm run render       # 1080p，约 30 秒
npm run render4k     # 4K，约 80 秒

# 5. 交付前体检：一条命令跑完七道闸门，有 ERROR 就 exit 1
scripts-win\verify.cmd .
```

npm 被 PowerShell 执行策略拦住时（见 [docs/windows-踩坑记录.md](docs/windows-踩坑记录.md) 第 1 条），用 `npm.cmd run render`。

## 路线图

| 阶段 | 内容 | 完成标志 |
|---|---|---|
| P0 | 骨架：精简 AGENTS.md + 4 份 references + Windows 脚本 | ✅ 空项目能出一张 1920×1080 静帧 |
| P1 | Remotion 骨架 + 15 秒 demo（3 场景） | ✅ `npm run render` 出片，1080p / 4K 都过 `check_video.py` |
| P2 | effect kit：网格渐变底 / 颗粒+暗角 / 光扫 / 动态大字 / 等距卡片 / 数字滚动 | ✅ 6 个组件 + 18 秒样板间，`npm run render:effects` 出片过 `check_video.py` |
| P3 | 校验闸门：assets / stills / probe / video | ✅ 坏资产、压扁截图、缺字体、静止帧都能自动报错（examples\bad.html 是反例样本，跑它必 exit 1） |
| P4 | 一条命令串起六道闸门（verify） | ✅ 正常项目 exit 0、坏项目 exit 1 并点名原因（静帧重复 / 小图放大 / 排版两个 ERROR） |
| P5 | 声音：合成配乐 / 音效 / 离线旁白 + 拍点与音轨校验 | ✅ 配乐实测 100.0 BPM、相位偏差 -20 ms；成片带 mp4a 音轨；旁白可离线合成并单独体检 |

## 授权与致谢

- 本仓库自有代码 MIT。
- 借鉴自 ai-promo-video-maker（MIT）。抄了结构或代码片段的地方在 `docs/借鉴清单.md` 里标了出处；照抄代码需保留原版权声明。
- 不复制对方 `references/` 的原文，只吸收结构与判定标准，文字全部重写。对方的案例复盘和踩坑记录属于它的实战资产，抄不走。
- Remotion 只对 3 人以内公司免费；ElevenLabs 免费套餐产物不可商用。本项目的默认路线不依赖这两者的付费能力。
