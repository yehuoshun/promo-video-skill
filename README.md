# promo-video-skill

把「做一支产品宣传片」拆成 AI 能照着执行的规范，配一套可跑的 Remotion 骨架和会 fail 的校验闸门。

- **谁在执行**：DeepSeek（本机 agent）为主，Cursor / Claude Code 也能跑
- **跑在哪**：Windows 优先（PowerShell），Linux / macOS 兼容
- **现在到哪了**：P1 完成——`template/` 骨架能直接出片，15 秒 demo 1080p 渲染 28.6 秒、4K 79 秒，两个成片都过 `check_video.py`

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
  check_assets.py       素材宽度、比例、重名、中文文件名
  check_video.py        成片体检：分辨率、时长、码率（不依赖 ffmpeg）
  sheet.py              把一目录静帧拼成对比图（审图用）
template/              可复制的 Remotion 工程
  timing.json           分镜与时间（唯一真相）
  src/Root.tsx          1080p / 4K 两套 Composition + layout 路由
  src/lib/timing.ts     秒↔帧换算、节拍相位
  src/lib/anim.ts       ramp / keys / impulse / shake / typed / beatAt + 缓动，全部「帧 → 值」
  src/components/       Backdrop（径向光 + 网格 + 暗角 + 随拍呼吸）
  src/scenes/           Hook / Showcase / Cta
examples/
  card.html             1920×1080 样张，换配色只改 3 个 CSS 变量
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

## 怎么用

```powershell
# 0. 先体检（Node / Python / Chrome / 字体 / ffmpeg / 磁盘 一次看清）
scripts-win\doctor.cmd

# 1. 复制骨架建项目：拷 template、改包名、装依赖
scripts-win\new-project.cmd my-video -Dest ..

# 2. 改 timing.json 定节奏，改 src/scenes/ 做画面（每个场景一个组件）

# 3. 出片
cd ..\my-video
npm run render       # 1080p，约 30 秒
npm run render4k     # 4K，约 80 秒
```

npm 被 PowerShell 执行策略拦住时（见 [docs/windows-踩坑记录.md](docs/windows-踩坑记录.md) 第 1 条），用 `npm.cmd run render`。

## 路线图

| 阶段 | 内容 | 完成标志 |
|---|---|---|
| P0 | 骨架：精简 AGENTS.md + 4 份 references + Windows 脚本 | ✅ 空项目能出一张 1920×1080 静帧 |
| P1 | Remotion 骨架 + 15 秒 demo（3 场景） | ✅ `npm run render` 出片，1080p / 4K 都过 `check_video.py` |
| P2 | effect kit：网格渐变底 / 颗粒+暗角 / 光扫 / 动态大字 / 等距卡片 / 数字滚动 | 6 个 `(frame, fps, opts) => style` 纯函数组件 |
| P3 | 校验闸门：assets / stills / sheet / video | 坏资产、压扁截图、缺字能自动报错 |
| P4 | 声音（可选） | 先做无旁白 + 大字版，TTS 后置 |

## 授权与致谢

- 本仓库自有代码 MIT。
- 借鉴自 ai-promo-video-maker（MIT）。抄了结构或代码片段的地方在 `docs/借鉴清单.md` 里标了出处；照抄代码需保留原版权声明。
- 不复制对方 `references/` 的原文，只吸收结构与判定标准，文字全部重写。对方的案例复盘和踩坑记录属于它的实战资产，抄不走。
- Remotion 只对 3 人以内公司免费；ElevenLabs 免费套餐产物不可商用。本项目的默认路线不依赖这两者的付费能力。
