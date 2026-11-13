import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { BigType, CountUp, FilmLook, GradientMesh, IsometricCards, LightSweep } from "../effects";
import { theme } from "../lib/theme";

/**
 * effect kit 的展示台：六段 × 3 秒，一段一个效果。
 *
 * 这不是产品片，是给人看「这个效果长什么样、参数怎么调」的样板间，
 * 所以它不走 timing.json（不参与 check_timing 的时长/版式规则）。
 * 真正的项目里，这些效果是往 scenes/ 的组件里拼的，不是按段播放。
 */

const SEG_FRAMES = 90; // 3 秒 @30fps
const SEGMENTS = [
  { name: "动态大字", en: "BIG TYPE" },
  { name: "数字滚动", en: "COUNT UP" },
  { name: "等距卡片", en: "ISOMETRIC" },
  { name: "光扫", en: "LIGHT SWEEP" },
  { name: "颗粒与暗角", en: "FILM LOOK" },
  { name: "组合用法", en: "COMBINED" },
];

const ISO_ITEMS = [
  { title: "分镜", sub: "timing.json" },
  { title: "素材", sub: "> 8 张真实截图" },
  { title: "配乐", sub: "bpm / 拍点网格" },
  { title: "校验", sub: "会 fail 的闸门" },
  { title: "渲染", sub: "1080p / 4K" },
  { title: "改版", sub: "-c:v copy 换音轨" },
];

const Caption: React.FC<{ index: number }> = ({ index }) => (
  <div
    style={{
      position: "absolute",
      left: 150,
      bottom: 78,
      fontFamily: theme.mono,
      fontSize: 20,
      letterSpacing: "0.16em",
      color: theme.inkFaint,
      zIndex: 30,
    }}
  >
    {String(index + 1).padStart(2, "0")} · {SEGMENTS[index].en} · {SEGMENTS[index].name}
  </div>
);

const Dots: React.FC<{ index: number }> = ({ index }) => (
  <div style={{ position: "absolute", right: 150, bottom: 80, display: "flex", gap: 10, zIndex: 30 }}>
    {SEGMENTS.map((_, i) => (
      <div
        key={i}
        style={{
          width: i === index ? 34 : 10,
          height: 10,
          borderRadius: 6,
          background: i === index ? theme.accent : "rgba(255,255,255,0.18)",
        }}
      />
    ))}
  </div>
);

const BigTypeSeg: React.FC<{ lf: number; fps: number }> = ({ lf, fps }) => (
  <>
    <GradientMesh frame={lf} fps={fps} />
    <BigType
      frame={lf}
      fps={fps}
      kicker="PROMO EFFECT KIT"
      lines={[{ text: "把素材" }, { text: "变成节奏。", accent: true }]}
      sub="六个纯函数组件，全部由帧驱动。"
      from={0.15}
    />
    <FilmLook frame={lf} />
  </>
);

const CountUpSeg: React.FC<{ lf: number; fps: number }> = ({ lf, fps }) => {
  const stats = [
    { value: 128, suffix: "", label: "个场景样例" },
    { value: 99.6, suffix: "%", decimals: 1, label: "自动闸门覆盖" },
    { value: 3600, suffix: "", label: "帧级可复现" },
  ];
  return (
    <>
      <GradientMesh frame={lf} fps={fps} colors={["#07090d", "#14253d", "#0e2f2a"]} opacity={0.9} />
      <AbsoluteFill style={{ padding: "0 150px", justifyContent: "center", fontFamily: theme.font }}>
        <div style={{ display: "flex", gap: 90, alignItems: "flex-end" }}>
          {stats.map((s, i) => (
            <div key={s.label}>
              <CountUp
                frame={lf}
                fps={fps}
                value={s.value}
                decimals={s.decimals ?? 0}
                suffix={s.suffix}
                start={0.25 + i * 0.22}
                size={i === 0 ? 132 : 108}
                color={i === 0 ? theme.accent : theme.ink}
              />
              <div style={{ marginTop: 14, fontSize: 22, color: theme.inkFaint }}>{s.label}</div>
            </div>
          ))}
        </div>
      </AbsoluteFill>
      <FilmLook frame={lf} grain={0.12} />
    </>
  );
};

const IsoSeg: React.FC<{ lf: number; fps: number }> = ({ lf, fps }) => (
  <>
    <GradientMesh frame={lf} fps={fps} colors={["#05070b", "#12312c", "#132a45"]} opacity={0.85} />
    <div style={{ position: "absolute", inset: 0, transform: "translate(4%, 6%) scale(1.06)" }}>
      <IsometricCards
        frame={lf}
        fps={fps}
        items={ISO_ITEMS}
        cardWidth={330}
        from={0.1}
        stagger={0.1}
      />
    </div>
    <FilmLook frame={lf} grain={0.13} vignette={0.62} />
  </>
);

