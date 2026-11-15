/**
 * 确定性伪随机。
 *
 * Remotion 逐帧渲染：同一帧必须永远渲染出同一张图，所以效果里不能用 Math.random()——
 * 那会让每帧都不一样，而且两次渲染结果对不上（返工时无法复现）。
 * 这里的函数全部是「seed → 值」的纯函数，丢帧、跳帧、多进程渲染都不变。
 */

export const rand = (seed: number): number => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export const randRange = (seed: number, min: number, max: number): number =>
  min + rand(seed) * (max - min);

/**
 * 每 every 帧换一次值。
 * 颗粒、闪烁这类效果如果逐帧随机，看起来像雪花屏；按 2~3 帧跳一次更像胶片。
 */
export const flicker = (frame: number, seed: number, every = 2): number =>
  rand(Math.floor(frame / every) * 7919 + seed);
