import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { CountUp } from "../effects/CountUp";
import { theme } from "../lib/theme";
import { ramp } from "../lib/anim";

const STATS = [
  { value: 1210, unit: "个节点", hint: "目录 + 文档" },
  { value: 83, unit: "个目录", hint: "一层都不少" },
  { value: 1127, unit: "篇文档", hint: "文件名照搬" },
];

/**
 * 痛点用真实规模说：一个仓库拆完就是一千多个节点。
 * 数字逐个小节滚出来（间隔 0.3s），别一次全亮。
 */
export const Pain: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = (s: number) => s * fps;

  const headIn = ramp(frame, 0, 16, { from: 30, to: 0 });
  const headOp = ramp(frame, 0, 14);
  const noteOp = ramp(frame, f(2.4), 16);

  return (
    <AbsoluteFill style={{ fontFamily: theme.font, color: theme.ink }}>
      <Backdrop gridIn={0.9} />

      <AbsoluteFill
        style={{
          padding: "0 132px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            fontSize: 30,
            letterSpacing: "0.24em",
            color: theme.inkFaint,
            opacity: headOp,
            transform: `translateY(${headIn}px)`,
          }}
        >
          一个仓库拆开，是这么多
        </div>

        <div
          style={{
            marginTop: 54,
            display: "flex",
            gap: 34,
          }}
        >
          {STATS.map((s, i) => {
            const start = 0.35 + i * 0.3;
            const appear = ramp(frame, f(start), 14, { from: 24, to: 0 });
            const show = ramp(frame, f(start), 12);
            return (
              <div
                key={s.unit}
                style={{
                  flex: 1,
                  padding: "34px 36px 30px",
                  borderRadius: 16,
                  border: `1px solid ${theme.line}`,
                  background: theme.card,
                  transform: `translateY(${appear}px)`,
                  opacity: show,
                }}
              >
                <CountUp
                  frame={frame}
                  fps={fps}
                  value={s.value}
                  start={start}
                  duration={0.9}
                  group
                  size={112}
                  color={i === 0 ? theme.accent : theme.ink}
                  pop={0.03}
                />
                <div style={{ marginTop: 4, fontSize: 26, color: theme.inkSoft }}>{s.unit}</div>
                <div
                  style={{
                    marginTop: 12,
                    fontSize: 16,
                    color: theme.inkFaint,
                    fontFamily: theme.mono,
                  }}
                >
                  {s.hint}
                </div>
              </div>
            );
          })}
        </div>

        <div
          style={{
            marginTop: 46,
            fontSize: 30,
            lineHeight: 1.6,
            color: theme.inkSoft,
            opacity: noteOp,
          }}
        >
          手工建：一页一页复制、一层一层点开。一个仓库，一天过去了。
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
