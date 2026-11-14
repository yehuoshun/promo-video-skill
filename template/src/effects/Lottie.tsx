import React from "react";
import { Lottie as RemotionLottie, type LottieAnimationData } from "@remotion/lottie";
import { AbsoluteFill, Freeze } from "remotion";
import { clamp } from "../lib/anim";

/**
 * Lottie / Bodymovin 播放器：吃一个 JSON 素材，按 frame 逐帧 seek，自己不起任何时钟。
 *
 * 为什么它是安全的（方案第 2 节的四问）：
 *   1. 只给 t 就能得到那一帧——lottie-web 的 goToAndStop(帧号) 是绝对 seek，
 *      没有「从 t=0 播到 t」的过程；
 *   2. 第 N 帧不需要前 N-1 帧——每帧都独立算出 lottie 帧号，再整体 seek；
 *   3. 没有 rAF / performance.now / CSS animation——autoplay 是 false，
 *      时间只来自调用方传进来的 frame；
 *   4. 矢量素材放大到 4K 不糊，是本套件里唯一「零 4K 成本」的效果。
 *
 * 关键坑（G6，已踩过）：@remotion/lottie 的 <Lottie> 内部是
 *   <Sequence from={from}> + useCurrentFrame()，
 * 也就是说它读到的是**父时间轴上的帧号**。样板间里父级是 Composition 全局帧
 * （第 7 段是 540~629），如果直接塞进去，第 0 帧就成了 540 帧，
 * getLottieFrame 会把它夹到末帧 → 整段定格，且**不报错**，肉眼只当图标不动。
 *
 * 解法：外面套一层 <Freeze frame={lottieFrame}>。Freeze 会把内部时间轴整体钉在
 * 指定的那一帧上（它自己就是这么给 @remotion/lottie 做 premount 的），
 * 于是 <Lottie> 读到的恒等于我们算出来的 lottie 帧号：
 *   - 不管父级是全局帧、Sequence 内帧、还是 Lab 里直接传的 lf，结果都一样；
 *   - 同一帧渲染多少次都是同一张图（md5 可比）。
 *
 * 用法：
 *   import badge from "../../public/lottie/demo-badge.json";
 *   <Lottie frame={lf} fps={fps} data={badge} from={0.2} width={520} height={520} />
 *
 * 帧率换算：@remotion/lottie 是 1 个 Remotion 帧 = 1 个 lottie 帧（1:1），
 * 素材的 fr 与画面的 fps 不一致时会播快/播慢，所以这里自己按「秒」换算：
 *   lottie 帧 = (场景帧 - 起始帧) / fps × 素材 fr × speed
 * 素材 fr=30、画面 fps=30、speed=1 时就退化成 1:1，和官方行为一致。
 */

export type LottieProps = {
  /** 当前帧（场景内的局部帧，不是全片帧） */
  frame: number;
  fps: number;
  /** Bodymovin / Lottie 的 JSON 对象（import 进来的），不是路径 */
  data: LottieAnimationData;
  /** 第几秒开始播，默认 0；早于它的帧一律停在素材第 0 帧（不闪空） */
  from?: number;
  /** 元素在画面里的宽高（px，按 1920×1080 布局坐标写）；素材按原比例塞进去 */
  width?: number;
  height?: number;
  /** 播完是否从头再来，默认 false；true 时按素材总帧数取模 */
  loop?: boolean;
  /** 播放速度倍率，默认 1（0.5 = 慢一半），不影响确定性 */
  speed?: number;
  /** 元素中心点（px，布局坐标），默认画面正中 */
  x?: number;
  y?: number;
  opacity?: number;
  rotate?: number;
  zIndex?: number;
};

export const Lottie: React.FC<LottieProps> = ({
  frame,
  fps,
  data,
  from = 0,
  width = 512,
  height = 512,
  loop = false,
  speed = 1,
  x = 960,
  y = 540,
  opacity = 1,
  rotate = 0,
  zIndex = 20,
}) => {
  /**
   * 素材总帧数：lottie 只在 [ip, op] 之间播放，op - ip 就是总帧数
   * （lottie-web 的 animation.totalFrames 也是这么算的）。
   */
  const totalFrames = Math.max(1, data.op - (typeof data.ip === "number" ? data.ip : 0));
  // 素材自己的帧率；缺字段时退回画面的 fps（等价于 1:1 播放）
  const assetFr = typeof data.fr === "number" && data.fr > 0 ? data.fr : fps;

  // 全程纯计算：同一帧 → 同一个 lottie 帧号 → 同一张图
  const elapsedSeconds = (frame - from * fps) / fps;
  const rawFrame = elapsedSeconds * assetFr * speed;
  const lottieFrame = loop
    ? ((rawFrame % totalFrames) + totalFrames) % totalFrames // 负数也能绕回 [0, totalFrames)
    : clamp(rawFrame, 0, totalFrames - 1); // 播完停在最后一帧，开播前停在第一帧

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: x - width / 2,
          top: y - height / 2,
          width,
          height,
          opacity,
          zIndex,
          transform: `rotate(${rotate}deg)`,
          transformOrigin: "50% 50%",
        }}
      >
        {/* Freeze 把内部时间钉死在 lottieFrame 上（见文件头的 G6 说明） */}
        <Freeze frame={lottieFrame}>
          <RemotionLottie
            animationData={data}
            renderer="svg"
            style={{ width: "100%", height: "100%" }}
          />
        </Freeze>
      </div>
    </AbsoluteFill>
  );
};
