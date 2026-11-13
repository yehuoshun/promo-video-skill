import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { slots, stats, text } from "../lib/onscreen";
import { Rich } from "../lib/rich";
import { theme } from "../lib/theme";
import { easeOutCubic, enter, impulse, keys, ramp } from "../lib/anim";
import type { Scene } from "../lib/timing";

const BARS = [0.34, 0.52, 0.41, 0.68, 0.57, 0.83, 0.62, 0.91];

/**
 * 产品展示：浏览器框推入 + 数字滚动。
 * 每个数字都用 keys() 从 0 走到目标值，速度和卡片入场错开，
 * 这是「数据卖点」最常见的处理（数字涨 = 规模、性能、覆盖）。
 */
export const Showcase: React.FC<{ sc: Scene }> = ({ sc }) => {
  const on = slots(sc);
  const cards = stats(sc);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = (s: number) => s * fps;

  // 入场只准用 anim.ts 的四个角色名；scale 不是位移，仍用 ramp
  const stage = enter(frame, 0, "stage");
  const frameScale = ramp(frame, 0, 22, { from: 0.94, to: 1 });
  const caption = enter(frame, f(0.9), "quiet");

  return (
    <AbsoluteFill style={{ fontFamily: theme.font, color: theme.ink }}>
      <Backdrop gridIn={0.8} />

      <AbsoluteFill
        style={{
          padding: "92px 132px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 38,
        }}
      >
        {/* 浏览器框 */}
        <div
          style={{
            transform: `translateY(${stage.y}px) scale(${frameScale})`,
            opacity: stage.opacity,
            borderRadius: 18,
            border: `1px solid ${theme.line}`,
            background: "rgba(12,16,22,0.86)",
            boxShadow: "0 40px 120px rgba(0,0,0,0.55)",
            overflow: "hidden",
          }}
        >
          {/* 标题栏 */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "16px 22px",
              borderBottom: `1px solid ${theme.line}`,
              background: "rgba(255,255,255,0.03)",
            }}
          >
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#ff5f57" }} />
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#febc2e" }} />
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#28c840" }} />
            <div
              style={{
                marginLeft: 18,
                flex: 1,
                height: 30,
                borderRadius: 8,
                background: "rgba(255,255,255,0.06)",
                display: "flex",
                alignItems: "center",
                paddingLeft: 16,
                fontSize: 15,
                color: theme.inkFaint,
                fontFamily: theme.mono,
              }}
            >
              {text(on.url, "url")}
            </div>
          </div>

          {/* 内容区 */}
          <div style={{ padding: "34px 38px 40px" }}>
            <div style={{ display: "flex", gap: 20 }}>
              {cards.map((s, i) => {
                const card = enter(frame, f(0.35 + i * 0.22), "body", { fps, feel: "spring" });
                const n = keys(
                  frame,
                  [
                    [f(0.35 + i * 0.22), 0],
                    [f(1.15 + i * 0.22), s.value],
                  ],
                  easeOutCubic,
                );
                const pop = impulse(frame, f(1.15 + i * 0.22), 12) * 0.04;
                return (
                  <div
                    key={s.label}
                    style={{
                      flex: 1,
                      padding: "32px 34px",
                      borderRadius: 14,
                      border: `1px solid ${theme.line}`,
                      background: theme.card,
                      transform: `translateY(${card.y}px) scale(${1 + (card.p - 1) * 0.05 + pop})`,
                      opacity: card.opacity,
                    }}
                  >
                    <div style={{ fontSize: 17, color: theme.inkFaint, letterSpacing: "0.08em" }}>
                      {s.label}
                    </div>
                    <div
                      style={{
                        marginTop: 10,
                        fontSize: 70,
                        fontWeight: 800,
                        letterSpacing: "-0.03em",
                        color: i === 0 ? theme.accent : theme.ink,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {Math.round(n)}
                      <span style={{ fontSize: 26, fontWeight: 600, marginLeft: 6 }}>{s.unit}</span>
                    </div>
                    <div style={{ marginTop: 6, fontSize: 15, color: theme.inkFaint, fontFamily: theme.mono }}>
                      {s.hint}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 柱状图：逐根长出来，间隔 0.08s，别一次全亮 */}
            <div
              style={{
                marginTop: 34,
                display: "flex",
                alignItems: "flex-end",
                gap: 16,
                height: 214,
                padding: "0 4px",
              }}
            >
              {BARS.map((h, i) => {
                const grow = ramp(frame, f(1.5 + i * 0.08), 20, { from: 0, to: h });
                const lit = i === BARS.length - 1;
                return (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: `${grow * 100}%`,
                      borderRadius: "8px 8px 4px 4px",
                      background: lit
                        ? `linear-gradient(180deg, ${theme.accent}, rgba(142,240,200,0.35))`
                        : "linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0.06))",
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* 说明文字：跟着框一起，但晚 0.9 秒出，先让人看清框 */}
        <div
          style={{
            fontSize: 28,
            color: theme.inkSoft,
            opacity: caption.opacity,
            paddingLeft: 4,
          }}
        >
          <Rich text={text(on.caption, "caption")} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
