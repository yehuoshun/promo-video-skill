import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { slots, text } from "../lib/onscreen";
import { Rich } from "../lib/rich";
import { theme } from "../lib/theme";
import { LightSweep } from "../effects";
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

  // 拍点脉冲：每拍把环顶起来一下，然后衰减
  const pulse = beatAt(frame, fps, BPM, BEAT_OFFSET, 0.6);
  // 慢呼吸：周期 4.2s、幅度 ±0.9%（900px 的环上约 ±8px）。拍点脉冲在两次拍之间会掉到 0，
  // CTA 最后 0.67 秒（14.30s→14.97s）正好落在拍与拍之间的谷底，实测两张静帧只差 0.22，
  // 看着像画死了。加这一层连续的正弦兜底，保证任何两帧都不是同一张画面。
  const breathe = Math.sin((frame / fps / 4.2) * Math.PI * 2) * 0.009;
  const ringScale = 1 + pulse * 0.06 + breathe;
  const ringOp = 0.18 + pulse * 0.22 + breathe * 1.5;

  return (
    <AbsoluteFill style={{ fontFamily: theme.font, color: theme.ink }}>
      <Backdrop breathe={false} />

      {/* 收尾的持续光扫：跨度 3.1s 从 2.8s 一直扫到片尾之外，保证最后几帧还在变。
          片尾 0.67 秒（14.30s→14.97s）的静帧差：加之前 0.21（等于画死了），加之后 12.7。 */}
      <LightSweep
        frame={frame}
        fps={fps}
        start={2.8}
        duration={3.1}
        width={760}
        strength={0.5}
        layer="below"
      />

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
