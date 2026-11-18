import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { slots, text } from "../lib/onscreen";
import { Rich } from "../lib/rich";
import { theme } from "../lib/theme";
import { canvas, pick } from "../lib/canvas";
import { enter, keys } from "../lib/anim";
import type { Scene } from "../lib/timing";

/**
 * 真实截图位：一张真截图放进浏览器卡里，缓慢上推。
 *
 * 为什么不用整张缩小塞进去：1920 宽的截图缩到 900 宽，字就没了。
 * 这里让卡片裁切、图片只推不缩（scale 固定 1），保证 4K 下也是清晰的。
 */
export const ShotFrame: React.FC<{ sc: Scene; vertical?: boolean }> = ({ sc, vertical = false }) => {
  const on = slots(sc);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = (s: number) => Math.round(s * fps);
  const { W, H, pad } = canvas(vertical);
  const s = <T,>(h: T, v: T) => pick(vertical, h, v);

  const kicker = enter(frame, 0, "quiet");
  const card = enter(frame, f(0.2), "stage", { feel: "spring", fps });
  const cap = enter(frame, f(1.2), "body", { fps });

  // 整段 10.8 秒里只推 90px：够看出「在动」，又不会让人晕
  const push = keys(frame, [
    [0, 0],
    [f(10.8), -s(90, 70)],
  ]);

  return (
    <AbsoluteFill style={{ fontFamily: theme.font, color: theme.ink }}>
      <Backdrop gridIn={0.6} />

      <AbsoluteFill
        style={{
          width: W,
          height: H,
          padding: vertical ? `110px ${pad}px 240px` : `56px ${pad}px 240px`,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: s(26, 30),
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            opacity: kicker.opacity,
            fontSize: s(20, 22),
            fontWeight: 700,
            letterSpacing: "0.14em",
            color: theme.accentInk,
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: theme.accent }} />
          {text(on.kicker, "kicker")}
        </div>

        {/* 浏览器卡：顶栏 + 裁切视口 */}
        <div
          style={{
            borderRadius: 20,
            overflow: "hidden",
            background: theme.bgCard,
            border: `1px solid ${theme.line}`,
            boxShadow: theme.shadow,
            opacity: card.opacity,
            transform: `translateY(${card.y}px)`,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "16px 22px",
              borderBottom: `1px solid ${theme.line}`,
              background: theme.bgDeep,
            }}
          >
            {["#f0b3b3", "#f2d8a8", "#b6dcc0"].map((c) => (
              <span key={c} style={{ width: 12, height: 12, borderRadius: "50%", background: c }} />
            ))}
            <div
              style={{
                marginLeft: 14,
                flex: 1,
                padding: "8px 16px",
                borderRadius: 8,
                background: theme.bgCard,
                border: `1px solid ${theme.line}`,
                fontFamily: theme.mono,
                fontSize: s(18, 18),
                color: theme.inkSoft,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {text(on.url, "url")}
            </div>
          </div>

          <div
            style={{
              height: s(600, 980),
              overflow: "hidden",
              position: "relative",
              background: theme.bgCard,
            }}
          >
            <Img
              src={staticFile("gh-tools-cn.png")}
              style={{
                width: "100%",
                display: "block",
                transform: `translateY(${push}px)`,
              }}
            />
          </div>
        </div>

        <div
          style={{
            fontSize: s(30, 34),
            lineHeight: 1.55,
            color: theme.inkSoft,
            opacity: cap.opacity,
            transform: `translateY(${cap.y}px)`,
          }}
        >
          <Rich text={text(on.caption, "caption")} accent={theme.accentInk} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};