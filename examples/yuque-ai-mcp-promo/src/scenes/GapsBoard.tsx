import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { slots, text } from "../lib/onscreen";
import { Rich } from "../lib/rich";
import { theme } from "../lib/theme";
import { canvas, pick } from "../lib/canvas";
import { enter } from "../lib/anim";
import type { Scene } from "../lib/timing";

/**
 * 「官方 19 个里没有的」六条，逐条落下。
 * 六条文案全部来自 README_CN 的「与官方对比」表（团队、回收站、上传、统计 / 版本、Diff、跨库复制），
 * 组件里不写死任何一条——漏一条、多一条都该在 timing.json 里看得见。
 */
export const GapsBoard: React.FC<{ sc: Scene; vertical?: boolean }> = ({ sc, vertical = false }) => {
  const on = slots(sc);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = (s: number) => Math.round(s * fps);
  const { W, H, pad } = canvas(vertical);
  const s = <T,>(h: T, v: T) => pick(vertical, h, v);

  const over = enter(frame, 0, "quiet");
  const sub = enter(frame, f(2.6), "body", { fps });
  const items = on.items ?? [];

  return (
    <AbsoluteFill style={{ fontFamily: theme.font, color: theme.ink }}>
      <Backdrop gridIn={0.5} />

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
            display: "grid",
            gridTemplateColumns: vertical ? "1fr" : "1fr 1fr",
            gap: s(18, 26),
            marginTop: s(20, 30),
          }}
        >
          {items.map((it, i) => {
            const e = enter(frame, f(0.3 + i * 0.28), "body", { feel: "spring", fps });
            return (
              <div
                key={it}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 18,
                  padding: s("26px 30px", "34px 36px"),
                  borderRadius: 18,
                  background: theme.bgCard,
                  border: `1px solid ${theme.line}`,
                  boxShadow: theme.shadow,
                  opacity: e.opacity,
                  transform: `translateY(${e.y}px)`,
                }}
              >
                <span
                  style={{
                    flex: "none",
                    width: s(40, 48),
                    height: s(40, 48),
                    borderRadius: "50%",
                    background: theme.accentSoft,
                    border: `2px solid ${theme.accent}`,
                    color: theme.accentInk,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: s(24, 26),
                    fontWeight: 800,
                    lineHeight: 1,
                  }}
                >
                  ✓
                </span>
                <span style={{ fontSize: s(34, 46), fontWeight: 700, lineHeight: 1.35 }}>
                  {it}
                </span>
              </div>
            );
          })}
        </div>

        <div
          style={{
            fontSize: s(28, 30),
            lineHeight: 1.6,
            color: theme.inkSoft,
            opacity: sub.opacity,
            transform: `translateY(${sub.y}px)`,
          }}
        >
          <Rich text={text(on.sub, "sub")} accent={theme.accentInk} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};