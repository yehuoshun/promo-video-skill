import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { theme } from "../lib/theme";
import { keys, ramp, shake } from "../lib/anim";

/**
 * 开场：大字砸出。
 * 规矩：第一屏就说清「这是什么」，别等旁白；第一行 0.15s 就动，
 * 强调色只用一处（「一条命令」），别满屏发光。
 */
export const Open: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = (s: number) => s * fps;

  const blockScale = keys(frame, [
    [0, 1.03],
    [f(0.9), 1],
  ]);

  const kickerIn = ramp(frame, 0, 10);
  const lineA = ramp(frame, f(0.15), 14, { from: 46, to: 0 });
  const lineAIn = ramp(frame, f(0.15), 12);
  const lineB = ramp(frame, f(0.6), 14, { from: 46, to: 0 });
  const lineBIn = ramp(frame, f(0.6), 12);
  const subIn = ramp(frame, f(1.7), 14, { from: 24, to: 0 });
  const subOp = ramp(frame, f(1.7), 12);

  // 落地一下轻震，2px 就够，文字别弹跳
  const land = shake(frame, 2.4, 1.6, 3);

  return (
    <AbsoluteFill style={{ fontFamily: theme.font, color: theme.ink }}>
      <Backdrop />

      <AbsoluteFill
        style={{
          padding: "0 132px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          transform: `scale(${blockScale}) translate(${land.x}px, ${land.y}px)`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            opacity: kickerIn,
            fontSize: 18,
            letterSpacing: "0.42em",
            fontWeight: 600,
            color: theme.inkFaint,
          }}
        >
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              background: theme.accent,
              boxShadow: `0 0 18px ${theme.accent}`,
            }}
          />
          YUQUE-IMPORT-SKILL
        </div>

        <div style={{ marginTop: 44 }}>
          <div
            style={{
              fontSize: 104,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              lineHeight: 1.14,
              transform: `translateY(${lineA}px)`,
              opacity: lineAIn,
            }}
          >
            别再<span style={{ color: theme.accent }}>复制粘贴</span>了。
          </div>

          <div
            style={{
              fontSize: 104,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              lineHeight: 1.14,
              transform: `translateY(${lineB}px)`,
              opacity: lineBIn,
            }}
          >
            整个仓库，一条命令。
          </div>
        </div>

        <div
          style={{
            marginTop: 38,
            fontSize: 30,
            lineHeight: 1.7,
            color: theme.inkSoft,
            maxWidth: 1080,
            transform: `translateY(${subIn}px)`,
            opacity: subOp,
          }}
        >
          GitHub 仓库 → 语雀知识库，目录和文件名原样搬过去。
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
