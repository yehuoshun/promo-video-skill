# template —— 宣传片骨架

复制这个目录就是新项目。它只做三件事：读 `timing.json`、按 `layout` 摆场景、逐帧渲染。

## 一条命令出片

```powershell
npm install
npm run render          # → out/demo-1080p.mp4（15 秒 demo）
npm run render4k        # → out/demo-4k.mp4（3840×2160）
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
src/scenes/            Hook / Showcase / Cta
public/                截图、音乐、字体（原图，不压缩）
out/                   渲染产物（不进 git）
```

## 两条硬规矩

1. **4K 不是重排版**：`Root.tsx` 用 `zoom` 把 1920×1080 的布局整体放大到 3840×2160。所以尺寸永远按 1080p 写。
2. **动画必须能 seek**：每帧由 `useCurrentFrame()` 算出。GSAP 要手动 `seek`，Framer Motion 要包一层，Lottie/Three/Rive 用官方适配层，**纯 CSS animation/transition 绝对不行**——渲染器抓不到时间，会渲染成一堆相同的帧。

## 自检

```powershell
..\scripts-win\doctor.cmd                                   # 环境
python ..\scripts-win\check_timing.py timing.json --allow-duration
python ..\scripts-win\check_video.py out\demo-1080p.mp4 --timing timing.json
```
