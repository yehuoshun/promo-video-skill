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
 * 全片通用的底：浅色纸面 + 右上角一团语雀绿光晕 + 极淡网格 + 纸边阴影。
 * 纯 CSS + 由 frame 算出的位移，逐帧确定性（渲染器并行抓帧不会漂）。
 *
 * 和上一支（深色霓虹）的区别：这里的光是「纸被灯照亮」，不是「屏幕在发光」，
 * 所以光晕 alpha 压得很低（0.10 上下），网格用墨色而不是白色。
 */
export const Backdrop: React.FC<Props> = ({ accent = theme.accent, gridIn = 1, breathe = true }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const drift = Math.sin(frame / (fps * 6)) * 40;
  const pulse = breathe ? beatAt(frame, fps, BPM, BEAT_OFFSET) : 0;
  const glow = 0.10 + pulse * 0.05;
  const gridAlpha = 0.045 * ramp(frame, 0, 18) * gridIn;

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg }}>
      {/* 底：自上而下的纸面色差，别做成纯平 */}
      <AbsoluteFill
        style={{
          background: `linear-gradient(168deg, #ffffff 0%, ${theme.bg} 52%, ${theme.bgDeep} 100%)`,
        }}
      />

      {/* 两处柔光：右上语雀绿、左下更淡的同色 */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(1100px 760px at ${74 + drift / 8}% 18%, ${accent}${Math.round(
            glow * 255,
          )
            .toString(16)
            .padStart(2, "0")}, transparent 64%),
            radial-gradient(820px 620px at ${16 - drift / 10}% 92%, rgba(0,185,107,0.05), transparent 68%)`,
        }}
      />

      {/* 网格：墨色细线，用径向遮罩让它只在中间可见 */}
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(to right, rgba(29,33,41,${gridAlpha}) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(29,33,41,${gridAlpha}) 1px, transparent 1px)`,
          backgroundSize: "72px 72px",
          maskImage: "radial-gradient(76% 66% at 50% 44%, #000 24%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(76% 66% at 50% 44%, #000 24%, transparent 100%)",
        }}
      />

      {/* 纸边：四周一圈极淡的暖灰，别用黑色暗角（浅底上加黑会脏） */}
      <AbsoluteFill
        style={{
          background: "radial-gradient(126% 104% at 50% 50%, transparent 58%, rgba(29,33,41,0.055) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};