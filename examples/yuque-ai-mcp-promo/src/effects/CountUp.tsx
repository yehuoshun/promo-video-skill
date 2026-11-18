import React from "react";
import { keys, easeOutCubic, type Ease } from "../lib/anim";

export type CountUpProps = {
  frame: number;
  fps: number;
  /** 目标数字 */
  value: number;
  /** 第几秒开始滚 */
  start?: number;
  /** 滚多少秒 */
  duration?: number;
  /** 缓动，默认 easeOutCubic（前快后慢）；要「整段每一帧都在动」的演示可传 easeInOutCubic */
  ease?: Ease;
  decimals?: number;
  /** 千分位逗号 */
  group?: boolean;
  prefix?: string;
  suffix?: string;
  size?: number;
  color?: string;
  /** 滚完瞬间弹一下的强度，0 关闭 */
  pop?: number;
};

const fmt = (n: number, decimals: number, group: boolean): string => {
  const fixed = n.toFixed(decimals);
  if (!group) return fixed;
  const [int, dec] = fixed.split(".");
  const withComma = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return dec ? `${withComma}.${dec}` : withComma;
};

/**
 * 数字滚动：从 0 涨到目标值，滚完轻轻弹一下。
 * 「数字涨 = 规模 / 性能 / 覆盖」，这是数据类卖点最省事的表达。
 *
 * 关键在两点：tabular-nums（否则宽度变化会让整行字抖），
 * 以及用 keys() 而不是线性——线性看起来像秒表。
 */
export const CountUp: React.FC<CountUpProps> = ({
  frame,
  fps,
  value,
  start = 0,
  duration = 1.1,
  ease = easeOutCubic,
  decimals = 0,
  group = true,
  prefix = "",
  suffix = "",
  size = 96,
  color,
  pop = 0.03,
}) => {
  const at = start * fps;
  const dur = duration * fps;
  const n = keys(
    frame,
    [
      [at, 0],
      [at + dur, value],
    ],
    ease,
  );

  // 滚完的那一下：先弹大一点点，再回到 1
  const done = at + dur;
  const t = (frame - done) / 8;
  const bounce = t > 0 && t < 1 ? Math.sin(t * Math.PI) * pop : 0;

  return (
    <span
      style={{
        display: "inline-block",
        fontSize: size,
        fontWeight: 800,
        letterSpacing: "-0.03em",
        fontVariantNumeric: "tabular-nums",
        color,
        transform: `scale(${1 + bounce})`,
        transformOrigin: "left bottom",
      }}
    >
      {prefix}
      {fmt(n, decimals, group)}
      {suffix}
    </span>
  );
};
