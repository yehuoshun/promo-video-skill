# template —— 宣传片骨架

复制这个目录就是新项目。它只做三件事：读 `timing.json`、按 `layout` 摆场景、逐帧渲染。

## 一条命令出片

```powershell
npm install
npm run render          # → out/demo-1080p.mp4（15 秒 demo）
npm run render4k        # → out/demo-4k.mp4（3840×2160）
npm run render:effects  # → out/effects.mp4（六个效果的样板间，18 秒）
npm run still           # → out/still.png（单帧，调版式时用）
npm run studio          # 浏览器里实时预览，改代码即时刷新
```

Remotion 自带的 ffmpeg 会处理编码，**本机没装 ffmpeg 也能出 mp4**。

## 改哪里

| 想改什么 | 动哪个文件 |
|---|---|
| 时长、分镜顺序、字幕文案、节拍 | `timing.json` |
| 某个场景长什么样 | `src/scenes/<Name>.tsx` |
| 配色、字体 | `src/lib/theme.ts` |
| 新增一种动效 | `src/lib/anim.ts`（只加纯函数，别引入会自己跑的动画库） |
| 接一个新 layout | `src/Root.tsx` 的 `LAYOUTS` |

`timing.json` 是唯一的时间真相：画面、字幕、节拍都从它读。场景组件里**不许写死秒数**。

## 目录

```
timing.json            分镜与时间（唯一真相）
src/index.ts           入口
src/Root.tsx           两套 Composition（1080p / 4K）+ layout 路由
src/lib/timing.ts      读 timing.json，秒/帧换算
src/lib/anim.ts        帧 → 值的纯函数（ramp/keys/impulse/shake/typed/beatAt）
src/lib/theme.ts       配色与字体
src/components/        Backdrop 等可复用外壳
src/effects/           六个效果组件，全是 (frame, fps, opts) 纯函数
src/scenes/            Hook / Showcase / Cta / EffectsLab
public/                截图、音乐、字体（原图，不压缩）
out/                   渲染产物（不进 git）
```

## 效果组件（`src/effects/`）

六个能直接拼进场景的组件。都只吃 `frame` 和 `fps`，没有内部状态、没有 `useEffect`、没有 CSS 动画，
所以任意帧都能单独渲染——这是它们能被 Remotion 用、也不会让 4K 糊的前提。

| 组件 | 做什么 | 常用参数 | 适合配什么语义 |
|---|---|---|---|
| `GradientMesh` | 会呼吸的多点渐变底 | `colors` / `speed` / `opacity` | 所有片段的底，替代纯黑 |
| `FilmLook` | 颗粒 + 暗角 | `grain` / `vignette` | 压住"AI 味"，让画面像拍出来的 |
| `LightSweep` | 一条斜向亮带扫过 | `start` / `duration` / `angle` / `width` / `strength` | 品牌登场、场景切换、按钮被点亮 |
| `BigType` | 动态大字（`slam` 砸出 / `mask` 擦出） | `lines` / `mode` / `size` / `from` | 痛点、结论、口号 |
| `IsometricCards` | 等距视差卡片阵列 | `items` / `columns` / `cardWidth` / `tilt` / `spin` | 功能矩阵、模块全景、定价档位 |
| `CountUp` | 数字滚动到位 | `value` / `decimals` / `suffix` / `start` | 数据卖点（用户数、准确率、耗时） |

用法：在场景组件里拿 `useCurrentFrame()` 的**场景内帧号**（不是全局帧）喂进去。

```tsx
const frame = useCurrentFrame();
const local = frame - sceneRange(timing, "hook-01").start;
<GradientMesh frame={local} fps={fps} />
<BigType frame={local} fps={fps} kicker="KICKER" lines={[{ text: "把素材" }, { text: "变成节奏。", accent: true }]} />
<FilmLook frame={local} grain={0.18} />
```

`npm run render:effects` 会渲染 `EffectsLab`——六段各 3 秒的样板间，一段一个效果（第 5 段是"左半边有颗粒、
右半边没有"的对照）。挑效果时先跑它，再决定往片子里拼哪些。样板间不走 `timing.json`，不参与时长与版式校验。

## 两条硬规矩

1. **4K 不是重排版**：`Root.tsx` 用 `zoom` 把 1920×1080 的布局整体放大到 3840×2160。所以尺寸永远按 1080p 写。
2. **动画必须能 seek**：每帧由 `useCurrentFrame()` 算出。GSAP 要手动 `seek`，Framer Motion 要包一层，Lottie/Three/Rive 用官方适配层，**纯 CSS animation/transition 绝对不行**——渲染器抓不到时间，会渲染成一堆相同的帧。

## 自检

```powershell
..\scripts-win\doctor.cmd                                   # 环境
python ..\scripts-win\check_timing.py timing.json --allow-duration
python ..\scripts-win\check_video.py out\demo-1080p.mp4 --timing timing.json
```
