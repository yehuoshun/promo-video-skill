import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import {
  BigType,
  CountUp,
  FilmLook,
  GradientMesh,
  IsometricCards,
  LightSweep,
  Lottie,
  Morph,
} from "../effects";
import { theme } from "../lib/theme";
// 素材放 public/lottie/（发布时也在那里），这里只是把它当 JSON 对象 import 进来，
// 因为 @remotion/lottie 要的是 animationData 对象，不是路径。
import demoBadge from "../../public/lottie/demo-badge.json";

/**
 * effect kit 的展示台：八段 × 3 秒，一段一个效果。
 *
 * 这不是产品片，是给人看「这个效果长什么样、参数怎么调」的样板间，
 * 所以它不走 timing.json（不参与 check_timing 的时长/版式规则）。
 * 真正的项目里，这些效果是往 scenes/ 的组件里拼的，不是按段播放。
 *
 * 段数改了要同步 Root.tsx 的 Effects composition：
 * 那里写的是 SEGMENTS.length * SEG_FRAMES（24 秒 = 720 帧 @30fps），不用手改魔数。
 */

export const SEG_FRAMES = 90; // 3 秒 @30fps

export const SEGMENTS = [
  { name: "动态大字", en: "BIG TYPE" },
  { name: "数字滚动", en: "COUNT UP" },
  { name: "等距卡片", en: "ISOMETRIC" },
  { name: "光扫", en: "LIGHT SWEEP" },
  { name: "颗粒与暗角", en: "FILM LOOK" },
  { name: "组合用法", en: "COMBINED" },
  { name: "矢量图标", en: "LOTTIE" },
  { name: "形状变形", en: "MORPH" },
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
      sub="八个纯函数组件，全部由帧驱动。"
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

/**
 * 第 7 段：Lottie。
 *
 * 素材是自绘的 public/lottie/demo-badge.json（授权说明见同目录 README.md）。
 * 这一段的重点是「矢量、按帧 seek」：组件内部先把场景帧换算成素材帧，再让 lottie
 * goToAndStop，所以第 7 段（全局帧 540+）也不会停在末帧——那是裸 <Sequence from={at}>
 * 的经典坑（from 是相对父时间轴，不是场景内帧）。详见 effects/Lottie.tsx 的注释。
 */
const LottieSeg: React.FC<{ lf: number; fps: number }> = ({ lf, fps }) => (
  <>
    <GradientMesh frame={lf} fps={fps} colors={["#05080c", "#102634", "#123029"]} opacity={1} />
    <Lottie frame={lf} fps={fps} data={demoBadge} from={0.12} width={520} height={520} />
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
      BODYMOVIN JSON · 按帧 SEEK
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
      512 × 512 · 90 帧 · 无 rAF
    </div>
    <FilmLook frame={lf} grain={0.12} />
  </>
);

/**
 * Morph 用的两条形状：同一个 viewBox（0 0 100 100）、同为顺时针、都是单环。
 * 顺时针和单环是 flubber 最稳的输入；点数不同它自己会补。
 */
const MORPH_CIRCLE =
  "M 50 12 C 70.99 12 88 29.01 88 50 C 88 70.99 70.99 88 50 88 C 29.01 88 12 70.99 12 50 C 12 29.01 29.01 12 50 12 Z";
const MORPH_SQUARE = "M 14 14 L 86 14 L 86 86 L 14 86 Z";

/**
 * 第 8 段：形状 morph。
 *
 * 大的是「圆 → 方」，右边小的是「方 → 圆」且晚 0.25 秒起步，
 * 用来演示两个实例各自按自己的 fromAt / duration 走，互不影响（t 是纯函数）。
 */
const MorphSeg: React.FC<{ lf: number; fps: number }> = ({ lf, fps }) => (
  <>
    <GradientMesh frame={lf} fps={fps} colors={["#06080c", "#173a34", "#1b2340"]} opacity={1} />
    <Morph
      frame={lf}
      fps={fps}
      from={MORPH_CIRCLE}
      to={MORPH_SQUARE}
      fromAt={0.3}
      duration={1.1}
      width={520}
      height={520}
      strokeWidth={2}
    />
    <Morph
      frame={lf}
      fps={fps}
      from={MORPH_SQUARE}
      to={MORPH_CIRCLE}
      fromAt={0.55}
      duration={0.9}
      width={240}
      height={240}
      x={1500}
      y={540}
      fill="none"
      stroke={theme.inkFaint}
      strokeWidth={2}
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
      CIRCLE → SQUARE · FLUBBER
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
      FROMAT 0.3s · DURATION 1.1s
    </div>
    <FilmLook frame={lf} grain={0.12} />
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
      {index === 6 ? <LottieSeg lf={lf} fps={fps} /> : null}
      {index === 7 ? <MorphSeg lf={lf} fps={fps} /> : null}
      <Caption index={index} />
      <Dots index={index} />
    </AbsoluteFill>
  );
};
