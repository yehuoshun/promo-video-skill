import React from "react";
import { AbsoluteFill } from "remotion";
import { ramp } from "../lib/anim";
import { theme } from "../lib/theme";
import { randRange } from "./rand";

export type IsoCard = { title: string; sub?: string };

export type IsometricCardsProps = {
  frame: number;
  fps: number;
  items: IsoCard[];
  /** 每行几张 */
  columns?: number;
  cardWidth?: number;
  /** 每张卡之间延迟（秒） */
  stagger?: number;
  /** 入场从第几秒开始 */
  from?: number;
  /** 相机倾角：越大越"俯视" */
  tilt?: number;
  spin?: number;
};

/**
 * 等距卡片：整块平面斜过来，卡片从远处浮上来，还有轻微视差漂移。
 * 适合「体系化产品」——功能矩阵、模块全景、定价档位。
 *
 * 实现在 3D 上下的是假功夫：没有 three.js，只有 perspective + rotate + translateZ。
 * 4K 下不会糊（CSS 3D 由浏览器按实际分辨率栅格化），但别指望真实光影。
 */
export const IsometricCards: React.FC<IsometricCardsProps> = ({
  frame,
  fps,
  items,
  columns = 3,
  cardWidth = 300,
  stagger = 0.14,
  from = 0,
  tilt = 54,
  spin = -42,
}) => {
  const t = frame / fps;
  // 整块缓慢平移，制造「镜头在动」的错觉
  const driftX = Math.sin(t * 0.5) * 16;
  const driftY = Math.cos(t * 0.42) * 10;

  return (
    <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center", perspective: 1800 }}>
      <div
        style={{
          transformStyle: "preserve-3d",
          transform: `translate(${driftX}px, ${driftY}px) rotateX(${tilt}deg) rotateZ(${spin}deg)`,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${columns}, ${cardWidth}px)`,
            gap: 26,
            transformStyle: "preserve-3d",
          }}
        >
          {items.map((item, i) => {
            const at = (from + i * stagger) * fps;
            const p = ramp(frame, at, 20, { from: 0, to: 1 });
            const z = randRange(i + 1, 20, 120);
            // 每张卡自己轻微浮动，频率不同 → 不会像一整块板
            const float = Math.sin(t * 0.9 + i) * 7;
            return (
              <div
                key={item.title}
                style={{
                  height: 178,
                  borderRadius: 18,
                  padding: "22px 24px",
                  background: "linear-gradient(160deg, rgba(255,255,255,0.09), rgba(255,255,255,0.03))",
                  border: `1px solid ${theme.line}`,
                  boxShadow: "0 30px 60px rgba(0,0,0,0.45)",
                  opacity: p,
                  transform: `translateZ(${(z + float) * p}px)`,
                  fontFamily: theme.font,
                  color: theme.ink,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "flex-end",
                }}
              >
                <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.01em" }}>{item.title}</div>
                {item.sub ? (
                  <div style={{ marginTop: 8, fontSize: 17, color: theme.inkFaint, fontFamily: theme.mono }}>
                    {item.sub}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
