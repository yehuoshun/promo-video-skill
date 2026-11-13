import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { slots, text } from "../lib/onscreen";
import { Rich } from "../lib/rich";
import { theme } from "../lib/theme";
import { beatAt, enter, ramp } from "../lib/anim";
import { BPM, BEAT_OFFSET, type Scene } from "../lib/timing";

/**
 * 落点：网址 + 一句话。
 * 规矩：网址停留 ≥3s（这里 4.4s），字号要够大到「手机上也看得清」，
 * 别在这一屏再加第三个信息点。
 */
export const Cta: React.FC<{ sc: Scene }> = ({ sc }) => {
  const on = slots(sc);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = (s: number) => s * fps;

  // 入场只准用 anim.ts 的四个角色名；分隔线是「生长」不是入场，仍用 ramp
  const title = enter(frame, 0, "head", { fps, feel: "spring" });
  const lineW = ramp(frame, f(0.3), 26, { ease: (t) => t });
  const url = enter(frame, f(0.5), "quiet");
  const tail = enter(frame, f(0.9), "quiet");

  const pulse = beatAt(frame, fps, BPM, BEAT_OFFSET, 0.6);
  const ringScale = 1 + pulse * 0.06;
  const ringOp = 0.18 + pulse * 0.22;

  return (
    <AbsoluteFill style={{ fontFamily: theme.font, color: theme.ink }}>
      <Backdrop breathe={false} />

      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 0,
        }}
      >
        {/* 随拍呼吸的光环，压在整个 CTA 后面 */}
        <div
          style={{
            position: "absolute",
            width: 900,
            height: 900,
            borderRadius: "50%",
            border: `1px solid ${theme.accent}`,
            opacity: ringOp,
            transform: `scale(${ringScale})`,
          }}
        />

        <div
          style={{
            fontSize: 30,
            letterSpacing: "0.3em",
            color: theme.inkFaint,
            textTransform: "uppercase",
            opacity: title.opacity,
            transform: `translateY(${title.y}px)`,
          }}
        >
          {text(on.overline, "overline")}
        </div>

        <div
          style={{
            marginTop: 40,
            fontSize: 76,
            fontWeight: 800,
            letterSpacing: "-0.01em",
            opacity: title.opacity,
            transform: `translateY(${title.y}px)`,
          }}
        >
          <Rich text={text(on.title, "title")} />
        </div>

        <div
          style={{
            marginTop: 42,
            height: 3,
            width: `${lineW * 620}px`,
            background: `linear-gradient(90deg, transparent, ${theme.accent}, transparent)`,
            opacity: 0.8,
          }}
        />

        <div
          style={{
            marginTop: 44,
            fontFamily: theme.mono,
            fontSize: 44,
            letterSpacing: "0.02em",
            color: theme.ink,
            opacity: url.opacity,
          }}
        >
          {text(on.url, "url")}
        </div>

        <div
          style={{
            marginTop: 26,
            fontSize: 24,
            color: theme.inkFaint,
            opacity: tail.opacity,
          }}
        >
          {text(on.tail, "tail")}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
