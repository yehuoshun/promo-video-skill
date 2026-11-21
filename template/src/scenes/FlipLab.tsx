import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { FlipCascade } from "../effects/FlipCascade";
import { FilmLook } from "../effects/FilmLook";
import { GradientMesh } from "../effects/GradientMesh";
import { theme } from "../lib/theme";

/**
 * 翻转瀑布流字幕的样板间：两版参数并排给人看。
 *
 * 这一段不走 timing.json —— 它是效果样张，不是产品片的一段，
 * 所以时长由 Root.tsx 的 composition 直接给死。
 *
 * rows 的节奏不是随便写的：每拍出一行，所以「行数 x beat」约等于观众能看完的时长，
 * 末尾留 2 秒让最后的行被顶走，别在满屏字时突然停住。
 */

export const ROWS = [
  "瀑布流字幕",
  "不是淡入淡出",
  "是**一条一条**顶出来的",
  "绕 X 轴翻 -78 度",
  "原点在**底边**",
  "一拍顶一行",
  "旧行被新行顶走",
  "逐字错峰 40ms",
  "卡点全靠**静止**那段",
  "promo-video-skill",
];

const Stage: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill style={{ backgroundColor: theme.bg }}>
    <GradientMesh frame={0} fps={30} colors={["#06080c", "#102a26", "#0d1b33"]} opacity={0.9} />
    <AbsoluteFill
      style={{
        background: "radial-gradient(ellipse at 50% 76%, rgba(142,240,200,0.10), transparent 62%)",
      }}
    />
    {children}
    <FilmLook frame={0} vignette={0.58} grain={0.1} />
  </AbsoluteFill>
);

const Note: React.FC<{ frame: number; fps: number; label: string }> = ({ frame, fps, label }) => (
  <div
    style={{
      position: "absolute",
      left: 132,
      top: 108,
      fontFamily: theme.mono,
      fontSize: 18,
      letterSpacing: "0.18em",
      color: theme.inkFaint,
    }}
  >
    {label} / {fps}fps / f{String(frame).padStart(3, "0")}
  </div>
);

/**
 * 样板间时长：行数 × 拍 + 尾巴。
 * 十行文案在第 10 拍出完，之后还要 4.4 拍才能淡干净（fadeFrom=4 + 淡出 1.4 行），
 * 少给就会在满屏字上「啪」地断掉——那是最容易露馅的地方。
 */
export const flipLabFrames = (beat: number, from: number, fps = 30): number =>
  Math.ceil((ROWS.length + 4.4) * beat * fps + from * fps);

/** 标配版：一拍 0.34s、逐字错峰、78 度从地面翻起 */
export const Flip: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Stage>
      <Note frame={frame} fps={fps} label="FLIP CASCADE / 0.34s per beat / 40ms stagger" />
      <FlipCascade
        rows={ROWS}
        beat={0.34}
        hold={0.45}
        rowHeight={136}
        anchor={0.78}
        flip={-78}
        flipDur={0.26}
        charStagger={0.04}
        from={0.2}
        fontSize={96}
        fadeFrom={4}
        maxWidth={1240}
      />
    </Stage>
  );
};

/** 慢速版：一拍 0.62s、整行一起翻（charStagger=0）、角度收到 -64 度，更像稳的口播字幕 */
export const FlipCalm: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Stage>
      <Note frame={frame} fps={fps} label="FLIP CASCADE CALM / 0.62s per beat / whole-line flip" />
      <FlipCascade
        rows={ROWS}
        beat={0.62}
        hold={0.6}
        rowHeight={150}
        anchor={0.78}
        flip={-64}
        flipDur={0.36}
        charStagger={0}
        from={0.35}
        fontSize={104}
        fadeFrom={3.4}
        maxWidth={1240}
      />
    </Stage>
  );
};
