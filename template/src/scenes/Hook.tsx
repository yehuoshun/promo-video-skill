import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { slots, text } from "../lib/onscreen";
import { Rich } from "../lib/rich";
import { theme } from "../lib/theme";
import { enter, keys, shake } from "../lib/anim";
import type { Scene } from "../lib/timing";

/**
 * 开场：大字逐行砸出。
 * 规矩来自 references/节奏.md：
 * - 第一屏就要说清「这是什么」，不等旁白
 * - 第一行 0.15s 就动，别让开场空着
 * - 强调色只用在一处，别满屏发光
 */
export const Hook: React.FC<{ sc: Scene }> = ({ sc }) => {
  const on = slots(sc);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = (s: number) => s * fps;

  // 整块的轻微推入，别做成弹跳（文字弹跳会糊）
  const blockScale = keys(frame, [
    [0, 1.03],
    [f(0.9), 1],
  ]);

  // 入场只准用 anim.ts 的四个角色名（quiet/body/head/stage），别在这里写帧数
  const kicker = enter(frame, 0, "quiet");
  const lineA = enter(frame, f(0.15), "head");
  const lineB = enter(frame, f(0.55), "head");
  const sub = enter(frame, f(1.6), "body");

  // 落地的一下轻震，幅度要小，2px 就够
  const land = shake(frame, 2.2, 1.6, 3);

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
            opacity: kicker.opacity,
            fontSize: 18,
            letterSpacing: "0.42em",
            fontWeight: 600,
            color: theme.inkFaint,
            textTransform: "uppercase",
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
          {text(on.kicker, "kicker")}
        </div>

        <div style={{ marginTop: 46 }}>
          <div
            style={{
              fontSize: 108,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              lineHeight: 1.12,
              transform: `translateY(${lineA.y}px)`,
              opacity: lineA.opacity,
            }}
          >
            <Rich text={text(on.lines?.[0], "lines[0]")} />
          </div>

          <div
            style={{
              fontSize: 108,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              lineHeight: 1.12,
              transform: `translateY(${lineB.y}px)`,
              opacity: lineB.opacity,
            }}
          >
            <Rich text={text(on.lines?.[1], "lines[1]")} />
          </div>
        </div>

        <div
          style={{
            marginTop: 40,
            fontSize: 30,
            lineHeight: 1.7,
            color: theme.inkSoft,
            maxWidth: 1000,
            transform: `translateY(${sub.y}px)`,
            opacity: sub.opacity,
          }}
        >
          <Rich text={text(on.sub, "sub")} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
