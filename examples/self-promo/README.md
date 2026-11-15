# self-promo —— 用这个技能包，拍它自己的宣传片

这是 `promo-video-skill` 的**实例项目**（不是模板）。一支 52.8 秒的宣传片，从分镜、配乐、排版到成片，
没有打开过剪辑软件：五个场景、横竖两版、三张封面、十一道闸门全绿，全部由这套脚本 + Remotion 出。

想看结论直接翻 [发布物料.md](./发布物料.md)（三平台标题/简介/tag）和 [需求确认.md](./需求确认.md)（共识与修改记录）。

## 交付物

| 文件 | 规格 | 给谁 |
|---|---|---|
| `宣传片 1080p60 横版.mp4` | 1920×1080 · 60fps · 52.8s · 40.8 MB | B站 |
| `宣传片 1080p60 竖版.mp4` | 1080×1920 · 60fps · 52.8s · 47.2 MB | 抖音 / 小红书 |
| `封面 16x9.png` | 1920×1080 | B站封面 |
| `封面 9x16.png` | 1080×1920 | 抖音 / 小红书封面 |
| `封面 3x4.png` | 1080×1440 | 小红书笔记首图 |

`*.mp4` 被 `.gitignore` 挡在仓库外，所以成片在 `out/` 与本目录各放一份（本目录的是要上传的那份）；
封面只有 0.27 MB 左右，直接进仓库。

竖版不是横版裁一刀：五个场景按 1080×1920 **重新排版**（字更大、打印件单独摆位、数字条上移），
两版共用同一份 `timing.json`，所以节奏、文案、拍点完全一致。

## 这支片子拍的是什么

| 段落 | 时间 | 画面 | 声音 |
|---|---|---|---|
| 01 反例 | 0–7.2s | 施工图版式上贴 `probe.cmd` 真跑出来的 2 ERROR，红章「不合格」盖下来 | 第 1 小节 + 盖章 SFX（1.2s，正落在拍点） |
| 02 闸门 | 7.2–19.2s | 十一道闸门清单，最后落到 `1` 退出码 | 5 小节，gate 每 2 拍亮一条 |
| 03 时间轴 | 19.2–31.2s | 画面 / 字幕 / 声音三轨铺满全片，playhead 从左走到右 | 5 小节 |
| 04 声音 | 31.2–43.2s | 自己的 `bgm.wav` 波形 + 拍点红线 | 本段音乐就是证据 |
| 05 收尾 | 43.2–52.8s | 图签放大 + 仓库地址 + 公章「全绿」 | 4 小节，whoosh 滑进来再盖章（44.4s） |

**全片没有 AI 生成的画面**：8 张展品都是 `assets-src/exhibits/build.py` 从真实命令输出排版后截的图，
配乐与音效都是 `scripts-win\gen_music.py` / `assets-src/sfx/gen_sfx.py` 现场算出来的，素材费 0 元。

## 怎么复现

```powershell
npm install

# 出片（横版 / 竖版）
npm run render            # → out/demo-1080p.mp4
npm run render:v          # → out/demo-vertical.mp4

# 三张封面
npx remotion still src/index.ts Cover169 out/cover-16x9.png --frame=0
npx remotion still src/index.ts Cover916 out/cover-9x16.png --frame=0
npx remotion still src/index.ts Cover34  out/cover-3x4.png --frame=0

# 静帧审查（每场景 35% / 85% 各一张，共 11 张）
npm run stills
python ..\..\scripts-win\check_stills.py out\stills
python ..\..\scripts-win\check_motion.py out\stills
npm run sheet             # → out/sheet.jpg

# 交付体检：十一道闸门
..\..\scripts-win\verify.cmd .
```

`verify.cmd` 当前结果：**6 通过 / 2 警告 / 0 失败 / 2 跳过**（警告是环境缺 ffmpeg、以及 `check_assets`
把大面积纯色的真实截屏误判成「小图放大」，两条都在 `需求确认.md` 里核过）。

## 改哪里

| 想改什么 | 动哪个文件 |
|---|---|
| 时长、文案、节拍、音效 | `timing.json`（唯一时间与文案真相） |
| 五个场景的版式 | `src/scenes/Boards.tsx`（只摆位，不写字） |
| 封面版式 | `src/scenes/Cover.tsx`（一个组件出三种比例） |
| 施工图零件（图框、图签、尺寸线、红章） | `src/lib/paper.tsx` |
| 配色、字体 | `src/lib/theme.ts` / `src/lib/paper.tsx` 的 `C` |

场景里**不许写死秒数与文案**：秒数从 `timing.json` 读，屏幕文字只写在 `scenes[].onscreen`
（`**字**` 是强调色，`@gates` / `@duration` / `@frames` / `@fps` / `@scenes` 渲染时算成真数字，
见 `src/lib/onscreen.ts` 的 `t()`）。

## 目录

```
timing.json          分镜、时间、文案、节拍、音效（唯一真相）
需求确认.md           共识、风险与修改记录
调研笔记.md           事实与素材出处
发布物料.md           三平台标题 / 简介 / tag / 封面
src/Root.tsx         横版 Main / 竖版 Vertical / 三种封面 / EffectsLab
src/lib/paper.tsx    施工图零件：图框、图签、尺寸线、红章、打印件
src/lib/anim.ts      帧 → 值的纯函数（enter / spring / ramp / shake）
src/lib/onscreen.ts  槽位与 token 填充
src/scenes/          Boards（五个场景）+ Cover
public/exhibits/     8 张力真实截屏（2400×1350）
public/bgm.wav       按 100 BPM 合成的配乐（52.80s）
public/sfx/          whoosh / stamp / tick
assets-src/          展品与音效的生成器（截图与音频都是产物，生成器才是源）
out/                 静帧、对比图、成片（不进 git）
```
