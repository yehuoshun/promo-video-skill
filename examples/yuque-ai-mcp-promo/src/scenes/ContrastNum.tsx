import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { slots, stats, text } from "../lib/onscreen";
import { Rich } from "../lib/rich";
import { theme } from "../lib/theme";
import { canvas, pick } from "../lib/canvas";
import { enter, impulse } from "../lib/anim";
import type { Scene } from "../lib/timing";

/**
 * 数字对比：官方 19 个 → 这里 65 个。
 *
 * 数字来自 timing.json 的 stats（不是手写在组件里），
 * 所以 `check_publish.py` 的「文案数字与 timing.json 对账」才是真对账。
 * 19 用灰色、65 用绿色：别把官方那段染成红色当靶子打，那是骂人不是对比。
 */
export const ContrastNum: React.FC<{ sc: Scene; vertical?: boolean }> = ({ sc, vertical = false }) => {
  const on = slots(sc);
  const pair = stats(sc);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = (s: number) => Math.round(s * fps);
  const { W, H, pad } = canvas(vertical);
  const s = <T,>(h: T, v: T) => pick(vertical, h, v);

  const over = enter(frame, 0, "quiet");
  const left = enter(frame, f(0.2), "stage", { feel: "spring", fps });
  const right = enter(frame, f(1.0), "stage", { feel: "spring", fps });
  const arrow = enter(frame, f(0.7), "body", { fps });
  const sub = enter(frame, f(1.8), "body", { fps });

  // 65 落地的一下：只给绿色一侧一道一次性高光，别整屏闪
  const flash = impulse(frame, f(1.35), f(0.45));

  const Block: React.FC<{
    label: string;
    value: number;
    unit?: string;
    hint?: string;
    color: string;
    bg: string;
    border: string;
    p: { y: number; opacity: number };
  }> = ({ label, value, unit, hint, color, bg, border, p }) => (
    <div
      style={{
        flex: 1,
        padding: s("40px 44px", "46px 44px"),
        borderRadius: 26,
        background: bg,
        border: `1px solid ${border}`,
        opacity: p.opacity,
        transform: `translateY(${p.y}px)`,
        boxShadow: bg === theme.bgCard ? theme.shadow : "none",
      }}
    >
      <div
        style={{
          fontFamily: theme.mono,
          fontSize: s(20, 22),
          letterSpacing: "0.06em",
          color: theme.inkFaint,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {label}
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginTop: 6 }}>
        <span
          style={{
            fontFamily: theme.mono,
            fontSize: s(200, 190),
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: "-0.04em",
            color,
          }}
        >
          {value}
        </span>
        {unit ? (
          <span style={{ fontSize: s(28, 30), color: theme.inkSoft, paddingBottom: 18 }}>{unit}</span>
        ) : null}
      </div>

      {hint ? (
        <div style={{ fontSize: s(20, 22), color: theme.inkFaint, marginTop: 4 }}>{hint}</div>
      ) : null}
    </div>
  );

  return (
    <AbsoluteFill style={{ fontFamily: theme.font, color: theme.ink }}>
      <Backdrop />

      <AbsoluteFill
        style={{
          width: W,
          height: H,
          padding: `56px ${pad}px 250px`,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            opacity: over.opacity,
            fontSize: s(24, 26),
            fontWeight: 700,
            letterSpacing: "0.14em",
            color: theme.accentInk,
          }}
        >
          {text(on.overline, "overline")}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: vertical ? "column" : "row",
            alignItems: "center",
            gap: s(28, 26),
            marginTop: s(20, 40),
          }}
        >
          <Block
            label={pair[0]?.label ?? ""}
            value={pair[0]?.value ?? 0}
            unit={pair[0]?.unit}
            hint={pair[0]?.hint}
            color={theme.muted}
            bg={theme.mutedSoft}
            border={theme.line}
            p={left}
          />

          <div
            style={{
              opacity: arrow.opacity,
              transform: `translateY(${arrow.y}px)`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              minWidth: s(120, 80),
            }}
          >
            <div
              style={{
                fontSize: s(64, 60),
                lineHeight: 1,
                color: theme.accent,
                transform: vertical ? "rotate(90deg)" : "none",
              }}
            >
              →
            </div>
            <div style={{ fontFamily: theme.mono, fontSize: s(18, 18), color: theme.inkFaint }}>
              同一个语雀
            </div>
          </div>

          <div
            style={{
              flex: 1,
              position: "relative",
              display: "flex",
              boxShadow: flash > 0.02 ? `0 0 ${40 * flash}px ${theme.accentSoft}` : undefined,
              borderRadius: 26,
              width: vertical ? "100%" : undefined,
            }}
          >
            <Block
              label={pair[1]?.label ?? ""}
              value={pair[1]?.value ?? 0}
              unit={pair[1]?.unit}
              hint={pair[1]?.hint}
              color={theme.accent}
              bg={theme.bgCard}
              border={theme.accent}
              p={right}
            />
          </div>
        </div>

        <div
          style={{
            fontSize: s(34, 36),
            lineHeight: 1.6,
            color: theme.inkSoft,
            opacity: sub.opacity,
            transform: `translateY(${sub.y}px)`,
            maxWidth: s(1400, 940),
          }}
        >
          <Rich text={text(on.sub, "sub")} accent={theme.accentInk} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};