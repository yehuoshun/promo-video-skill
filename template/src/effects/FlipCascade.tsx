/*** 文字翻转瀑布流字幕（剪映里叫「翻转大字 / 快闪旋转」，B 站叫「倒鸭子」）。 */
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { clamp, easeInOutCubic, easeOutCubic } from "../lib/anim";
import { theme } from "../lib/theme";

/**
 * 它跟普通字幕的区别不在「有动画」，而在于三条同时成立：
 *
 *   1. 行是传送带上的行，不是一个个独立弹出的窗口。
 *      所有行共享同一条上行位移：新行在锚点出生，旧行被整体顶上去一行。
 *      如果每行自己往上飘，相邻行的位移曲线不同，行距会塌成一张叠字。
 *
 *   2. 位移是阶梯，不是匀速。
 *      一拍之内先静止再顶一下（hold 参数），静止那段就是读字和气口；
 *      匀速滚动会变成跑马灯，卡点感全在静止里。
 *
 *   3. 翻转绕 X 轴、原点在底边。
 *      transformOrigin 50% 100% + 父级 perspective，字像门板从地面翻起来。
 *      换成 rotateY（绕竖轴）会变成旋转木马，没有「翻」的物理感。
 *
 * 全部是「帧 -> 值」的纯函数：逐字错峰也是按字符索引算延迟，不靠 CSS animation
 * （CSS 动画在 Remotion 里逐帧截帧时不可控，同一帧会算出不同结果）。
 */

export interface FlipCascadeProps {
  /** 每行的文案，行内 **...** 走强调色 */
  rows: string[];
  /** 每拍秒数（卡点间隔）。30fps 下 0.34 约等于 10 帧一拍 */
  beat?: number;
  /** 拍内静止占比：0.45 = 拍内前 45% 不动，剩下 55% 顶上一行 */
  hold?: number;
  /** 行距（按 1920x1080 布局坐标写） */
  rowHeight?: number;
  /** 新行出生位置：0 顶 / 1 底 */
  anchor?: number;
  /** 翻转起始角度（deg）。负数 = 从画面里侧翻出来 */
  flip?: number;
  /** 单行翻完的时长（秒） */
  flipDur?: number;
  /** 逐字错峰（秒）。0 = 整行一起翻，大于 0 = 一个字一个字翻出来 */
  charStagger?: number;
  /** 第一行什么时候开始进（秒） */
  from?: number;
  /** 字号（1920 布局坐标） */
  fontSize?: number;
  /** 上行超过第几行开始淡出 */
  fadeFrom?: number;
  /** 文字最大宽度，用来定左右留白 */
  maxWidth?: number;
}

/** 拍数（可带小数）-> 已经上行了多少行。拍内是阶梯：先停（hold），再顶。 */
export function conveyor(beatsElapsed: number, hold = 0.45): number {
  if (beatsElapsed <= 0) return 0;
  const k = Math.floor(beatsElapsed);
  const local = beatsElapsed - k;
  const p = clamp((local - hold) / Math.max(1e-6, 1 - hold));
  return k + easeInOutCubic(p);
}

export type Cell = { ch: string; accent: boolean };

/** "不是**淡入淡出**" -> 逐字，双星之间的字走强调色 */
export function cells(text: string): Cell[] {
  const out: Cell[] = [];
  let accent = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "*" && text[i + 1] === "*") {
      accent = !accent;
      i++;
      continue;
    }
    out.push({ ch: text[i], accent });
  }
  return out;
}

export const FlipCascade: React.FC<FlipCascadeProps> = ({
  rows,
  beat = 0.34,
  hold = 0.45,
  rowHeight = 132,
  anchor = 0.76,
  flip = -78,
  flipDur = 0.26,
  charStagger = 0.04,
  from = 0.2,
  fontSize = 92,
  fadeFrom = 4,
  maxWidth = 1180,
}) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();

  const beatFrames = Math.max(1, beat * fps);
  const flipBeats = Math.max(1e-3, flipDur / beat);
  const stagger = charStagger / beat;
  const anchorPx = height * anchor;

  // 上行传送带：只跟全局帧有关，所以所有行走同一条曲线，行距永远锁死
  const beatsElapsed = (frame - from * fps) / beatFrames;
  const conveyorAt = conveyor(beatsElapsed, hold);

  const mask = "linear-gradient(to bottom, transparent 2%, #000 22%, #000 96%, transparent 100%)";

  return (
    <AbsoluteFill style={{ perspective: 1400, perspectiveOrigin: "50% " + anchor * 100 + "%" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          // 顶上渐隐：旧行不是被硬切断，而是从画面上沿被吃掉
          WebkitMaskImage: mask,
          maskImage: mask,
        }}
      >
        {rows.map((text, i) => {
          const bornAt = i; // 第 i 行在第 i 拍出生
          if (beatsElapsed < bornAt) return null;

          const slot = conveyorAt - bornAt; // 0 = 刚出生，1 = 被顶上一行
          const rowQ = clamp((beatsElapsed - bornAt) / flipBeats);
          const outQ = clamp((slot - fadeFrom) / 1.4);
          const opacity = (1 - outQ) * clamp(rowQ * 1.6);
          if (opacity <= 0.001) return null;

          const rowCells = cells(text);
          const rowRot = flip * (1 - easeOutCubic(rowQ));
          const rowZ = -260 * (1 - easeOutCubic(rowQ));

          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: anchorPx,
                height: rowHeight,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transform: "translateY(" + -slot * rowHeight + "px)",
                transformStyle: "preserve-3d",
                opacity,
                padding: "0 " + (1920 - maxWidth) / 2 + "px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-end",
                  fontFamily: theme.font,
                  fontSize,
                  fontWeight: 800,
                  lineHeight: 1,
                  letterSpacing: "-0.01em",
                  color: theme.ink,
                  transformStyle: "preserve-3d",
                  transform: "rotateX(" + rowRot + "deg) translateZ(" + rowZ + "px)",
                  whiteSpace: "pre",
                }}
              >
                {rowCells.map((c, ci) => {
                  // 逐字错峰：第 ci 个字晚 stagger*ci 拍才开始翻
                  const q = clamp((beatsElapsed - bornAt - ci * stagger) / flipBeats);
                  const rot = flip * (1 - easeOutCubic(q));
                  const z = -240 * (1 - easeOutCubic(q));
                  const lift = 10 * (1 - easeOutCubic(q));
                  const glow = clamp(1 - q); // 刚翻起来时最亮，落定后收掉
                  // 明暗调制：翻起来的那半程背光（暗），落定才回到全亮。
                  // 少了这一条，字只是「压扁 + 淡入」，看上去像缩放，不像一块门板翻过来。
                  const lit = 0.32 + 0.68 * easeOutCubic(q);
                  return (
                    <span
                      key={ci}
                      style={{
                        display: "inline-block",
                        transform:
                          "rotateX(" + rot + "deg) translateZ(" + z + "px) translateY(" + lift + "px)",
                        transformOrigin: "50% 100%",
                        backfaceVisibility: "hidden",
                        opacity: clamp(q * 1.4),
                        filter: "brightness(" + lit.toFixed(3) + ")",
                        color: c.accent ? theme.accent : theme.ink,
                        textShadow: c.accent
                          ? "0 0 " + (28 * glow + 8) + "px rgba(142,240,200," + (0.5 * glow + 0.08) + ")"
                          : "none",
                      }}
                    >
                      {c.ch}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