const SweepSeg: React.FC<{ lf: number; fps: number }> = ({ lf, fps }) => (
  <>
    <AbsoluteFill style={{ background: theme.bgDeep }} />
    <AbsoluteFill
      style={{
        background: "radial-gradient(circle at 50% 50%, rgba(142,240,200,0.07), transparent 58%)",
      }}
    />
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        gap: 26,
        fontFamily: theme.font,
      }}
    >
      <div style={{ fontSize: 22, letterSpacing: "0.34em", color: theme.inkFaint, fontFamily: theme.mono }}>
        LIGHT SWEEP
      </div>
      <div style={{ fontSize: 58, color: theme.ink, fontFamily: theme.mono }}>
        github.com/yehuoshun/promo-video-skill
      </div>
    </AbsoluteFill>
    {/* 两次扫过，间隔 1.2 秒：一次太单调，三次又吵 */}
    <LightSweep frame={lf} fps={fps} start={0.45} duration={0.85} strength={0.62} width={480} />
    <LightSweep
      frame={lf}
      fps={fps}
      start={1.75}
      duration={0.85}
      strength={0.45}
      width={480}
      color="rgba(142,240,200,0.9)"
    />
    <FilmLook frame={lf} grain={0.1} vignette={0.4} />
  </>
);

const FilmSeg: React.FC<{ lf: number; fps: number }> = ({ lf, fps }) => (
  <>
    <GradientMesh frame={lf} fps={fps} colors={["#101418", "#33454a", "#233340"]} opacity={1} />
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        fontFamily: theme.font,
        fontSize: 64,
        fontWeight: 700,
        color: theme.ink,
      }}
    >
      左边有颗粒，右边没有
    </AbsoluteFill>
    {/* 只在左半边叠效果：用 clip-path 裁，坐标仍然是整帧的 */}
    <AbsoluteFill style={{ clipPath: "inset(0 50% 0 0)" }}>
      <FilmLook frame={lf} grain={0.34} vignette={0.6} />
    </AbsoluteFill>
    <div
      style={{
        position: "absolute",
        left: "calc(50% - 0.5px)",
        top: 0,
        width: 1,
        height: "100%",
        background: "rgba(255,255,255,0.2)",
        zIndex: 25,
      }}
    />
    <div
      style={{
        position: "absolute",
        left: 150,
        top: 92,
        fontFamily: theme.mono,
        fontSize: 20,
        letterSpacing: "0.16em",
        color: theme.inkSoft,
      }}
    >
      GRAIN 0.34 + VIGNETTE 0.6
    </div>
    <div
      style={{
        position: "absolute",
        right: 150,
        top: 92,
        fontFamily: theme.mono,
        fontSize: 20,
        letterSpacing: "0.16em",
        color: theme.inkFaint,
      }}
    >
      GRAIN OFF
    </div>
  </>
);

const ComboSeg: React.FC<{ lf: number; fps: number }> = ({ lf, fps }) => (
  <>
    <GradientMesh frame={lf} fps={fps} colors={["#06080c", "#1a3f38", "#15243c"]} />
    <BigType
      frame={lf}
      fps={fps}
      mode="mask"
      kicker="组合起来才是成片"
      lines={[{ text: "底 + 字 + 光", accent: true }, { text: "最后压一层颗粒" }]}
      size={104}
      from={0.1}
    />
    <LightSweep frame={lf} fps={fps} start={1.1} duration={0.9} />
    <FilmLook frame={lf} grain={0.18} />
  </>
);

export const EffectsLab: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const index = Math.min(SEGMENTS.length - 1, Math.floor(frame / SEG_FRAMES));
  const lf = frame - index * SEG_FRAMES;

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg, fontFamily: theme.font, color: theme.ink }}>
      {index === 0 ? <BigTypeSeg lf={lf} fps={fps} /> : null}
      {index === 1 ? <CountUpSeg lf={lf} fps={fps} /> : null}
      {index === 2 ? <IsoSeg lf={lf} fps={fps} /> : null}
      {index === 3 ? <SweepSeg lf={lf} fps={fps} /> : null}
      {index === 4 ? <FilmSeg lf={lf} fps={fps} /> : null}
      {index === 5 ? <ComboSeg lf={lf} fps={fps} /> : null}
      <Caption index={index} />
      <Dots index={index} />
    </AbsoluteFill>
  );
};
