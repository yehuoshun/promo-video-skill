/**
 * flubber 0.4.2 的本地类型声明。
 *
 * 为什么自己写：flubber 包里不带类型（package.json 没有 types/typings 字段）。
 * npm 上另有社区包 @types/flubber@0.4.0；这里仍然用本地声明，因为这份是照
 * **源码逐字核过的**（interpolate.js 的 `{maxSegmentLength = 10, string = true}`、
 * multiple.js 的 separate/combine/interpolateAll 的 `{..., single = false}`、
 * shape.js 的 fromCircle/toCircle/fromRect/toRect 参数顺序），
 * 只声明本项目真正用到的函数，也不再额外增加一个 devDependency。
 *
 * 若将来要换成社区类型：`npm i -D @types/flubber` 并删掉本文件——
 * 两份声明会重名冲突，不能共存。
 *
 * 只写声明、不写实现；参数名与官方源码保持一致，别在这里偷偷改成别的约定。
 */
declare module "flubber" {
  export interface InterpolateOptions {
    /**
     * 曲线按多长一段拆成折线，单位是形状自身的坐标。
     * 默认 10：在 0~100 的 viewBox 里等于 10% 的粒度，放大后能看出棱。
     * 本项目默认传 0.35 换平滑度（只在 useMemo 里算一次，不影响逐帧性能）。
     */
    maxSegmentLength?: number;
    /** true（默认）返回 path 的 d 字符串；false 返回点数组 [[x, y], ...] */
    string?: boolean;
  }

  /** separate / combine / interpolateAll 在 interpolate 选项之外还多一个 single */
  export interface SeparateOptions extends InterpolateOptions {
    /**
     * true 时把多个环合并成一条 path 字符串（返回单个插值函数）；
     * false（默认）逐环返回插值函数数组。
     */
    single?: boolean;
  }

  /** f(t) → path d；t 会被 flubber 自己截到 0~1，但我们仍建议先 clamp */
  export type ShapeInterpolator = (t: number) => string;

  /**
   * 两个形状之间插值（本项目只用这一个）。
   * 纯函数：同一个 t 永远返回同一条 path，所以能逐帧调用而不破坏「同帧同图」。
   */
  export function interpolate(
    fromShape: string,
    toShape: string,
    options?: InterpolateOptions,
  ): ShapeInterpolator;

  /** 一个形状拆成多个环后，分别插值到一组目标形状 */
  export function separate(
    fromShape: string,
    toShapes: string[],
    options: SeparateOptions & { single: true },
  ): ShapeInterpolator;
  export function separate(
    fromShape: string,
    toShapes: string[],
    options?: SeparateOptions,
  ): ShapeInterpolator[];

  /** separate 的反向版：一组起点形状合成一个终点形状 */
  export function combine(
    fromShapes: string[],
    toShape: string,
    options: SeparateOptions & { single: true },
  ): ShapeInterpolator;
  export function combine(
    fromShapes: string[],
    toShape: string,
    options?: SeparateOptions,
  ): ShapeInterpolator[];

  /** 一一对应的多形状并行插值（两个数组长度必须相同） */
  export function interpolateAll(
    fromShapes: string[],
    toShapes: string[],
    options: SeparateOptions & { single: true },
  ): ShapeInterpolator;
  export function interpolateAll(
    fromShapes: string[],
    toShapes: string[],
    options?: SeparateOptions,
  ): ShapeInterpolator[];

  /** 把一条多环的 path 字符串拆成若干条单环 path 字符串 */
  export function splitPathString(str: string): string[];

  /** 点集 → path 字符串（"M x,y L x,y ... Z"） */
  export function toPathString(ring: [number, number][]): string;

  /** 从圆插值到任意形状（圆心 + 半径） */
  export function fromCircle(
    x: number,
    y: number,
    radius: number,
    toShape: string,
    options?: InterpolateOptions,
  ): ShapeInterpolator;

  /** 从任意形状插值到圆 */
  export function toCircle(
    fromShape: string,
    x: number,
    y: number,
    radius: number,
    options?: InterpolateOptions,
  ): ShapeInterpolator;

  /** 从矩形插值到任意形状（左上角 + 宽高） */
  export function fromRect(
    x: number,
    y: number,
    width: number,
    height: number,
    toShape: string,
    options?: InterpolateOptions,
  ): ShapeInterpolator;

  /** 从任意形状插值到矩形 */
  export function toRect(
    fromShape: string,
    x: number,
    y: number,
    width: number,
    height: number,
    options?: InterpolateOptions,
  ): ShapeInterpolator;
}
