import React from "react";
import { AbsoluteFill } from "remotion";
import { ramp } from "../lib/anim";
import { theme } from "../lib/theme";

export type BigTypeLine = { text: string; accent?: boolean };

export type BigTypeProps = {
  frame: number;
  fps: number;
  lines: BigTypeLine[];
  /** 第几秒开始入 */
  from?: number;
  size?: number;
  lineHeight?: number;
  /** 行间延迟（秒） */
  stagger?: number;
  /** slam = 砸下来（有位移和轻微缩放）；mask = 从右往左擦出（更冷静） */
  mode?: "slam" | "mask";
  align?: "left" | "center";
  /** 上面那行小字 */
  kicker?: string;
  /** 下面那行小字 */
  sub?: string;
};

/**
 * 动态大字：一行行砸出来。全片最常用的「钩子」组件。
 * 规矩（见 references/节奏.md）：标题+卡片停留 ≥3.5s，所以字出来之后别急着走。
 */
export const BigType: React.FC<BigTypeProps> = ({
  frame,
  fps,
  lines,
  from = 0,
  size = 112,
  lineHeight = 1.12,
  stagger = 0.16,
  mode = "slam",
  align = "left",
  kicker,
  sub,
}) => {
  const base = from * fps;
  const kickerOp = ramp(frame, base - 0.25 * fps, 12);

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: align === "center" ? "center" : "flex-start",
        padding: "0 150px",
        fontFamily: theme.font,
        color: theme.ink,
        textAlign: align,
      }}
    >
      {kicker ? (
        <div
          style={{
            fontSize: 22,
            letterSpacing: "0.34em",
            color: theme.inkFaint,
            fontFamily: theme.mono,
            marginBottom: 26,
            opacity: kickerOp,
          }}
        >
          {kicker}
        </div>
      ) : null}

      {lines.map((line, i) => {
        const at = base + i * stagger * fps;
        const opacity = ramp(frame, at, 10);
        const p = ramp(frame, at, mode === "mask" ? 22 : 15);
        const y = mode === "slam" ? (1 - p) * 44 : 0;
        const scale = mode === "slam" ? 1 + (1 - p) * 0.06 : 1;
        const clip = mode === "mask" ? `inset(0 ${(1 - p) * 100}% 0 0)` : undefined;

        return (
          <div
            key={i}
            style={{
              fontSize: size,
              fontWeight: 800,
              lineHeight,
              letterSpacing: "-0.02em",
              color: line.accent ? theme.accent : theme.ink,
              opacity,
              transform: `translateY(${y}px) scale(${scale})`,
              clipPath: clip,
              transformOrigin: align === "center" ? "center" : "left center",
            }}
          >
            {line.text}
          </div>
        );
      })}

      {sub ? (
        <div
          style={{
            marginTop: 34,
            fontSize: 30,
            color: theme.inkSoft,
            opacity: ramp(frame, base + lines.length * stagger * fps, 16, { from: 0, to: 1 }),
            transform: `translateY(${ramp(frame, base + lines.length * stagger * fps, 16, { from: 18, to: 0 })}px)`,
          }}
        >
          {sub}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
