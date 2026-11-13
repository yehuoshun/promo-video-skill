import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "./lib/theme";
import { sec, timing } from "./lib/timing";
import { SUB_PAD_IN, SUB_PAD_OUT } from "./Subtitles";

/**
 * 竖版（1080×1920）：抖音 / 视频号 / 小红书视频。
 *
 * 做法是「横版加壳」——把 1920×1080 的正片整块缩到 0.5625 落在画面上部，
 * 上面留品牌条、下面留大字幕和地址。为什么不重新排一套竖版分镜？
 * 因为六场戏里的截图卡（终端 1200、树 1240、库卡 1550）都是按 16:9 的
 * 安全区算过的，重排一遍等于重做一个片子；而竖版真正要看的是字，
 * 所以这里把字幕放大到 54px 单独渲染，画面只当证据。
 *
 * 代价要说清楚：终端和目录树在小屏上是「看得出是什么」而不是「读得清每一行」。
 * 哪天真要竖版也能读细节，得按竖版重排 Shot 的 cardW/cardH，而不是继续缩。
 */

const FRAME_TOP = 300; // 正片顶边
const FRAME_H = 608; // 1080 / 16 * 9
const SUB_TOP = 952;

const Brand: React.FC = () => (
  <div
    style={{
      position: "absolute",
      top: 168,
      left: 0,
      right: 0,
      textAlign: "center",
      fontFamily: theme.mono,
      fontSize: 25,
      letterSpacing: "0.16em",
      color: "rgba(242,244,247,0.5)",
    }}
  >
    <span style={{ color: theme.accent }}>YUQUE-IMPORT-SKILL</span>
    <span style={{ margin: "0 14px", color: "rgba(242,244,247,0.28)" }}>·</span>
    GitHub 仓库 → 语雀
  </div>
);

const Frame: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ position: "absolute", top: FRAME_TOP, left: 0, width: 1080, height: FRAME_H }}>
    {children}
    {/* 只在上面盖一圈描边和柔光，不做 overflow 裁切：正片自己就是深底，圆角不圆角看不出来 */}
    <div
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: 20,
        border: "1px solid rgba(255,255,255,0.10)",
        boxShadow: "0 30px 90px rgba(0,0,0,0.6)",
      }}
    />
  </div>
);

const VLine: React.FC<{ text: string; frames: number }> = ({ text, frames }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inF = Math.round(0.12 * fps);
  const outF = Math.round(0.18 * fps);
  const enter = Math.min(1, inF > 0 ? f / inF : 1);
  const leave = Math.min(1, outF > 0 ? (frames - f) / outF : 1);
  const alpha = Math.max(0, Math.min(enter, leave));
  const rise = (1 - enter) * 16;

  return (
    <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center" }}>
      <div
        style={{
          marginTop: SUB_TOP,
          width: 940,
          padding: "26px 34px",
          borderRadius: 22,
          background: "rgba(10, 13, 20, 0.72)",
          border: "1px solid rgba(255,255,255,0.10)",
          color: "#f4f6fb",
          fontFamily: theme.font,
          fontSize: 54,
          fontWeight: 700,
          lineHeight: 1.36,
          letterSpacing: "0.01em",
          textAlign: "center",
          opacity: alpha,
          transform: `translateY(${rise}px)`,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

const VSubtitles: React.FC = () => {
  const lines = timing.voiceLines ?? [];
  if (!lines.length) return null;
  return (
    <>
      {lines.map((l) => {
        const from = sec(Math.max(0, l.at - SUB_PAD_IN));
        const to = Math.min(timing.duration, l.at + l.dur + SUB_PAD_OUT);
        const frames = Math.max(1, sec(to) - from);
        return (
          <Sequence key={l.id} from={from} durationInFrames={frames} name={`vsub:${l.id}`}>
            <VLine text={l.text} frames={frames} />
          </Sequence>
        );
      })}
    </>
  );
};

/** 底部常驻一行，抖音的文案/音乐/按钮会盖住 1500 以下，所以贴着 1400 放 */
const Foot: React.FC = () => (
  <div
    style={{
      position: "absolute",
      top: 1392,
      left: 0,
      right: 0,
      textAlign: "center",
      fontFamily: theme.mono,
      fontSize: 26,
      color: "rgba(242,244,247,0.42)",
    }}
  >
    github.com/yehuoshun/yuque-import-skill
  </div>
);

/**
 * 字幕和地址之间那块空地：竖屏的中间偏下是抖音唯一不会被 UI 盖住的黄金区，
 * 空着就是白扔。放三个真数字，让划到一半的人也能立刻知道规模。
 */
const Stats: React.FC = () => (
  <div
    style={{
      position: "absolute",
      top: 1184,
      left: 0,
      right: 0,
      display: "flex",
      justifyContent: "center",
      gap: 16,
    }}
  >
    {[
      ["1210", "个节点"],
      ["83", "个目录"],
      ["1127", "篇文档"],
    ].map(([n, unit]) => (
      <div
        key={n}
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          padding: "14px 26px",
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.045)",
          borderRadius: 999,
          fontFamily: theme.mono,
        }}
      >
        <span style={{ fontSize: 40, fontWeight: 800, color: "#f2f4f7" }}>{n}</span>
        <span style={{ fontSize: 24, color: "rgba(242,244,247,0.55)" }}>{unit}</span>
      </div>
    ))}
  </div>
);

export const Vertical: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill style={{ backgroundColor: theme.bg }}>
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundImage:
          "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
        backgroundSize: "64px 64px",
        maskImage: "radial-gradient(120% 70% at 50% 30%, #000 30%, transparent 78%)",
      }}
    />
    <Brand />
    <Frame>{children}</Frame>
    <VSubtitles />
    <Stats />
    <Foot />
  </AbsoluteFill>
);
