import React from "react";
import { AbsoluteFill, Composition, Sequence, useVideoConfig } from "remotion";
import { Cta } from "./scenes/Cta";
import { EffectsLab, SEG_FRAMES, SEGMENTS } from "./scenes/EffectsLab";
import { Flip, Flip4k, FlipCalm, FlipCalm4k, flipLabFrames } from "./scenes/FlipLab";
import { Hook } from "./scenes/Hook";
import { Showcase } from "./scenes/Showcase";
import { Soundtrack } from "./Soundtrack";
import { Subtitles } from "./Subtitles";
import { theme } from "./lib/theme";
import { HEIGHT, TOTAL_FRAMES, WIDTH, FPS, sceneRange, timing, type Scene } from "./lib/timing";

/**
 * layout 名 → 组件。timing.json 里写了不存在的 layout 会直接抛错，
 * 不要静默跳过——静默跳过最后表现为「这十几秒是黑的」，很难查。
 */
const LAYOUTS: Record<string, React.FC<{ sc: Scene }>> = {
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
              {Comp ? <Comp sc={sc} /> : <Missing layout={sc.layout} />}
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
      {/* effect kit 的样板间：八段各 3 秒，跟 timing.json 无关。
          时长按 SEGMENTS.length * SEG_FRAMES 算（8 × 90 = 720 帧 = 24 秒 @30fps），
          加段只改 EffectsLab 的 SEGMENTS，不用回来手改数字。 */}
      <Composition
        id="Effects"
        component={EffectsLab}
        durationInFrames={SEGMENTS.length * SEG_FRAMES}
        fps={30}
        width={WIDTH}
        height={HEIGHT}
      />
      {/* 翻转瀑布流字幕样板间：两版参数各一条，跟 timing.json 无关。
          时长从拍数算（见 FlipLab.tsx 的 flipLabFrames），不写魔数。
          npx remotion render src/index.ts Flip out/flip.mp4 */}
      <Composition
        id="Flip"
        component={Flip}
        durationInFrames={flipLabFrames(0.34, 0.2)}
        fps={30}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="FlipCalm"
        component={FlipCalm}
        durationInFrames={flipLabFrames(0.62, 0.35)}
        fps={30}
        width={WIDTH}
        height={HEIGHT}
      />
      {/* 4K 参照：验锚点在 3840×2160 下没跑出画面外（组件内一律用 lib/timing 的 HEIGHT） */}
      <Composition
        id="Flip4k"
        component={Flip4k}
        durationInFrames={flipLabFrames(0.34, 0.2)}
        fps={30}
        width={3840}
        height={2160}
      />
      <Composition
        id="FlipCalm4k"
        component={FlipCalm4k}
        durationInFrames={flipLabFrames(0.62, 0.35)}
        fps={30}
        width={3840}
        height={2160}
      />
    </>
  );
};
