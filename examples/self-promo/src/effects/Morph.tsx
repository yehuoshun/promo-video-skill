import React, { useMemo } from "react";
import { AbsoluteFill } from "remotion";
import { interpolate } from "flubber";
import { clamp, easeInOutCubic, ramp, type Ease } from "../lib/anim";
import { theme } from "../lib/theme";

/**
 * 形状 morph：一条 path 平滑变成另一条 path（flubber 0.4.2）。
 *
 * 为什么它是安全的（方案第 2 节的四问）：
 *   1. 只给 t 就能得到那一帧——flubber 的 `interpolate(a, b)` 返回 `f(t)`，
 *      没有任何内部时钟；
 *   2. 第 N 帧不需要前 N-1 帧——f 是纯函数，t 由 ramp() 从 frame 直接算；
 *   3. 没有 rAF / performance.now / CSS transition；
 *   4. 只在「旧 → 新」的转场镜头用（方案第 8 节：morph 不做装饰）。
 *
 * 注意命名：这里的 `from` / `to` 是**形状**（SVG path 的 d 字符串），不是秒数。
 * 起始时间叫 `fromAt`（秒）——别把它和 BigType 的 `from`（秒）搞混。
 *
 * 用法：
 *   <Morph frame={lf} fps={fps} from={OLD} to={NEW} fromAt={0.3} duration={0.9} />
 *   // 3 秒的段落里想让「整段都在动」，别只写一次变形，开 pingPong 走一圈回来：
 *   <Morph frame={lf} fps={fps} from={OLD} to={NEW} duration={3} pingPong />
 *
 * 形状约定：两条 path 必须同一个坐标系（同一 viewBox），闭合、单环时效果最稳；
 * 点数不同不用管，flubber 会自己补点；多个环请自己拆成多个 <Morph> 叠起来。
 */

export type MorphProps = {
  /** 当前帧（场景内的局部帧，不是全片帧） */
  frame: number;
  fps: number;
  /** 起点形状：SVG path 的 d 字符串 */
  from: string;
  /** 终点形状：SVG path 的 d 字符串 */
  to: string;
  /** 第几秒开始变形，默认 0（秒，不是帧） */
  fromAt?: number;
  /** 变形持续多少秒，默认 1 */
  duration?: number;
  /** 填充色，传 "none" 就是纯描边；默认主题强调色的低透明度 */
  fill?: string;
  /** 描边色，传 "none" 关掉；默认主题强调色 */
  stroke?: string;
  /** 描边粗细，单位是 viewBox 坐标系（不是屏幕像素） */
  strokeWidth?: number;
  /** 元素在画面里的宽高（px，按 1920×1080 布局坐标写） */
  width?: number;
  height?: number;
  /** 形状自身的坐标范围；from/to 必须落在同一个 viewBox 里 */
  viewBox?: string;
  /** 变形曲线，默认 easeInOutCubic（morph 用两头慢中间快最自然） */
  ease?: Ease;
  /** 元素中心点（px，布局坐标），默认画面正中 */
  x?: number;
  y?: number;
  /** 额外缩放与旋转，摆位用，不影响 t */
  scale?: number;
  rotate?: number;
  opacity?: number;
  zIndex?: number;
  /**
   * 让变形「去 → 回」走一遍（圆 → 方 → 圆），此时 `duration` 是整趟往返的时长。
   *
   * 为什么需要它：一个 `<Morph>` 只走一次，塞进 3 秒的段里就必然「前半段在变、
   * 后半段定死」——实测过，段尾 1.5 秒的相邻帧差掉到运动段的 1/10 以下，肉眼就是死画面。
   * 打开 pingPong 后 t 是三角波（0 → 1 → 0），整段都有变化；曲线仍用 `ease`，
   * 所以起止点和折返点都不会突然加速。
   */
  pingPong?: boolean;
  /**
   * flubber 拆曲线的粒度（viewBox 单位，默认 0.9）。
   *
   * 粒度越小越圆滑，代价是每帧的 d 字符串线性膨胀（100 单位 viewBox、520px 显示，
   * 本机 node 26 实测这一对「圆 → 方」）：
   *   0.1 → d 平均 146,137 字符、f(t) 2.17ms/次
   *   0.35 → 36,527 字符、0.62ms/次（上一版默认值，33 倍于默认 10，纯浪费）
   *   0.9 → 18,241 字符、0.27ms/次（现值）
   *   10  → 1,104 字符、0.017ms/次（棱真的能看出来，只适合小尺寸或草稿）
   * 0.9 在 520px 上「一段弧 ≈ 4.7px」，圆弧的弓高不足 0.02px，看不出是多边形；
   * 再小只增加字符数和渲染时间。需要更圆就自己传更小的值，别小于 0.1。
   */
  maxSegmentLength?: number;
};

export const Morph: React.FC<MorphProps> = ({
  frame,
  fps,
  from,
  to,
  fromAt = 0,
  duration = 1,
  fill = theme.accentSoft,
  stroke = theme.accent,
  strokeWidth = 3,
  width = 520,
  height = 520,
  viewBox = "0 0 100 100",
  ease = easeInOutCubic,
  x = 960,
  y = 540,
  scale = 1,
  rotate = 0,
  opacity = 1,
  zIndex = 20,
  pingPong = false,
  maxSegmentLength = 0.9,
}) => {
  /**
   * 只在 from/to 变化时重建插值器：flubber 建插值器要做形状配对，
   * 比逐帧取 d 贵两个数量级，绝不能放进每帧都跑的路径里。
   */
  const interp = useMemo(
    // string: true → f(t) 直接返回 path 的 d 字符串（flubber 默认就是 true，写明免得后人踩）
    () => interpolate(from, to, { maxSegmentLength, string: true }),
    [from, to, maxSegmentLength],
  );

  // 同一帧永远算出同一个 t：单程时由 ramp 把 [fromAt, fromAt+duration] 之外的值夹到端点；
  // pingPong 时 raw 走 0 → 1 → 0（折返点正好在中点），越界后回到 from 并停住，
  // 两种都是对 frame 的纯函数，没有跨帧状态。
  const startFrame = fromAt * fps;
  const spanFrames = Math.max(1, duration * fps);
  const raw = (frame - startFrame) / spanFrames;
  const t = pingPong
    ? clamp(ease(clamp(1 - Math.abs(1 - 2 * raw))))
    : clamp(ramp(frame, startFrame, spanFrames, { ease }));

  const d = interp(t);

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <svg
        width={width}
        height={height}
        viewBox={viewBox}
        style={{
          position: "absolute",
          left: x - width / 2,
          top: y - height / 2,
          overflow: "visible",
          opacity,
          zIndex,
          transform: `rotate(${rotate}deg) scale(${scale})`,
          transformOrigin: "50% 50%",
        }}
      >
        <path d={d} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
      </svg>
    </AbsoluteFill>
  );
};
