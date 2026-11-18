import React from "react";
import { AbsoluteFill } from "remotion";
import { slots, text } from "../lib/onscreen";
import { Rich } from "../lib/rich";
import { theme } from "../lib/theme";
import { timing } from "../lib/timing";

/**
 * 三平台封面（16:9 / 9:16 / 3:4）。
 *
 * 文案全部取自 timing.json 的 onscreen —— 封面也是屏幕上的字，不另写一份。
 * 版式按画布高度 × 宽度算比例，所以 1920×1080、1080×1920、1080×1440 用同一个组件。
 * 封面上只有四样东西：品牌条、两行主标题、19→65 的对撞、地址。
 */

type Props = { w: number; h: number };

export const Cover: React.FC<Props> = ({ w, h }) => {
  const hook = timing.scenes[0];
  const contrast = timing.scenes[1] ?? hook;
  const cta = timing.scenes[timing.scenes.length - 1];
  const on = slots(hook);
  const onC = slots(contrast);
  const onCta = slots(cta);

  const portrait = h > w;
  const tall = h / w > 1.6;
  const k = Math.min(h / 1080, 1.6); // 以 1080 高为基准的缩放
  const pad = (portrait ? 0.075 : 0.062) * w;

  const kickerPx = (portrait ? 22 : 24) * Math.min(k, 1.3);
  const titlePx = (portrait ? (tall ? 86 : 78) : 104) * Math.min(k, 1.25);
  const statPx = (portrait ? 116 : 132) * Math.min(k, 1.25);
  const urlPx = (portrait ? 26 : 28) * Math.min(k, 1.25);
  const contrastY = portrait ? (tall ? 0.62 : 0.58) : 0.63;
  const titleY = portrait ? (tall ? 0.19 : 0.16) : 0.20;

  return (
    <AbsoluteFill style={{ background: theme.bg, fontFamily: theme.font, color: theme.ink }}>
      {/* 纸面：白 → 浅绿 → 深一点的浅绿 */}
      <AbsoluteFill
        style={{ background: `linear-gradient(168deg, #ffffff 0%, ${theme.bg} 46%, ${theme.bgDeep} 100%)` }}
      />
      {/* 右上绿光 + 底部斜切色块，让封面在信息流里有一块纯色抓手 */}
      <div
        style={{
          position: "absolute",
          right: -w * 0.18,
          top: -h * 0.12,
          width: w * 0.7,
          height: w * 0.7,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${theme.accentSoft} 0%, rgba(0,185,107,0) 70%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          bottom: 0,
          width: w,
          height: h * 0.045,
          background: theme.accent,
          opacity: 0.9,
        }}
      />

      {/* 品牌条 */}
      <div
        style={{
          position: "absolute",
          left: pad,
          right: pad,
          top: h * (portrait ? 0.06 : 0.08),
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontFamily: theme.mono,
          fontSize: kickerPx,
          letterSpacing: "0.16em",
          color: theme.accentInk,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: kickerPx * 0.5, fontWeight: 700 }}>
          <span
            style={{
              width: kickerPx * 0.62,
              height: kickerPx * 0.62,
              borderRadius: kickerPx * 0.16,
              background: theme.accent,
            }}
          />
          {text(on.kicker, "kicker")}
        </span>
        <span style={{ color: theme.inkFaint, fontSize: kickerPx * 0.82 }}>{timing.cover?.topRight ?? ""}</span>
      </div>

      {/* 两行主标题 */}
      <div style={{ position: "absolute", left: pad, top: h * titleY, width: w - pad * 2 }}>
        <div style={{ fontSize: titlePx, fontWeight: 800, lineHeight: 1.14, letterSpacing: "-0.02em" }}>
          <Rich text={text(on.lines?.[0], "lines[0]")} accent={theme.accent} />
          <br />
          <Rich text={text(on.lines?.[1], "lines[1]")} accent={theme.accent} />
        </div>
        <div
          style={{
            marginTop: (portrait ? 0.026 : 0.032) * h,
            fontSize: (portrait ? 30 : 36) * Math.min(k, 1.25),
            lineHeight: 1.5,
            color: theme.inkSoft,
          }}
        >
          <Rich text={text(onC.sub, "sub")} accent={theme.accentInk} />
        </div>
      </div>

      {/* 19 → 65 的对撞：封面唯一的大数字 */}
      <div
        style={{
          position: "absolute",
          left: pad,
          top: h * contrastY,
          width: w - pad * 2,
          display: "flex",
          alignItems: "baseline",
          gap: (portrait ? 0.03 : 0.024) * w,
        }}
      >
        <span style={{ fontSize: statPx, fontWeight: 800, color: theme.muted, letterSpacing: "-0.03em" }}>
          {onC.stats?.[0]?.value ?? "19"}
        </span>
        <span style={{ fontSize: statPx * 0.52, color: theme.accent, fontWeight: 700 }}>→</span>
        <span style={{ fontSize: statPx, fontWeight: 800, color: theme.accentInk, letterSpacing: "-0.03em" }}>
          {onC.stats?.[1]?.value ?? "65"}
        </span>
        <span
          style={{
            fontSize: (portrait ? 24 : 26) * Math.min(k, 1.25),
            color: theme.inkSoft,
            lineHeight: 1.4,
            marginLeft: "auto",
            textAlign: "right",
            maxWidth: portrait ? "46%" : "38%",
          }}
        >
          {timing.cover?.lines?.[0] ?? ""}
          <br />
          {timing.cover?.lines?.[1] ?? ""}
        </span>
      </div>

      {/* 地址 */}
      <div
        style={{
          position: "absolute",
          left: pad,
          right: pad,
          bottom: h * (portrait ? 0.075 : 0.085),
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <span
          style={{
            fontFamily: theme.mono,
            fontSize: urlPx,
            fontWeight: 700,
            padding: "0.55em 0.8em",
            borderRadius: 14,
            background: theme.bgCard,
            border: `1px solid ${theme.lineStrong}`,
            boxShadow: theme.shadow,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {text(onCta.url, "url")}
        </span>
        {!portrait && (
          <span style={{ fontFamily: theme.mono, fontSize: urlPx * 0.8, color: theme.inkFaint, whiteSpace: "nowrap" }}>
            {text(onCta.tail, "tail")}
          </span>
        )}
      </div>
    </AbsoluteFill>
  );
};