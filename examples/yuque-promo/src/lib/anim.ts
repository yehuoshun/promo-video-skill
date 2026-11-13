/**
 * 全部是「帧 → 值」的纯函数，没有任何状态、没有 requestAnimationFrame、没有 CSS transition。
 *
 * 原因：Remotion 逐帧确定性渲染，同一帧必须永远算出同一个结果。
 * 想加新效果，先写成这里的函数，再在组件里用；不要引入会自己跑的动画库
 * （除了官方适配层 @remotion/three、@remotion/lottie、@remotion/rive）。
 */

export const clamp = (v: number, lo = 0, hi = 1): number => Math.min(hi, Math.max(lo, v));

export type Ease = (t: number) => number;

export const linear: Ease = (t) => t;

export const easeOutCubic: Ease = (t) => 1 - Math.pow(1 - t, 3);

export const easeInOutCubic: Ease = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export const easeOutExpo: Ease = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

/** 带一点回弹，适合卡片/按钮入场，注意别用在文字上（会糊） */
export const easeOutBack: Ease = (t) => {
  const s = 1.70158;
  return 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
};

type RampOpts = { from?: number; to?: number; ease?: Ease };

/**
 * 线性推进：从 start 帧开始、持续 dur 帧，值从 from 走到 to。
 * 最基础的一个，80% 的动效都是它。
 */
export function ramp(frame: number, start: number, dur: number, opts: RampOpts = {}): number {
  const { from = 0, to = 1, ease = easeOutCubic } = opts;
  if (dur <= 0) return frame >= start ? to : from;
  const p = clamp((frame - start) / dur);
  return from + (to - from) * ease(p);
}

/** 关键帧插值：keys(frame, [[0, 0], [30, 120], [60, 120]]) */
export function keys(
  frame: number,
  points: ReadonlyArray<readonly [number, number]>,
  ease: Ease = easeInOutCubic,
): number {
  if (points.length === 0) return 0;
  if (frame <= points[0][0]) return points[0][1];
  const last = points[points.length - 1];
  if (frame >= last[0]) return last[1];
  for (let i = 1; i < points.length; i++) {
    const [f1, v1] = points[i];
    if (frame <= f1) {
      const [f0, v0] = points[i - 1];
      const p = f1 === f0 ? 1 : (frame - f0) / (f1 - f0);
      return v0 + (v1 - v0) * ease(p);
    }
  }
  return last[1];
}

/**
 * 脉冲：在 at 帧瞬间到 1，然后 dur 帧内衰减回 0。
 * 用于打击点、闪光、卡片「弹一下」。
 */
export function impulse(frame: number, at: number, dur: number, ease: Ease = easeOutExpo): number {
  if (frame < at || dur <= 0) return 0;
  const p = clamp((frame - at) / dur);
  return 1 - ease(p);
}

/**
 * 抖动：确定性伪随机（正弦叠加，不用 Math.random，否则每帧不一样）。
 * 返回可直接用在 transform 上的偏移。
 */
export function shake(
  frame: number,
  amp = 6,
  speed = 1,
  seed = 0,
): { x: number; y: number; rotate: number } {
  const t = frame * speed;
  const n = (k: number) => Math.sin(t * k + seed * 12.9898) * 0.6 + Math.sin(t * k * 2.7 + seed) * 0.4;
  return { x: n(1.13) * amp, y: n(0.79) * amp * 0.6, rotate: n(1.41) * amp * 0.06 };
}

/**
 * 打字机：按 cps（每秒几个字）吐出前 n 个字。
 * 中文按字符算，英文按字符算——够用，不要按单词。
 */
export function typed(
  text: string,
  frame: number,
  opts: { cps?: number; start?: number; fps?: number } = {},
): string {
  const { cps = 18, start = 0, fps = 30 } = opts;
  const n = Math.floor(Math.max(0, frame - start) / fps * cps);
  return text.slice(0, Math.max(0, Math.min(text.length, n)));
}

/**
 * 节拍脉冲：每一拍从 1 衰减到 0，用来让画面随音乐「呼吸」。
 * bpm/offset 来自 timing.json 的 beats 字段。
 */
export function beatAt(
  frame: number,
  fps: number,
  bpm: number,
  offset = 0,
  decay = 0.55,
): number {
  const beatFrames = (60 / bpm) * fps;
  const t = (frame - offset * fps) % beatFrames;
  const phase = (t < 0 ? t + beatFrames : t) / beatFrames;
  return Math.pow(Math.max(0, 1 - phase), 1 / decay);
}
