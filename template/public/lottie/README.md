# public/lottie —— Lottie 素材

`demo-badge.json`：**自绘演示素材，无第三方版权，可自由替换。**

## 这份素材从哪来

不是从 AE 导出、也没有从 LottieFiles 下载——是手写的 Bodymovin JSON，三个 shape layer
全部由本项目自己画（圆形底 + 勾号 + 外扩光环），没有嵌图、没有嵌字体、没有引用任何外部
资产，因此不涉及第三方授权。改坏了大不了重画，不用担心版权。

- 版本字段：`v: "5.7.4"`、`fr: 30`、`ip: 0`、`op: 90`、`w/h: 512`
- 结构：3 个 shape layer（`ty: 4`），动效都写在 `ks` 的关键帧数组里
  - `check`：勾号路径 + trim path，0.33~1.53 秒描边生长，`st` 用底色画出「挖空」效果
  - `ring`：强调色圆底，`ks.s` 做一次缩放脉冲（100 → 107 → 100）
  - `halo`：描边圆环，边放大边淡出（100 → 150、透明度 0 → 58% → 0）
- 颜色取自 `src/lib/theme.ts`：强调色 `#8ef0c8`、底色 `#07090d`。
  Lottie 里存的是 0~1 的浮点数组（`[0.5569, 0.9412, 0.7843, 1]`），不是 hex——
  改主题色时这里要一起改，否则和画面其余部分不同调。

## 怎么用

```tsx
import demoBadge from "../../public/lottie/demo-badge.json";

<Lottie frame={lf} fps={fps} data={demoBadge} from={0.12} width={520} height={520} />;
```

`data` 要的是解析好的对象，不是路径，所以 `import` 进来（`tsconfig` 已开
`resolveJsonModule`）。组件内部把「场景帧」换算成「素材帧」再交给 lottie seek，
不会自己跑时间轴，所以能嵌进 `Sequence` 也能在 Lab 里并排比对（细节见
`src/effects/Lottie.tsx` 的注释）。

## 换成自己的素材

1. 把 `.json` 放进这个目录（文件名小写、连字符）；
2. 在场景里 `import` 它，替换 `data`；
3. **用第三方 AE 模板/LottieFiles 素材时，商用授权要跟素材一起记**（写在
   素材清单或本 README 里：来源链接、授权类型、是否允许商用、购买凭据放哪）。
   方案第 4.1 节的要求：授权记录和素材同仓同目录，别只留在聊天记录里。
4. 检查素材本身别带自己的时钟（AE 里导出的表达式、`Math.random` 之类），
   否则同一帧渲两次结果会不一样。

## 版权

`demo-badge.json` 与本目录下的说明文字均无第三方版权，可自由替换、自由使用、
随仓库一起分发。
