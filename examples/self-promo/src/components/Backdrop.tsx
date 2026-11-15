import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../lib/theme";
import { beatAt, ramp } from "../lib/anim";
import { BPM, BEAT_OFFSET } from "../lib/timing";

type Props = {
  /** 强调色，默认取 theme.accent */
  accent?: string;
  /** 网格淡入进度（0~1），转场时可以让它跟着走 */
  gridIn?: number;
  /** 是否随拍呼吸，默认开 */
  breathe?: boolean;
};

/**
 * 全片通用的底：径向光 + 网格 + 暗角 + 缓慢漂移的光斑。
 * 纯 CSS + 由 frame 算出的位移，保证逐帧确定性。
 */
export const Backdrop: React.FC<Props> = ({ accent = theme.accent, gridIn = 1, breathe = true }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const drift = Math.sin(frame / (fps * 6)) * 40;
  const pulse = breathe ? beatAt(frame, fps, BPM, BEAT_OFFSET) : 0;
  const glow = 0.16 + pulse * 0.1;
  const gridAlpha = 0.055 * ramp(frame, 0, 18) * gridIn;

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg }}>
      {/* 底色渐变 */}
      <AbsoluteFill
        style={{
          background: `linear-gradient(160deg, #0b0f15 0%, ${theme.bg} 55%, ${theme.bgDeep} 100%)`,
        }}
      />

      {/* 两处径向光，随拍呼吸 */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(1200px 700px at ${72 + drift / 8}% 26%, ${accent}${Math.round(
            glow * 255,
          )
            .toString(16)
            .padStart(2, "0")}, transparent 62%),
            radial-gradient(900px 600px at ${18 - drift / 10}% 96%, ${theme.blue}, transparent 65%)`,
        }}
      />

      {/* 网格 */}
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(to right, rgba(255,255,255,${gridAlpha}) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,${gridAlpha}) 1px, transparent 1px)`,
          backgroundSize: "80px 80px",
          maskImage: "radial-gradient(78% 68% at 50% 42%, #000 26%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(78% 68% at 50% 42%, #000 26%, transparent 100%)",
        }}
      />

      {/* 暗角 */}
      <AbsoluteFill
        style={{
          background: "radial-gradient(120% 100% at 50% 50%, transparent 45%, rgba(0,0,0,0.55) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};
