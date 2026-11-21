/**
 * effect kit：八个「帧 → 画面」的组件。
 *
 * 共同约定：
 *   1. 每个组件都接收 `frame`（场景内局部帧）和 `fps`，内部不读 useCurrentFrame，
 *      这样既能嵌进 Sequence，也能在 Lab 里并排比较；
 *   2. 不引入会自己跑的动画库——所有变化都能由 frame 精确算出；
 *   3. 颜色只从 lib/theme 取，别在组件里写死色值；
 *   4. 要外部素材的（Lottie）把素材放 public/lottie/，并且在组件里做「按帧 seek」，
 *      不要让它自己跑时间轴。
 */
export { rand, randRange, flicker } from "./rand";
export { GradientMesh } from "./GradientMesh";
export type { GradientMeshProps } from "./GradientMesh";
export { FilmLook } from "./FilmLook";
export type { FilmLookProps } from "./FilmLook";
export { LightSweep } from "./LightSweep";
export type { LightSweepProps } from "./LightSweep";
export { BigType } from "./BigType";
export type { BigTypeProps, BigTypeLine } from "./BigType";
export { CountUp } from "./CountUp";
export type { CountUpProps } from "./CountUp";
export { IsometricCards } from "./IsometricCards";
export type { IsometricCardsProps, IsoCard } from "./IsometricCards";
export { Lottie } from "./Lottie";
export type { LottieProps } from "./Lottie";
export { Morph } from "./Morph";
export type { MorphProps } from "./Morph";
export { FlipCascade, conveyor, cells } from "./FlipCascade";
export type { FlipCascadeProps, Cell } from "./FlipCascade";
