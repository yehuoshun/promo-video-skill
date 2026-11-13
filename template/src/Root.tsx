import React from "react";
import { AbsoluteFill, Composition, Sequence, useVideoConfig } from "remotion";
import { Cta } from "./scenes/Cta";
import { EffectsLab } from "./scenes/EffectsLab";
import { Hook } from "./scenes/Hook";
import { Showcase } from "./scenes/Showcase";
import { Soundtrack } from "./Soundtrack";
import { theme } from "./lib/theme";
import { HEIGHT, TOTAL_FRAMES, WIDTH, FPS, sceneRange, timing } from "./lib/timing";

/**
 * layout 名 → 组件。timing.json 里写了不存在的 layout 会直接抛错，
 * 不要静默跳过——静默跳过最后表现为「这十几秒是黑的」，很难查。
 */
const LAYOUTS: Record<string, React.FC> = {
  "big-type": Hook,
  "browser-frame": Showcase,
  "cta-full": Cta,
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
 */
const Video: React.FC = () => {
  const { width } = useVideoConfig();
  const zoom = width / WIDTH;

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg }}>
      <div
        style={{
          width: WIDTH,
          height: HEIGHT,
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
              {Comp ? <Comp /> : <Missing layout={sc.layout} />}
            </Sequence>
          );
        })}
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
      {/* effect kit 的样板间：六段各 3 秒，跟 timing.json 无关 */}
      <Composition
        id="Effects"
        component={EffectsLab}
        durationInFrames={540}
        fps={30}
        width={WIDTH}
        height={HEIGHT}
      />
    </>
  );
};
