import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { slots, text } from "../lib/onscreen";
import { Rich } from "../lib/rich";
import { theme } from "../lib/theme";
import { canvas, pick } from "../lib/canvas";
import { enter, ramp } from "../lib/anim";
import type { Scene } from "../lib/timing";

/**
 * 开场（痛点）：一张「语雀文档卡」和一张「AI 对话卡」隔着一段距离，
 * 中间只有一条虚线，标着 Ctrl+C / Ctrl+V。
 *
 * 两张卡都是**版式示意图**，不是产品截图——所以里面刻意只放色块和一句话，
 * 不放任何像 UI 截图的细节（真截图在 showcase-01 里）。
 */

const DocCard: React.FC<{ w: number | string; n: number; frame: number; fps: number }> = ({
  w,
  n,
  frame,
  fps,
}) => {
  const p = enter(frame, Math.round(0.15 * fps), "stage", { feel: "spring", fps });
  return (
    <div
      style={{
        width: w,
        padding: 34,
        borderRadius: 22,
        background: theme.bgCard,
        border: `1px solid ${theme.line}`,
        boxShadow: theme.shadow,
        opacity: p.opacity,
        transform: `translateY(${p.y}px)`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 12, height: 12, borderRadius: 4, background: theme.accent }} />
        <span style={{ fontSize: 24, fontWeight: 700, color: theme.ink }}>语雀 · 知识库</span>
        <span style={{ marginLeft: "auto", fontSize: 20, color: theme.inkFaint }}>12 篇</span>
      </div>

      <div style={{ marginTop: 26, fontSize: 30, fontWeight: 700, color: theme.ink }}>
        产品需求 · v2
      </div>

      {[0, 1, 2].map((i) => {
        const q = ramp(frame, Math.round((0.4 + i * 0.18) * fps), Math.round(0.4 * fps), {
          from: 0,
          to: 1,
        });
        return (
          <div
            key={i}
            style={{
              marginTop: 20,
              height: 14,
              width: `${(0.92 - i * 0.16) * 100}%`,
              borderRadius: 7,
              background: theme.mutedSoft,
              transform: `scaleX(${q})`,
              transformOrigin: "left center",
            }}
          />
        );
      })}

      <div style={{ marginTop: 26, fontSize: 20, color: theme.inkFaint }}>
        团队知识库 / 产品组 · {n} 次编辑
      </div>
    </div>
  );
};

