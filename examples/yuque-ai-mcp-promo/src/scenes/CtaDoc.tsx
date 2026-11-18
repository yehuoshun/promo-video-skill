import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { slots, text } from "../lib/onscreen";
import { Rich } from "../lib/rich";
import { theme } from "../lib/theme";
import { canvas, pick } from "../lib/canvas";
import { enter, impulse } from "../lib/anim";
import type { Scene } from "../lib/timing";

/**
 * CTA：一句话 + 一张白色地址卡。
 * 停留时间由 timing.json 给（≥4s），这里不加「点赞关注」这类抖动元素。
 */
export const CtaDoc: React.FC<{ sc: Scene; vertical?: boolean }> = ({ sc, vertical = false }) => {
  const on = slots(sc);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = (s: number) => Math.round(s * fps);
  const { W, H, pad } = canvas(vertical);
  const s = <T,>(h: T, v: T) => pick(vertical, h, v);

  const over = enter(frame, 0, "quiet");
  const title = enter(frame, f(0.25), "head", { fps });
  const card = enter(frame, f(0.9), "stage", { feel: "spring", fps });
  const tail = enter(frame, f(1.6), "quiet", { fps });
  const halo = impulse(frame, f(1.0), f(0.9));

  return (
    <AbsoluteFill style={{ fontFamily: theme.font, color: theme.ink }}>
      <Backdrop gridIn={0.3} />

      <AbsoluteFill
        style={{
          width: W,
          height: H,
          padding: `56px ${pad}px 250px`,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: vertical ? "stretch" : "flex-start",
          gap: s(28, 44),
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            opacity: over.opacity,
            fontSize: s(22, 34),
            fontWeight: 700,
            letterSpacing: "0.14em",
            color: theme.accentInk,
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: theme.accent }} />
          {text(on.overline, "overline")}
        </div>

        <div
          style={{
            fontSize: s(96, 62),
            fontWeight: 800,
            letterSpacing: "-0.02em",
            lineHeight: 1.16,
            opacity: title.opacity,
            transform: `translateY(${title.y}px)`,
            maxWidth: s(1500, 940),
          }}
        >
          <Rich text={text(on.title, "title")} accent={theme.accent} />
        </div>

        <div
          style={{
            marginTop: s(18, 24),
            display: "inline-flex",
            alignItems: "center",
            gap: 16,
            padding: s("26px 34px", "30px 34px"),
            borderRadius: 18,
            background: theme.bgCard,
            border: `1px solid ${theme.line}`,
            boxShadow: halo > 0.05 ? `${theme.shadow}, 0 0 ${60 * halo}px ${theme.accentSoft}` : theme.shadow,
            opacity: card.opacity,
            transform: `translateY(${card.y}px)`,
            maxWidth: "100%",
          }}
        >
          <span
            style={{
              flex: "none",
              width: 34,
              height: 34,
              borderRadius: 9,
              background: theme.accentSoft,
              border: `1px solid ${theme.accent}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: theme.accentInk,
              fontSize: 18,
              fontWeight: 800,
            }}
          >
            ↗
          </span>
          <span
            style={{
              fontFamily: theme.mono,
              fontSize: s(32, 40),
              fontWeight: 700,
              letterSpacing: "0.01em",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {text(on.url, "url")}
          </span>
        </div>

        <div
          style={{
            fontFamily: theme.mono,
            fontSize: s(24, 30),
            color: theme.inkSoft,
            opacity: tail.opacity,
            transform: `translateY(${tail.y}px)`,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {text(on.tail, "tail")}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};