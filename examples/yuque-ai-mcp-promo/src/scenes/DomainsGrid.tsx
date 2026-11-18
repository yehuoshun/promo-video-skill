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
 * 13 个域 × 各自工具数，逐张点亮。
 *
 * 需要浏览器会话 Cookie 的四个域（web_doc / mine / recycle / upload）用绿框区分，
 * 另有一个 Cookie 工具 web_search 在 search 域里——所以图例只能写「这些域里主要是」，
 * 不能写「绿框 = 全部 Cookie 工具」（20 个里 1 个在 search 域）。
 */
const COOKIE_DOMAINS = new Set(["web_doc", "mine", "recycle", "upload"]);

export const DomainsGrid: React.FC<{ sc: Scene; vertical?: boolean }> = ({
  sc,
  vertical = false,
}) => {
  const on = slots(sc);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = (s: number) => Math.round(s * fps);
  const { W, H, pad } = canvas(vertical);
  const s = <T,>(h: T, v: T) => pick(vertical, h, v);

  const over = enter(frame, 0, "quiet");
  const sub = enter(frame, f(2.4), "body", { fps });
  const legend = enter(frame, f(2.8), "quiet", { fps });

  const pairs = on.pairs ?? [];

  return (
    <AbsoluteFill style={{ fontFamily: theme.font, color: theme.ink }}>
      <Backdrop gridIn={0.4} />

      <AbsoluteFill
        style={{
          width: W,
          height: H,
          padding: vertical ? `110px ${pad}px 280px` : `56px ${pad}px 250px`,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div style={{ opacity: over.opacity }}>
          <div
            style={{
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
              marginTop: 10,
              fontSize: s(68, 60),
              fontWeight: 800,
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
            }}
          >
            <Rich text={text(on.title, "title")} accent={theme.accentInk} />
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: vertical ? "repeat(2, 1fr)" : "repeat(7, 1fr)",
            gap: s(16, 18),
            marginTop: s(24, 30),
          }}
        >
          {pairs.map((p, i) => {
            const e = enter(frame, f(0.25 + i * 0.13), "body", { feel: "spring", fps });
            const cookie = COOKIE_DOMAINS.has(p.k);
            return (
              <div
                key={p.k}
                style={{
                  padding: s("22px 20px", "26px 24px"),
                  borderRadius: 16,
                  background: theme.bgCard,
                  border: `1px solid ${cookie ? theme.accent : theme.line}`,
                  boxShadow: cookie ? `0 0 0 3px ${theme.accentSoft}` : "none",
                  opacity: e.opacity,
                  transform: `translateY(${e.y}px)`,
                }}
              >
                <div
                  style={{
                    fontFamily: theme.mono,
                    fontSize: s(20, 22),
                    fontWeight: 700,
                    color: theme.inkSoft,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {p.k}
                </div>
                <div
                  style={{
                    fontFamily: theme.mono,
                    fontSize: s(52, 56),
                    fontWeight: 800,
                    lineHeight: 1.14,
                    color: cookie ? theme.accent : theme.ink,
                  }}
                >
                  {p.v}
                </div>
              </div>
            );
          })}
        </div>

        <div>
          <div
            style={{
              fontSize: s(32, 34),
              lineHeight: 1.6,
              color: theme.inkSoft,
              opacity: sub.opacity,
              transform: `translateY(${sub.y}px)`,
              maxWidth: s(1500, 940),
            }}
          >
            <Rich text={text(on.sub, "sub")} accent={theme.accentInk} />
          </div>
          <div
            style={{
              marginTop: 12,
              fontFamily: theme.mono,
              fontSize: s(22, 24),
              color: theme.inkSoft,
              opacity: legend.opacity,
            }}
          >
            绿框 = 主要靠浏览器会话的四个域（另有一个 web_search 在 search 域里）
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};