const ChatCard: React.FC<{ w: number | string; frame: number; fps: number }> = ({ w, frame, fps }) => {
  const p = enter(frame, Math.round(0.55 * fps), "stage", { feel: "spring", fps });
  const b1 = enter(frame, Math.round(1.0 * fps), "body", { fps });
  const b2 = enter(frame, Math.round(1.45 * fps), "body", { fps });

  return (
    <div
      style={{
        width: w,
        padding: 34,
        borderRadius: 22,
        background: theme.bgCard,
        border: `1px solid ${theme.line}`,
        boxShadow: theme.shadow,
        opacity: p.opacity,
        transform: `translateY(${p.y}px)`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span
          style={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: theme.muted,
          }}
        />
        <span style={{ fontSize: 24, fontWeight: 700, color: theme.ink }}>AI 对话</span>
      </div>

      <div
        style={{
          marginTop: 26,
          marginLeft: "auto",
          width: "78%",
          padding: "18px 22px",
          borderRadius: "18px 18px 4px 18px",
          background: theme.bgDeep,
          color: theme.ink,
          fontSize: 24,
          lineHeight: 1.45,
          opacity: b1.opacity,
          transform: `translateY(${b1.y}px)`,
        }}
      >
        把这篇文章整理成周报
      </div>

      <div
        style={{
          marginTop: 18,
          width: "86%",
          padding: "18px 22px",
          borderRadius: "18px 18px 18px 4px",
          border: `1px dashed ${theme.lineStrong}`,
          color: theme.inkSoft,
          fontSize: 24,
          lineHeight: 1.45,
          opacity: b2.opacity,
          transform: `translateY(${b2.y}px)`,
        }}
      >
        我读不到你的语雀。请粘贴给我。
      </div>
    </div>
  );
};

export const HookDoc: React.FC<{ sc: Scene; vertical?: boolean }> = ({ sc, vertical = false }) => {
  const on = slots(sc);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = (s: number) => Math.round(s * fps);
  const { W, H, pad } = canvas(vertical);
  const s = <T,>(h: T, v: T) => pick(vertical, h, v);

  const kicker = enter(frame, 0, "quiet");
  const lineA = enter(frame, f(1.5), "head", { fps });
  const lineB = enter(frame, f(1.85), "head", { fps });
  const sub = enter(frame, f(2.4), "body", { fps });

  // 中间那条虚线：从无到有「拉」出来，表示这条路是手动的
  const thread = ramp(frame, f(0.8), f(0.6));

  const cardW = s(360, 460);
  const gap = s(96, 44);

  const cards = (dir: "row" | "column") => (
    <div
      style={{
        display: "flex",
        flexDirection: dir,
        alignItems: dir === "row" ? "center" : "stretch",
        justifyContent: "center",
        gap,
        width: "100%",
      }}
    >
      <DocCard w={vertical ? "auto" : cardW} n={12} frame={frame} fps={fps} />

      <div
        style={{
          display: "flex",
          flexDirection: dir === "row" ? "column" : "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          alignSelf: "center",
          minWidth: dir === "row" ? 150 : undefined,
          minHeight: dir === "row" ? undefined : 96,
        }}
      >
        <div
          style={{
            flex: 1,
            width: dir === "row" ? 2 : "100%",
            height: dir === "row" ? 120 : 2,
            backgroundImage: `repeating-linear-gradient(${
              dir === "row" ? "to bottom" : "to right"
            }, ${theme.lineStrong} 0 8px, transparent 8px 16px)`,
            opacity: thread,
            transform: dir === "row" ? `scaleY(${thread})` : `scaleX(${thread})`,
            transformOrigin: dir === "row" ? "center top" : "center left",
          }}
        />
        <div
          style={{
            fontFamily: theme.mono,
            fontSize: s(18, 16),
            letterSpacing: "0.04em",
            color: theme.inkSoft,
            whiteSpace: "nowrap",
            opacity: thread,
          }}
        >
          Ctrl+C / Ctrl+V
        </div>
        <div
          style={{
            flex: 1,
            width: dir === "row" ? 2 : "100%",
            height: dir === "row" ? 120 : 2,
            backgroundImage: `repeating-linear-gradient(${
              dir === "row" ? "to bottom" : "to right"
            }, ${theme.lineStrong} 0 8px, transparent 8px 16px)`,
            opacity: thread,
            transform: dir === "row" ? `scaleY(${thread})` : `scaleX(${thread})`,
            transformOrigin: dir === "row" ? "center top" : "center left",
          }}
        />
      </div>

      <ChatCard w={vertical ? "auto" : cardW + 60} frame={frame} fps={fps} />
    </div>
  );

  return (
    <AbsoluteFill style={{ fontFamily: theme.font, color: theme.ink }}>
      <Backdrop />

      <AbsoluteFill
        style={{
          width: W,
          height: H,
          padding: vertical ? `${pad}px ${pad}px ${pad + 130}px` : `56px ${pad}px 250px`,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            opacity: kicker.opacity,
            fontSize: s(18, 20),
            letterSpacing: "0.32em",
            fontWeight: 600,
            color: theme.inkFaint,
            textTransform: "uppercase",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: theme.accent,
            }}
          />
          {text(on.kicker, "kicker")}
        </div>

        {cards(vertical ? "column" : "row")}

        <div>
          <div
            style={{
              fontSize: s(92, 76),
              fontWeight: 800,
              letterSpacing: "-0.02em",
              lineHeight: 1.14,
              transform: `translateY(${lineA.y}px)`,
              opacity: lineA.opacity,
            }}
          >
            <Rich text={text(on.lines?.[0], "lines[0]")} accent={theme.accentInk} />
          </div>
          <div
            style={{
              fontSize: s(92, 76),
              fontWeight: 800,
              letterSpacing: "-0.02em",
              lineHeight: 1.14,
              transform: `translateY(${lineB.y}px)`,
              opacity: lineB.opacity,
            }}
          >
            <Rich text={text(on.lines?.[1], "lines[1]")} accent={theme.accentInk} />
          </div>
          <div
            style={{
              marginTop: s(26, 22),
              fontSize: s(30, 32),
              lineHeight: 1.6,
              color: theme.inkSoft,
              maxWidth: s(1100, 900),
              transform: `translateY(${sub.y}px)`,
              opacity: sub.opacity,
            }}
          >
            <Rich text={text(on.sub, "sub")} accent={theme.accentInk} />
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};