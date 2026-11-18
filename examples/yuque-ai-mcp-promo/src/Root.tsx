import React from "react";
import { AbsoluteFill, Composition, Sequence, useVideoConfig } from "remotion";
import { ContrastNum } from "./scenes/ContrastNum";
import { Cover } from "./scenes/Cover";
import { CtaDoc } from "./scenes/CtaDoc";
import { DomainsGrid } from "./scenes/DomainsGrid";
import { EffectsLab, SEG_FRAMES, SEGMENTS } from "./scenes/EffectsLab";
import { GapsBoard } from "./scenes/GapsBoard";
import { HookDoc } from "./scenes/HookDoc";
import { ShotFrame } from "./scenes/ShotFrame";
import { Soundtrack } from "./Soundtrack";
import { Subtitles } from "./Subtitles";
import { VH, VW, theme } from "./lib/theme";
import { HEIGHT, TOTAL_FRAMES, WIDTH, FPS, sceneRange, timing, type Scene } from "./lib/timing";

/**
 * layout 名 → 组件。timing.json 里写了不存在的 layout 会直接抛错，
 * 不要静默跳过——静默跳过最后表现为「这十几秒是黑的」，很难查。
 */
const LAYOUTS: Record<string, React.FC<{ sc: Scene; vertical?: boolean }>> = {
  // 本片六个版式：横版按 1920×1080 摆，竖版按 1080×1920 重排（不裁切横版）
  "hook-doc": HookDoc,
  "contrast-num": ContrastNum,
  "shot-frame": ShotFrame,
  "domains-grid": DomainsGrid,
  "gaps-board": GapsBoard,
  "cta-doc": CtaDoc,
};

const Missing: React.FC<{ layout: string }> = ({ layout }) => (
  <AbsoluteFill
    style={{
      background: "#2a0d0d",
      color: "#ffd7d7",
      fontFamily: theme.mono,
      fontSize: 40,
      padding: 80,
      justifyContent: "center",
    }}
  >
    timing.json 里的 layout="{layout}" 没有对应组件。
    {"\n"}在 src/Root.tsx 的 LAYOUTS 里注册，或在 timing.json 里改掉。
  </AbsoluteFill>
);

/**
 * 4K 用 zoom 整体放大而不是逐处改字号：
 * 布局仍按 1920×1080 写，渲染时整块放大到 3840×2160。
 * 好处是只用维护一套尺寸；代价是极细的 1px 边框会变成 2px。
 *
 * 竖版同理：版式按 1080×1920 写，zoom = 输出宽 / 1080。
 * 两个版本的 scenes 时间轴是同一份 timing.json，只有排版不同。
 */
const Video: React.FC<{ vertical?: boolean }> = ({ vertical = false }) => {
  const { width } = useVideoConfig();
  const baseW = vertical ? VW : WIDTH;
  const baseH = vertical ? VH : HEIGHT;
  const zoom = width / baseW;

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg }}>
      <div
        style={{
          width: baseW,
          height: baseH,
          position: "relative",
          overflow: "hidden",
          zoom,
        }}
      >
        {timing.scenes.map((sc) => {
          const Comp = LAYOUTS[sc.layout];
          const { from, durationInFrames } = sceneRange(sc);
          return (
            <Sequence key={sc.id} from={from} durationInFrames={durationInFrames} name={sc.id}>
              {Comp ? <Comp sc={sc} vertical={vertical} /> : <Missing layout={sc.layout} />}
            </Sequence>
          );
        })}
        {/* 字幕放在 zoom 容器里，跟画面一起放大；它只读 timing.json 的 voiceLines */}
        <Subtitles />
      </div>
      {/* 音轨不进 zoom 容器：声音没有像素尺寸，放外面更贴近「一条独立的轨」 */}
      <Soundtrack />
    </AbsoluteFill>
  );
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Main"
        component={Video}
        durationInFrames={TOTAL_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="Main4k"
        component={Video}
        durationInFrames={TOTAL_FRAMES}
        fps={FPS}
        width={3840}
        height={2160}
      />
      {/* 竖版：同一个 timing.json、同一段音乐，版式按 1080×1920 重排 */}
      <Composition
        id="Vertical"
        component={Video}
        defaultProps={{ vertical: true }}
        durationInFrames={TOTAL_FRAMES}
        fps={FPS}
        width={VW}
        height={VH}
      />
      {/* 三张封面：同一套零件、同一份 publish.json 文案，只换画布比例 */}
      <Composition
        id="Cover169"
        component={Cover}
        defaultProps={{ w: 1920, h: 1080 }}
        durationInFrames={1}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="Cover916"
        component={Cover}
        defaultProps={{ w: 1080, h: 1920 }}
        durationInFrames={1}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="Cover34"
        component={Cover}
        defaultProps={{ w: 1080, h: 1440 }}
        durationInFrames={1}
        fps={30}
        width={1080}
        height={1440}
      />
      {/* effect kit 的样板间：八段各 3 秒，跟 timing.json 无关。
          它还是深色版（模板自带），只当零件库看，不进成片。 */}
      <Composition
        id="Effects"
        component={EffectsLab}
        durationInFrames={SEGMENTS.length * SEG_FRAMES}
        fps={30}
        width={WIDTH}
        height={HEIGHT}
      />
    </>
  );
};