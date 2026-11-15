import React from "react";
import { AbsoluteFill } from "remotion";
import { easeInOutCubic } from "../lib/anim";

export type LightSweepProps = {
  frame: number;
  fps: number;
  /** 第几秒开始扫 */
  start: number;
  /** 扫完用多少秒 */
  duration?: number;
  angle?: number;
  /** 光带宽（px，按 1080p 坐标） */
  width?: number;
  color?: string;
  strength?: number;
  /** above = 压在所有内容上（转场/品牌登场）；below = 垫在内容下面（背景流光） */
  layer?: "above" | "below";
};

/**
 * 光扫：一条斜向亮带从左侧掠过画面，两端淡出、中间最亮。
 * 用途：品牌名出现、场景切换、按钮被「点亮」的瞬间。
 * 注意：只在窗口内渲染（窗口外返回 null），不要一直挂着——会白吃 GPU。
 */
export const LightSweep: React.FC<LightSweepProps> = ({
  frame,
  fps,
  start,
  duration = 0.9,
  angle = 18,
  width = 620,
  color = "rgba(255,255,255,0.92)",
  strength = 1,
  layer = "above",
}) => {
  const from = start * fps;
  const total = duration * fps;
  const p = (frame - from) / total;
  if (p < 0 || p > 1) return null;

  const x = -45 + easeInOutCubic(p) * 190;
  const opacity = Math.sin(p * Math.PI) * 0.55 * strength;

  return (
    <AbsoluteFill style={{ pointerEvents: "none", overflow: "hidden", zIndex: layer === "above" ? 20 : 0 }}>
      <div
        style={{
          position: "absolute",
          top: "-20%",
          left: `${x}%`,
          width,
          height: "140%",
          transform: `rotate(${angle}deg)`,
          background: `linear-gradient(90deg, transparent 0%, ${color} 50%, transparent 100%)`,
          filter: "blur(26px)",
          opacity,
        }}
      />
    </AbsoluteFill>
  );
};
